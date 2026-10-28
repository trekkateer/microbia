import type { PlayerState, Vec2, WorldSnapshot } from '../../sim/types';
import type { SpeciesDefinition } from '../../data/schemas';
import { abilities } from '../../data/abilities/pond';
import { interpolatedPosition } from '../../sim/systems/collisions';

export const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export interface EngulfVisual {
  prey: PlayerState;
  offset: Vec2;
  progress: number;
  phase: 'capture' | 'swallow' | 'retract';
  preyScale: number;
  preyAlpha: number;
}
interface Animation extends EngulfVisual {
  generation: number;
  startedAtTick: number;
  age: number;
  endingOffset: Vec2;
  endingProgress: number;
}

// Completion is visual only: the simulation still transfers resources exactly once.
// Keep a short-lived copy of the captured prey so it can enter a food vacuole
// instead of disappearing on the successful simulation tick.
export class EngulfAnimations {
  private states = new Map<string, Animation>();

  update(world: WorldSnapshot, renderTick: number, alpha: number, delta: number, roster: Readonly<Record<string, SpeciesDefinition>>): Map<string, EngulfVisual> {
    const actors = [world.player, ...world.organisms];
    for (const [id, visual] of this.states) {
      const actor = actors.find(p => p.id === id);
      if (!actor?.alive || actor.generation !== visual.generation) this.states.delete(id);
    }
    for (const actor of actors) {
      if (!actor.alive) continue;
      const ability = actor.ability;
      const id = roster[actor.speciesId].activeId;
      const prey = actors.find(p => p.id === ability?.targetId && p.alive);
      let visual = this.states.get(actor.id);
      if (ability?.effect === 'capture' && id && abilities[id].visual === 'pseudopods' && prey) {
        const start = interpolatedPosition(actor, alpha), end = interpolatedPosition(prey, alpha);
        const offset = { x: end.x - start.x, y: end.y - start.y };
        const progress = Math.max(0, Math.min(1, (renderTick - ability.startedAtTick) / Math.max(1, ability.until - ability.startedAtTick)));
        visual = { prey: { ...prey }, offset, progress, phase: 'capture', preyScale: 1, preyAlpha: 1,
          generation: actor.generation, startedAtTick: ability.startedAtTick, age: 0, endingOffset: offset, endingProgress: progress };
        this.states.set(actor.id, visual);
      } else if (visual) {
        if (visual.phase === 'capture') {
          const preyId = visual.prey.id;
          const target = actors.find(p => p.id === preyId);
          const consumed = !target?.alive && actor.lastAbsorbedTick >= visual.startedAtTick && actor.lastFoodId === `prey:${visual.prey.speciesId}`;
          visual.phase = consumed ? 'swallow' : 'retract';
          visual.age = 0;
        }
        visual.age += delta;
        if (visual.phase === 'swallow') {
          const t = smooth((visual.age - 0.08) / 0.8);
          visual.offset = { x: visual.endingOffset.x * (1 - t * 0.86), y: visual.endingOffset.y * (1 - t * 0.86) };
          visual.preyScale = 1 - t * 0.78;
          visual.preyAlpha = 1 - smooth((visual.age - 0.45) / 0.45);
          visual.progress = 1;
          if (visual.age >= 0.95) this.states.delete(actor.id);
        } else {
          visual.progress = visual.endingProgress * (1 - smooth(visual.age / 0.28));
          if (visual.age >= 0.28) this.states.delete(actor.id);
        }
      }
    }
    return this.states;
  }
}
