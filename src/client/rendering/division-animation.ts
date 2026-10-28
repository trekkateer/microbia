import type { PlayerState, WorldSnapshot } from '../../sim/types';
import { interpolatedPosition } from '../../sim/systems/collisions';
import { smooth } from './engulf-animation';

export const DIVISION_SECONDS = 1.2;
interface Split { parent: string; child: string; generation: number; childGeneration: number; age: number; radius: number }
export interface DivisionNeck { a: PlayerState; b: PlayerState; width: number }

// Observe authoritative births. Presentation copies never change collision,
// nutrition, ownership or reproduction state, including during network play.
export class DivisionAnimations {
  private previous = new Map<string, PlayerState>();
  private splits = new Map<string, Split>();
  readonly necks: DivisionNeck[] = [];
  readonly activeIds = new Set<string>();

  constructor(initial: WorldSnapshot) { this.remember(initial); }

  private remember(world: WorldSnapshot) {
    this.previous = new Map([world.player, ...world.organisms].map(p => [p.id, { ...p }]));
  }

  update(world: WorldSnapshot, alpha: number, delta: number): WorldSnapshot {
    const actors = [world.player, ...world.organisms];
    const byId = new Map(actors.map(p => [p.id, p]));
    for (const child of actors) {
      if (!child.alive || !child.parentId || this.previous.has(child.id)) continue;
      const parent = byId.get(child.parentId), before = this.previous.get(child.parentId);
      if (!parent?.alive || !before?.alive || parent.generation !== before.generation || parent.divisionCount <= before.divisionCount) continue;
      // A second division replaces the old visual rather than keeping stale cells.
      for (const [id, split] of this.splits) if ([split.parent, split.child].some(id => id === parent.id || id === child.id)) this.splits.delete(id);
      this.splits.set(child.id, { parent: parent.id, child: child.id, generation: parent.generation, childGeneration: child.generation, age: 0, radius: before.radius });
    }
    this.remember(world);
    this.necks.length = 0;
    this.activeIds.clear();
    const visuals = new Map<string, PlayerState>();
    for (const [id, split] of this.splits) {
      const parent = byId.get(split.parent), child = byId.get(split.child);
      if (!parent?.alive || !child?.alive || parent.generation !== split.generation || child.generation !== split.childGeneration) { this.splits.delete(id); continue; }
      const t = smooth(split.age / DIVISION_SECONDS);
      split.age += Math.max(0, delta);
      if (t >= 1) { this.splits.delete(id); continue; }
      const a = interpolatedPosition(parent, alpha), b = interpolatedPosition(child, alpha);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const copy = (actor: PlayerState, point: typeof a, radius: number): PlayerState => {
        const position = { x: midpoint.x + (point.x - midpoint.x) * t, y: midpoint.y + (point.y - midpoint.y) * t };
        return { ...actor, ...position, radius, motionPath: [position] };
      };
      const first = copy(parent, a, Math.sqrt(split.radius ** 2 * (1 - t) + parent.radius ** 2 * t));
      const second = copy(child, b, child.radius * Math.sqrt(t));
      visuals.set(parent.id, first); visuals.set(child.id, second);
      this.activeIds.add(parent.id); this.activeIds.add(child.id);
      this.necks.push({ a: first, b: second, width: Math.min(first.radius, second.radius) * (1 - smooth((t - 0.25) / 0.65)) * 0.7 });
    }
    return { ...world, player: visuals.get(world.player.id) ?? world.player, organisms: world.organisms.map(p => visuals.get(p.id) ?? p) };
  }
}
