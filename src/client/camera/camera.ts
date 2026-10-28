import type { Vec2 } from '../../sim/types';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1.35;

  update(position: Vec2, radius: number, startingRadius: number, seconds: number, fitZoom?: number): void {
    // Position follows the interpolated player exactly; zoom eases independently.
    this.x = position.x;
    this.y = position.y;
    const target = Math.min(1.35 * Math.pow(startingRadius / radius, 0.45), fitZoom ?? Infinity);
    this.zoom += (target - this.zoom) * (1 - Math.exp(-seconds * 8));
  }
}
