import { expect, it } from 'vitest';
import { organisms } from '../src/data';
import { createOrganism, createWorld } from '../src/sim/world';
import { bodyHull, penetration, resolveBodies } from '../src/sim/systems/collisions';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import type { Vec2 } from '../src/sim/types';
import { worldContour } from '../src/sim/membrane';

// Independent exhaustive SAT reference guards the faster support-vertex walk.
function reference(a: Vec2[], b: Vec2[]) {
  let depth = Infinity;
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const x = -(q.y - p.y) / length, y = (q.x - p.x) / length;
    const aa = a.map(p => p.x * x + p.y * y), bb = b.map(p => p.x * x + p.y * y);
    const overlap = Math.min(Math.max(...aa) - Math.min(...bb), Math.max(...bb) - Math.min(...aa)) + 1.5;
    if (overlap <= 0) return null;
    depth = Math.min(depth, overlap);
  }
  return depth;
}

it('optimized collisions match exhaustive geometry across species, sizes, rotations and separation', () => {
  const w = createWorld(pond, amoeba), species = Object.values(organisms);
  for (let i = 0; i < 240; i++) {
    w.tick = i * 7;
    const a = createOrganism(species[i % 5], w.nutrition, 'a', 500, 500, 25 + i % 70);
    const b = createOrganism(species[Math.floor(i / 5) % 5], w.nutrition, 'b', 500 + (i % 11) * 12, 500 + (i % 7) * 8, 10 + i % 90);
    a.heading = i * 0.61; b.heading = -i * 0.37; a.stretch = (i % 10) / 100;
    const ah = bodyHull(w, a), bh = bodyHull(w, b), expected = reference(ah, bh), actual = penetration(ah, bh);
    if (expected === null) expect(actual).toBeNull();
    else { expect(actual).not.toBeNull(); expect(Math.hypot(actual!.x, actual!.y)).toBeCloseTo(expected, 7); }
  }
});

it('shared hull templates match an independently built world-space convex envelope', () => {
  const w = createWorld(pond, amoeba), species = Object.values(organisms);
  const cross = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < 120; i++) {
    w.tick = i * 19;
    const s = species[i % species.length], actor = createOrganism(s, w.nutrition, 'shape', 300 + i, 400 - i, 10 + i);
    actor.heading = i * 0.317; actor.stretch = i % 11 / 100;
    const points = worldContour({ ...actor, time: w.tick / 30, shape: s.visual.shape }).sort((a, b) => a.x - b.x || a.y - b.y);
    const lower: Vec2[] = [], upper: Vec2[] = [];
    for (const p of points) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
    for (const p of [...points].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
    const expected = lower.slice(0, -1).concat(upper.slice(0, -1)), actual = bodyHull(w, actor);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((p, j) => { expect(p.x).toBeCloseTo(expected[j].x, 8); expect(p.y).toBeCloseTo(expected[j].y, 8); });
  }
});

it('cached separating axes cannot hide later contacts during the same tick', () => {
  const w = createWorld({ ...pond, practiceTargets: [] }, amoeba), species = Object.values(organisms);
  w.organisms = [createOrganism(species[1], w.nutrition, 'neighbor', 1100, 1000, 35)];
  const a = w.player, b = w.organisms[0]; a.x = 1000; a.y = 1000;
  a.heading = 0.7; b.heading = -0.9;
  // Keep the same tick/cache, moving a previously separated pair into contact
  // from multiple directions, then compare with a completely uncached solve.
  for (let i = 0; i < 24; i++) {
    b.x = a.x + Math.cos(i * 0.4) * (i % 2 ? 20 : 75);
    b.y = a.y + Math.sin(i * 0.4) * (i % 2 ? 20 : 75);
    const fresh = structuredClone(w);
    resolveBodies(w); resolveBodies(fresh);
    for (const [actual, expected] of [[w.player, fresh.player], [w.organisms[0], fresh.organisms[0]]]) {
      expect(actual.x).toBeCloseTo(expected.x, 8); expect(actual.y).toBeCloseTo(expected.y, 8);
    }
    expect(penetration(bodyHull(w, a), bodyHull(w, b), 0)).toBeNull();
  }
});
