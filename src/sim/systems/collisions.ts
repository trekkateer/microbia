import { membraneContour } from '../membrane';
import type { PlayerState, Vec2, World } from '../types';

// Convex envelopes follow the actual membrane (including stretch and rotation).
// Tiny concave membrane folds remain solid instead of interlocking two cells.
export function bodyHull(world: Pick<World, 'tick' | 'roster'>, actor: PlayerState): Vec2[] {
  return actorGeometry(world, actor).points.map(p => ({ x: p.x + actor.x, y: p.y + actor.y }));
}

const shapeGeometries = new Map<string, HullGeometry>();
function actorGeometry(world: Pick<World, 'tick' | 'roster'>, actor: PlayerState): HullGeometry {
  const shape = world.roster[actor.speciesId].visual.shape;
  const rigid = shape === 'diatom' || shape === 'flagellate';
  const key = rigid ? shape : shape + ':' + world.tick + ':' + (shape === 'amoeboid' ? actor.stretch : 0);
  let base = shapeGeometries.get(key);
  if (!base) {
    const points = membraneContour(1, world.tick / 30, actor.stretch, shape).sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const lower: Vec2[] = [], upper: Vec2[] = [];
    for (const p of points) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    base = geometry([...lower.slice(0, -1), ...upper.slice(0, -1)]);
    if (shapeGeometries.size >= 256) shapeGeometries.clear();
    shapeGeometries.set(key, base);
  }
  const cos = Math.cos(actor.heading), sin = Math.sin(actor.heading), r = actor.radius;
  const rotated = base.points.map(p => ({ x: (p.x * cos - p.y * sin) * r, y: (p.x * sin + p.y * cos) * r }));
  let first = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < rotated.length; i++) {
    const p = rotated[i];
    if (p.x < rotated[first].x || (p.x === rotated[first].x && p.y < rotated[first].y)) first = i;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const points = rotated.slice(first).concat(rotated.slice(0, first)), axes = new Float64Array(base.axes.length);
  for (let i = 0; i < points.length; i++) {
    const source = (i + first) % points.length * 4, dest = i * 4;
    axes[dest] = base.axes[source] * cos - base.axes[source + 1] * sin;
    axes[dest + 1] = base.axes[source] * sin + base.axes[source + 1] * cos;
    axes[dest + 2] = base.axes[source + 2] * r; axes[dest + 3] = base.axes[source + 3] * r;
  }
  return { points, axes, minX, maxX, minY, maxY };
}

// Project once per pair; translation during collision resolution only shifts
// intervals. Rotating calipers find support vertices in linear time, preserving
// every edge of the detailed convex membrane rather than simplifying its shape.
function supportIndex(points: Vec2[], index: number, x: number, y: number, first: boolean): number {
  let best = points[index].x * x + points[index].y * y;
  if (first) {
    for (let j = 1; j < points.length; j++) {
      const value = points[j].x * x + points[j].y * y;
      if (value > best) { index = j; best = value; }
    }
  } else {
    for (let j = 0; j < points.length - 1; j++) {
      const next = (index + 1) % points.length;
      const value = points[next].x * x + points[next].y * y;
      if (value < best) break;
      index = next; best = value;
    }
  }
  return index;
}

interface HullGeometry { points: Vec2[]; axes: Float64Array; minX: number; maxX: number; minY: number; maxY: number }
interface PairProjection { axes: Float64Array; complete: boolean; lastAxis: number }

function geometry(points: Vec2[]): HullGeometry {
  const axes = new Float64Array(points.length * 4);
  let minIndex = 0, maxIndex = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const x = -(q.y - p.y) / length, y = (q.x - p.x) / length;
    minIndex = supportIndex(points, minIndex, -x, -y, i === 0);
    maxIndex = supportIndex(points, maxIndex, x, y, i === 0);
    axes[i * 4] = x; axes[i * 4 + 1] = y;
    axes[i * 4 + 2] = points[minIndex].x * x + points[minIndex].y * y;
    axes[i * 4 + 3] = points[maxIndex].x * x + points[maxIndex].y * y;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { points, axes, minX, maxX, minY, maxY };
}

