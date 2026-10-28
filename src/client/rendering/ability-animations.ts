import { abilities } from '../../data/abilities/pond';
import type { AbilityDefinition, SpeciesDefinition } from '../../data/schemas';
import type { Vec2, WorldSnapshot } from '../../sim/types';
import { interpolatedPosition } from '../../sim/systems/collisions';

export interface AbilityVisual {
  actorId: string; generation: number; style: NonNullable<AbilityDefinition['visual']>;
  effect: AbilityDefinition['effect']; position: Vec2; origin: Vec2; direction: Vec2;
  heading: number; radius: number; range: number; progress: number; opacity: number;
  trail: Vec2[]; target?: Vec2 & { radius: number };
}
interface Animation extends AbilityVisual { key: string; until: number; endedAt: number | null; sampleTick: number }

// Bounded, presentation-only trails; never change movement, resources or hits.
export class AbilityAnimations {
  private states = new Map<string, Animation>();

  update(world: WorldSnapshot, renderTick: number, alpha: number, roster: Readonly<Record<string, SpeciesDefinition>>): AbilityVisual[] {
    const actors = new Map([world.player, ...world.organisms].map(p => [p.id, p]));
    for (const actor of actors.values()) {
      const state = actor.ability, ability = abilities[roster[actor.speciesId].activeId ?? ''];
      if (!actor.alive || !state || !ability?.visual || ability.visual === 'pseudopods') continue;
      const key = `${actor.id}:${actor.generation}:${state.effect}:${state.startedAtTick}`;
      const position = interpolatedPosition(actor, alpha);
      let visual = this.states.get(key);
      if (!visual) {
        visual = { key, actorId: actor.id, generation: actor.generation, style: ability.visual, effect: state.effect,
          position, origin: { ...position }, direction: { ...state.direction }, heading: actor.heading, radius: actor.radius,
          range: ability.range, progress: 0, opacity: 1, trail: [], until: state.until, endedAt: null, sampleTick: -1 };
        this.states.set(key, visual);
      }
      visual.position = position; visual.heading = actor.heading; visual.radius = actor.radius;
      visual.progress = Math.max(0, Math.min(1, (renderTick - state.startedAtTick) / Math.max(1, state.until - state.startedAtTick)));
      if (visual.sampleTick !== world.tick) {
        visual.trail.push({ x: position.x - Math.cos(actor.heading) * actor.radius, y: position.y - Math.sin(actor.heading) * actor.radius });
        if (visual.trail.length > 14) visual.trail.shift(); visual.sampleTick = world.tick;
      }
      const target = actors.get(state.targetId ?? '');
      visual.target = target?.alive ? { ...interpolatedPosition(target, alpha), radius: target.radius } : undefined;
    }
    for (const [key, visual] of this.states) {
      const actor = actors.get(visual.actorId);
      if (!actor?.alive || actor.generation !== visual.generation) { this.states.delete(key); continue; }
      const state = actor.ability;
      const active = state && key === `${actor.id}:${actor.generation}:${state.effect}:${state.startedAtTick}`;
      if (!active || renderTick > visual.until) {
        visual.endedAt ??= Math.min(renderTick, visual.until);
        visual.opacity = Math.max(0, 1 - (renderTick - visual.endedAt) / 18);
        visual.progress = 1; visual.target = undefined;
        if (!visual.opacity) this.states.delete(key);
      }
    }
    return [...this.states.values()];
  }
}
