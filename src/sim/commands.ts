import type { Vec2 } from './types';

export interface MoveCommand { direction: Vec2; target?: Vec2; activate?: boolean; respawn?: boolean; reproduce?: boolean }
export const idleCommand = (): MoveCommand => ({ direction: { x: 0, y: 0 } });

export function safeDirection(direction: Vec2): Vec2 {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return { x: 0, y: 0 };
  const length = Math.hypot(direction.x, direction.y);
  const divisor = Math.max(1, length);
  return { x: direction.x / divisor, y: direction.y / divisor };
}
