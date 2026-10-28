import type { Vec2 } from '../../sim/types';
import type { SpeciesDefinition } from '../../data/schemas';
import { membraneContour } from '../../sim/membrane';
import type { EngulfVisual } from './engulf-animation';
import { smooth } from './engulf-animation';

const rotate = (p: Vec2, angle: number): Vec2 => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) });
const mix = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const cubic = (a: Vec2, b: Vec2, c: Vec2, d: Vec2, t: number): Vec2 => mix(mix(mix(a, b, t), mix(b, c, t), t), mix(mix(b, c, t), mix(c, d, t), t), t);

export interface PseudopodGeometry { outline: Vec2[]; streams: Vec2[][]; pocket: { center: Vec2; radiusX: number; radiusY: number; rotation: number } }

// Build a single connected silhouette: the back of the original membrane, two
// tapered pseudopods with rounded tips, and the open feeding cup between them.
// Coordinates stay local to the hunter; no physics or hit boxes are modified.
export function pseudopodGeometry(radius: number, heading: number, stretch: number, time: number, visual: EngulfVisual, preyShape: SpeciesDefinition['visual']['shape']): PseudopodGeometry {
  const angle = Math.atan2(visual.offset.y, visual.offset.x), relative = angle - heading;
  const body = membraneContour(radius, time, stretch).map(p => rotate(p, -relative));
  const d = Math.hypot(visual.offset.x, visual.offset.y);
  const prey = membraneContour(visual.prey.radius * visual.preyScale, time, visual.prey.stretch, preyShape).map(p => rotate(p, visual.prey.heading - angle));
  const rx = Math.max(...prey.map(p => Math.abs(p.x))) + 4, ry = Math.max(...prey.map(p => Math.abs(p.y))) + 4;
  const pocket = { center: rotate({ x: d, y: 0 }, relative), radiusX: rx, radiusY: ry, rotation: relative };
  const convert = (points: Vec2[]) => points.map(p => rotate(p, relative));
  if (visual.progress >= 0.97 && d < radius * 1.25) {
    // Once the food vacuole reaches the cell, merge its small surface bulge back
    // into the original wobbly membrane, preserving the rest of the outline.
    const outline = body.map(p => {
      const length = Math.hypot(p.x, p.y), cx = p.x / length, cy = p.y / length;
      const ex = rx + radius * 0.11, ey = ry + radius * 0.11;
      const a = cx * cx / (ex * ex) + cy * cy / (ey * ey), b = -2 * cx * d / (ex * ex), c = d * d / (ex * ex) - 1;
      const discriminant = b * b - 4 * a * c;
      const outer = discriminant >= 0 ? (-b + Math.sqrt(discriminant)) / (2 * a) : 0;
      return { x: cx * Math.max(length, outer), y: cy * Math.max(length, outer) };
    });
    return { outline: convert(outline), streams: [], pocket };
  }
  if (visual.progress < 0.005) return { outline: convert(body), streams: [], pocket };
  const boundary = (angle: number) => {
    const ray = { x: Math.cos(angle), y: Math.sin(angle) };
    let distance = radius;
    for (let i = 0; i < body.length; i++) {
      const a = body[i], b = body[(i + 1) % body.length], edge = { x: b.x - a.x, y: b.y - a.y };
      const denominator = ray.x * edge.y - ray.y * edge.x;
      if (Math.abs(denominator) < 1e-8) continue;
      const t = (a.x * edge.y - a.y * edge.x) / denominator, u = (a.x * ray.y - a.y * ray.x) / denominator;
      if (t >= 0 && u >= 0 && u <= 1) { distance = t; break; }
    }
    return { x: ray.x * distance, y: ray.y * distance };
  };
  const extent = smooth(visual.progress / 0.32), wrap = smooth((visual.progress - 0.24) / 0.7);
  const branches: Vec2[][] = [], streams: Vec2[][] = [], outerEdges: Vec2[][] = [];
  for (const side of [-1, 1]) {
    const outerRoot = boundary(side * 1.03), innerRoot = boundary(side * 0.12), root = mix(outerRoot, innerRoot, 0.5);
    const startAngle = side * 2.25;
    const end = { x: d + Math.cos(startAngle) * rx, y: Math.sin(startAngle) * ry };
    const gap = Math.max(radius * 0.25, end.x - root.x);
    const c1 = { x: root.x + gap * 0.45, y: root.y + side * radius * 0.17 };
    const c2 = { x: end.x - gap * 0.25, y: end.y + side * Math.min(radius * 0.2, gap * 0.2) };
    const path = Array.from({ length: 18 }, (_, i) => cubic(root, c1, c2, end, i / 17 * extent));
    const tipWidth = Math.max(2, radius * 0.11);
    const endAngle = side * (2.25 - wrap * (2.25 - Math.atan2(tipWidth + 0.5, ry)));
    if (extent >= 0.999) for (let i = 1; i <= 32; i++) {
      const a = startAngle + (endAngle - startAngle) * i / 32;
      path.push({ x: d + Math.cos(a) * rx, y: Math.sin(a) * ry });
    }
    const outside: Vec2[] = [], inside: Vec2[] = [];
    const rootWidth = Math.hypot(outerRoot.x - innerRoot.x, outerRoot.y - innerRoot.y) / 2;
    let normal = { x: 0, y: side };
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      normal = { x: -side * (b.y - a.y) / length, y: side * (b.x - a.x) / length };
      const width = tipWidth + (rootWidth - tipWidth) * (1 - smooth(Math.min(1, i / 17)));
      outside.push({ x: path[i].x + normal.x * width, y: path[i].y + normal.y * width });
      inside.push({ x: path[i].x - normal.x * width, y: path[i].y - normal.y * width });
    }
    outside[0] = outerRoot; inside[0] = innerRoot;
    outerEdges.push(outside);
    const tip = path[path.length - 1], start = Math.atan2(normal.y, normal.x);
    const cap = Array.from({ length: 9 }, (_, i) => ({ x: tip.x + Math.cos(start - side * Math.PI * i / 8) * tipWidth, y: tip.y + Math.sin(start - side * Math.PI * i / 8) * tipWidth }));
    const branch = [...outside, ...cap.slice(1), ...inside.reverse().slice(1)];
    // Grow out of the existing surface rather than abruptly cutting a deep cup
    // into it on the first frame, when the pseudopods are still very short.
    branches.push(branch.map((p, i) => mix(boundary(side * (1.03 - 0.91 * i / (branch.length - 1))), p, smooth(visual.progress / 0.2))));
    streams.push(path);
  }
  const back = body.filter(p => Math.abs(Math.atan2(p.y, p.x)) >= 1.03).sort((a, b) => {
    const angle = (p: Vec2) => (Math.atan2(p.y, p.x) + Math.PI * 2) % (Math.PI * 2);
    return angle(a) - angle(b);
  });
  const front = body.filter(p => Math.abs(Math.atan2(p.y, p.x)) < 0.12).sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  if (visual.progress >= 0.97) {
    const upperTip = outerEdges[0][outerEdges[0].length - 1], lowerTip = outerEdges[1][outerEdges[1].length - 1];
    const arc = Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      return { x: upperTip.x + Math.sin(t * Math.PI) * radius * 0.035, y: upperTip.y + (lowerTip.y - upperTip.y) * t };
    });
    return { outline: convert([boundary(1.03), ...back, ...outerEdges[0], ...arc, ...outerEdges[1].reverse()]), streams: [], pocket };
  }
  const outline = [boundary(1.03), ...back, ...branches[0], ...front, ...branches[1].reverse()];
  return { outline: convert(outline), streams: streams.map(convert), pocket };
}