// Cache each hull's own projections once. Non-contact pairs stop as soon as
// one separating axis is found; that partial projection stays a valid rejection
// until translation closes the gap, at which point we complete/recheck it.
function projectPair(a: HullGeometry, b: HullGeometry, dx = 0, dy = 0, padding = 1.5): PairProjection {
  const axes = new Float64Array(a.axes.length + b.axes.length);
  let count = 0;
  for (let side = 0; side < 2; side++) {
    const own = side === 0 ? a : b, other = side === 0 ? b : a;
    let minIndex = 0, maxIndex = 0;
    for (let i = 0; i < own.axes.length; i += 4) {
      const x = own.axes[i], y = own.axes[i + 1];
      minIndex = supportIndex(other.points, minIndex, -x, -y, i === 0);
      maxIndex = supportIndex(other.points, maxIndex, x, y, i === 0);
      const minOther = other.points[minIndex].x * x + other.points[minIndex].y * y;
      const maxOther = other.points[maxIndex].x * x + other.points[maxIndex].y * y;
      const forward = side === 0 ? own.axes[i + 3] - minOther : maxOther - own.axes[i + 2];
      const backward = side === 0 ? maxOther - own.axes[i + 2] : own.axes[i + 3] - minOther;
      axes[count++] = x; axes[count++] = y; axes[count++] = forward; axes[count++] = backward;
      const offset = dx * x + dy * y;
      if (forward - offset + padding <= 0 || backward + offset + padding <= 0) return { axes: axes.subarray(0, count), complete: false, lastAxis: count - 4 };
    }
  }
  return { axes, complete: true, lastAxis: 0 };
}

function projectedPenetration(projection: PairProjection, dx: number, dy: number, padding: number): Vec2 | null {
  const axes = projection.axes, last = projection.lastAxis;
  const offset = dx * axes[last] + dy * axes[last + 1];
  // The previous contact normal is usually still the separating axis after a
  // correction. Try it first without changing stable minimum-depth tie order.
  if (axes[last + 2] - offset + padding <= 0 || axes[last + 3] + offset + padding <= 0) return null;
  let depth = Infinity, nx = 0, ny = 0;
  for (let i = 0; i < axes.length; i += 4) {
    const x = axes[i], y = axes[i + 1], offset = dx * x + dy * y;
    const forward = axes[i + 2] - offset + padding, backward = axes[i + 3] + offset + padding;
    if (forward <= 0 || backward <= 0) { projection.lastAxis = i; return null; }
    const overlap = Math.min(forward, backward);
    if (overlap < depth) { projection.lastAxis = i; depth = overlap; const sign = forward < backward ? 1 : -1; nx = x * sign; ny = y * sign; }
  }
  return { x: nx * depth, y: ny * depth };
}

export function penetration(a: Vec2[], b: Vec2[], padding = 1.5): Vec2 | null {
  return projectedPenetration(projectPair(geometry(a), geometry(b), 0, 0, padding), 0, 0, padding);
}

interface CachedHull extends HullGeometry { radius: number; heading: number; stretch: number; shape: string }
interface CollisionCache { tick: number; hulls: Map<string, CachedHull>; pairs: Map<string, { a: CachedHull; b: CachedHull; projection: PairProjection }> }
const collisionCaches = new WeakMap<World, CollisionCache>();

function collisionCache(world: World): CollisionCache {
  let cache = collisionCaches.get(world);
  if (!cache || cache.tick !== world.tick) {
    cache = { tick: world.tick, hulls: new Map(), pairs: new Map() };
    collisionCaches.set(world, cache);
  }
  return cache;
}
function keepInside(world: World, actor: PlayerState, shape: HullGeometry): void {
  const margin = actor.radius * 1.4 + 2;
  if (actor.x > margin && actor.y > margin && actor.x < world.arena.map.width - margin && actor.y < world.arena.map.height - margin) return;
  const minX = actor.x + shape.minX, maxX = actor.x + shape.maxX;
  const minY = actor.y + shape.minY, maxY = actor.y + shape.maxY;
  actor.x += Math.max(0, 1 - minX) - Math.max(0, maxX - world.arena.map.width + 1);
  actor.y += Math.max(0, 1 - minY) - Math.max(0, maxY - world.arena.map.height + 1);
}

