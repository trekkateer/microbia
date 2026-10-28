import type { Vec2 } from './types';
import type { SpeciesDefinition } from '../data/schemas';

export interface MembranePose extends Vec2 { radius: number; heading: number; stretch: number; time: number; shape?: SpeciesDefinition['visual']['shape'] }

// Shape templates are independent of mass and position. Many cells share the
// same pose time; reuse their curve construction, then return fresh scaled points.
// Bound the cache so long rounds and many individual stretch values stay cheap.
const templates = new Map<string, Vec2[]>();

// One contour drives both visible geometry and food contact; no Pixi/browser dependencies.
export function membraneContour(radius: number, time: number, stretch: number, shape: MembranePose['shape'] = 'amoeboid'): Vec2[] {
  const rigid = shape === 'diatom' || shape === 'flagellate';
  const key = rigid ? shape : shape + ':' + time + ':' + (shape === 'amoeboid' ? stretch : 0);
  let contour = templates.get(key);
  if (!contour) {
    contour = buildContour(time, stretch, shape);
    if (templates.size >= 256) templates.clear();
    templates.set(key, contour);
  }
  return contour.map(p => ({ x: p.x * radius, y: p.y * radius }));
}

function buildContour(time: number, stretch: number, shape: MembranePose['shape']): Vec2[] {
  const radius = 1;
  const controls = Array.from({ length: 32 }, (_, i) => {
    const angle = i / 32 * Math.PI * 2;
    if (shape === 'diatom') return { x: Math.cos(angle) * radius * 1.3, y: Math.sin(angle) * radius * 0.4 * (0.65 + 0.35 * Math.abs(Math.sin(angle))) };
    if (shape === 'flagellate') return { x: Math.cos(angle) * radius * 1.2, y: Math.sin(angle) * radius * 0.55 * (0.85 + 0.15 * Math.cos(angle)) };
    if (shape !== 'amoeboid') return { x: Math.cos(angle) * radius * (shape === 'slipper' ? 1.25 : 1.05), y: Math.sin(angle) * radius * (shape === 'slipper' ? 0.65 : 0.85) * (1 + 0.03 * Math.sin(time * 2 + angle * 3)) };
    const wave = 1 + Math.sin(angle * 5 + time * 0.65) * 0.10 + Math.cos(angle * 3 - time * 0.42) * 0.08;
    return { x: Math.cos(angle) * radius * wave * (1 + stretch), y: Math.sin(angle) * radius * wave * (1 - stretch * 0.35) };
  });
  const contour: Vec2[] = [];
  for (let i = 0; i < controls.length; i++) {
    const prev = controls[(i + 31) % 32];
    const c = controls[i];
    const next = controls[(i + 1) % 32];
    const start = { x: (prev.x + c.x) / 2, y: (prev.y + c.y) / 2 };
    const end = { x: (c.x + next.x) / 2, y: (c.y + next.y) / 2 };
    for (let j = 0; j < 3; j++) {
      const t = j / 3;
      contour.push({ x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * c.x + t * t * end.x,
        y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * c.y + t * t * end.y });
    }
  }
  return contour;
}

export function worldContour(pose: MembranePose): Vec2[] {
  const cos = Math.cos(pose.heading), sin = Math.sin(pose.heading);
  return membraneContour(pose.radius, pose.time, pose.stretch, pose.shape).map(p => ({
    x: pose.x + p.x * cos - p.y * sin, y: pose.y + p.x * sin + p.y * cos,
  }));
}

export function segmentDistance(point: Vec2, a: Vec2, b: Vec2): number {
  return Math.sqrt(segmentDistanceSquared(point, a, b));
}

export function segmentDistanceSquared(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2;
}

function touchesPolygon(point: Vec2, radius: number, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (segmentDistanceSquared(point, a, b) <= radius * radius) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function membraneSweep(before: MembranePose, after: MembranePose): Vec2[][] {
  const angle = Math.atan2(Math.sin(after.heading - before.heading), Math.cos(after.heading - before.heading));
  return Array.from({ length: 4 }, (_, index) => {
    const t = index / 3;
    const mix = (a: number, b: number) => a + (b - a) * t;
    return worldContour({ shape: after.shape, x: mix(before.x, after.x), y: mix(before.y, after.y), radius: mix(before.radius, after.radius),
      time: mix(before.time, after.time), stretch: mix(before.stretch, after.stretch), heading: before.heading + angle * t });
  });
}

export function touchesMembraneSweep(point: Vec2, radius: number, contours: Vec2[][]): boolean {
  // Include the visible membrane stroke and sub-tick curve approximation tolerance.
  const contactRadius = radius + 1;
  for (const contour of contours) if (touchesPolygon(point, contactRadius, contour)) return true;
  for (let frame = 1; frame < contours.length; frame++) {
    const a = contours[frame - 1], b = contours[frame];
    for (let i = 0; i < a.length; i++) {
      const next = (i + 1) % a.length;
      if (touchesPolygon(point, contactRadius, [a[i], a[next], b[next], b[i]])) return true;
    }
  }
  return false;
}
