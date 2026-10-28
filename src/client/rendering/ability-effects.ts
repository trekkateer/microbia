import type { Graphics } from 'pixi.js';
import type { AbilityVisual } from './ability-animations';

export function drawAbilityEffect(g: Graphics, v: AbilityVisual, color: number, time: number): void {
  const p = v.position, r = v.radius, t = v.progress, fade = v.opacity;
  const cos = Math.cos(v.heading), sin = Math.sin(v.heading);
  const local = (x: number, y: number) => ({ x: p.x + cos * x - sin * y, y: p.y + sin * x + cos * y });
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, width: number, alpha: number, tint = color) =>
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: tint, width, alpha: alpha * fade });
  if (v.style === 'trichocysts') {
    // Staggered defensive darts emerge from the old membrane as the cell reverses.
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI * 2 / 28, phase = Math.max(0, Math.min(1, t * 1.6 - (i % 4) * 0.11));
      const dx = Math.cos(angle), dy = Math.sin(angle), travel = phase * (v.range + r * 0.55);
      const a = { x: v.origin.x + dx * (r + travel), y: v.origin.y + dy * (r * 0.7 + travel) };
      const b = { x: a.x + dx * (5 + phase * 12), y: a.y + dy * (5 + phase * 12) };
      line(a, b, 3, 0.13 * (1 - t * 0.4)); line(a, b, 1, 0.9 * (1 - t * 0.4));
      g.circle(b.x, b.y, 1.6).fill({ color: 0xe4ffff, alpha: fade * 0.65 });
    }
    for (let i = 0; i < 2; i++) g.ellipse(v.origin.x, v.origin.y, r * (1 + t * 1.7 + i * 0.16), r * (0.7 + t * 1.7 + i * 0.16))
      .stroke({ color, width: 1.5, alpha: fade * (1 - t * 0.75) * 0.25 });
  } else if (v.style === 'toxicysts') {
    for (let i = 1; i < v.trail.length; i++) line(v.trail[i - 1], v.trail[i], r * (0.12 + i / v.trail.length * 0.4), i / v.trail.length * 0.12);
    const mouth = local(r * 1.02, 0), pulse = 0.5 + Math.sin(time * 25) * 0.5;
    g.circle(mouth.x, mouth.y, r * (0.14 + pulse * 0.05)).fill({ color: 0xffceaf, alpha: fade * 0.25 })
      .stroke({ color: 0xffe0bd, width: 1.5, alpha: fade * 0.85 });
    const end = v.target && v.effect === 'capture' ? v.target : { x: mouth.x + v.direction.x * (v.range + r) * Math.sin(t * Math.PI / 2), y: mouth.y + v.direction.y * (v.range + r) * Math.sin(t * Math.PI / 2) };
    for (let i = -1; i <= 1; i++) {
      const offset = r * 0.13 * i;
      const x = end.x - v.direction.y * offset, y = end.y + v.direction.x * offset;
      g.moveTo(mouth.x - sin * offset, mouth.y + cos * offset)
        .quadraticCurveTo((mouth.x + x) / 2 - v.direction.y * Math.sin(time * 16 + i) * 5, (mouth.y + y) / 2 + v.direction.x * Math.sin(time * 16 + i) * 5, x, y)
        .stroke({ color: 0xffd3b0, width: 1.3, alpha: fade * 0.8 });
      g.circle(x, y, 2.5).fill({ color: 0xffebc9, alpha: fade * (0.5 + pulse * 0.4) });
    }
    if (v.target && v.effect === 'capture') for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2 + time * 0.4, rr = v.target.radius * (1.1 + pulse * 0.06);
      g.circle(v.target.x + Math.cos(angle) * rr, v.target.y + Math.sin(angle) * rr, 1.5 + pulse).fill({ color: 0xffdca8, alpha: fade * 0.65 });
    }
  } else if (v.style === 'eyespot') {
    const eye = local(r * 0.65, -r * 0.13), angle = Math.atan2(v.direction.y, v.direction.x), sweep = Math.sin(t * Math.PI * 4) * 0.16;
    const length = r + 115, a = angle + sweep;
    g.moveTo(eye.x, eye.y).lineTo(eye.x + Math.cos(a - 0.3) * length, eye.y + Math.sin(a - 0.3) * length)
      .arc(eye.x, eye.y, length, a - 0.3, a + 0.3).closePath().fill({ color: 0xf4d977, alpha: fade * 0.06 });
    for (let i = 0; i < 3; i++) {
      const phase = (t * 2 + i / 3) % 1, rr = r * 0.5 + phase * length;
      g.moveTo(eye.x + Math.cos(a - 0.26) * rr, eye.y + Math.sin(a - 0.26) * rr)
        .arc(eye.x, eye.y, rr, a - 0.26, a + 0.26).stroke({ color: 0xffe8a3, width: 1.4, alpha: fade * (1 - phase) * 0.65 });
      const dot = { x: eye.x + Math.cos(a) * rr, y: eye.y + Math.sin(a) * rr };
      g.circle(dot.x, dot.y, 2).fill({ color: 0xfff3c3, alpha: fade * (1 - phase) * 0.6 });
    }
    g.circle(eye.x, eye.y, r * (0.15 + Math.sin(time * 12) * 0.02)).fill({ color: 0xffb255, alpha: fade * 0.3 });
    g.circle(eye.x, eye.y, r * 0.075).fill({ color: 0xffe6a1, alpha: fade * 0.9 });
  } else if (v.style === 'raphe') {
    for (let i = 1; i < v.trail.length; i++) {
      const strength = i / v.trail.length;
      line(v.trail[i - 1], v.trail[i], r * 0.38, strength * 0.12, 0xefd49b);
      line(v.trail[i - 1], v.trail[i], 1.8, strength * 0.5, 0xffe1a2);
    }
    const a = local(-r * 1.05, 0), b = local(r * 1.05, 0);
    line(a, b, 4, 0.18, 0xffe5ac); line(a, b, 1.3, 0.8, 0xffe5ac);
    for (let i = 0; i < 8; i++) {
      const phase = (t * 3 + i / 8) % 1, q = local(r * (1 - phase * 2), 0);
      g.circle(q.x, q.y, r * 0.035).fill({ color: 0xfff4cf, alpha: fade * Math.sin(phase * Math.PI) * 0.85 });
    }
    for (const sign of [-1, 1]) {
      const q = local(r * (0.8 - t * 1.6), sign * r * 0.28);
      g.circle(q.x, q.y, 2.5).fill({ color: 0xe4e6ba, alpha: fade * 0.4 });
    }
  }
}