export function resolveBodies(world: World): Set<string> {
  const actors = [world.player, ...world.organisms].filter(p => p.alive);
  const contacts = new Set<string>();
  // A tick can contain several movement substeps and divisions. Reuse local
  // geometry across them, invalidating individual shapes after growth/turning.
  const cache = collisionCache(world);
  const hull = (actor: PlayerState) => {
    const shape = world.roster[actor.speciesId].visual.shape;
    let entry = cache.hulls.get(actor.id);
    if (!entry || entry.radius !== actor.radius || entry.heading !== actor.heading || entry.stretch !== actor.stretch || entry.shape !== shape) {
      entry = { radius: actor.radius, heading: actor.heading, stretch: actor.stretch, shape, ...actorGeometry(world, actor) };
      cache.hulls.set(actor.id, entry);
    }
    return entry;
  };
  const hulls = actors.map(hull);
  for (let iteration = 0; iteration < 12; iteration++) {
    let changed = false;
    for (let i = 0; i < actors.length; i++) keepInside(world, actors[i], hulls[i]);
    // Sweep conservative bounds instead of testing every pair in a large pond.
    // Rebuild after each positional pass so pushed cells acquire new neighbors.
    const sorted = actors.map((p, index) => ({ index, left: p.x + hulls[index].minX - 1.5, right: p.x + hulls[index].maxX + 1.5 }))
      .sort((a, b) => a.left - b.left || a.index - b.index);
    const candidates: number[] = [];
    for (let a = 0; a < sorted.length; a++) for (let b = a + 1; b < sorted.length && sorted[b].left <= sorted[a].right; b++) {
      const i = Math.min(sorted[a].index, sorted[b].index), j = Math.max(sorted[a].index, sorted[b].index);
      if (actors[i].y + hulls[i].maxY + 1.5 >= actors[j].y + hulls[j].minY && actors[j].y + hulls[j].maxY + 1.5 >= actors[i].y + hulls[i].minY) candidates.push(i * actors.length + j);
    }
    candidates.sort((a, b) => a - b);
    for (const pairId of candidates) {
      const i = Math.floor(pairId / actors.length), j = pairId % actors.length;
      const a = actors[i], b = actors[j];
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > ((a.radius + b.radius) * 1.4 + 2) ** 2) continue;
      const ah = hulls[i], bh = hulls[j], dx = b.x - a.x, dy = b.y - a.y;
      if (ah.maxX + 1.5 <= bh.minX + dx || bh.maxX + dx + 1.5 <= ah.minX || ah.maxY + 1.5 <= bh.minY + dy || bh.maxY + dy + 1.5 <= ah.minY) continue;
      const key = `${a.id}|${b.id}`;
      let pair = cache.pairs.get(key);
      if (!pair || pair.a !== ah || pair.b !== bh) {
        pair = { a: ah, b: bh, projection: projectPair(ah, bh, dx, dy) }; cache.pairs.set(key, pair);
      }
      let overlap = projectedPenetration(pair.projection, dx, dy, 1.5);
      if (overlap && !pair.projection.complete) {
        pair.projection = projectPair(ah, bh, dx, dy);
        overlap = projectedPenetration(pair.projection, dx, dy, 1.5);
      }
      if (!overlap) continue;
      contacts.add(contactKey(a, b));
      if (Math.hypot(overlap.x, overlap.y) < 0.001) continue;
      const shareA = b.mass / (a.mass + b.mass), shareB = 1 - shareA;
      a.x -= overlap.x * shareA; a.y -= overlap.y * shareA;
      b.x += overlap.x * shareB; b.y += overlap.y * shareB;
      changed = true;
    }
    if (!changed) break;
  }
  for (let i = 0; i < actors.length; i++) keepInside(world, actors[i], hulls[i]);
  return contacts;
}

export const contactKey = (a: PlayerState, b: PlayerState) => [a.id, b.id].sort().join('|');

export function moveBodies(world: World, movements: Map<string, Vec2>): void {
  const actors = [world.player, ...world.organisms].filter(p => p.alive);
  const minRadius = Math.min(...actors.map(p => p.radius));
  const maximumTravel = Math.max(0, ...actors.map(p => Math.hypot(movements.get(p.id)?.x ?? 0, movements.get(p.id)?.y ?? 0)));
  // Subdivide both normal motion and knockback; a lunge cannot tunnel through a cell.
  const steps = Math.max(1, Math.ceil(maximumTravel / Math.max(1, minRadius * 0.25)));
  world.contacts.clear();
  for (const actor of actors) actor.motionPath = [{ x: actor.x, y: actor.y }];
  for (let substep = 0; substep < steps; substep++) {
    for (const actor of actors) { const movement = movements.get(actor.id); if (movement) { actor.x += movement.x / steps; actor.y += movement.y / steps; } }
    for (const key of resolveBodies(world)) world.contacts.add(key);
    for (const actor of actors) actor.motionPath.push({ x: actor.x, y: actor.y });
  }
}

export function interpolatedPosition(actor: PlayerState, alpha: number): Vec2 {
  const path = actor.motionPath;
  if (path.length < 2) return actor;
  const position = Math.max(0, Math.min(1, alpha)) * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(position)), t = position - index;
  return { x: path[index].x + (path[index + 1].x - path[index].x) * t, y: path[index].y + (path[index + 1].y - path[index].y) * t };
}
