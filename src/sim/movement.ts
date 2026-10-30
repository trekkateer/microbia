import { abilities } from '../data/abilities/pond';
import type { SpeciesDefinition } from '../data/schemas';
import { safeDirection } from './commands';
import type { PlayerState, Vec2 } from './types';

// Shared steering math. This does not award resources or resolve gameplay.
export function movementDirection(actor: PlayerState, input: Vec2, species: SpeciesDefinition, tick: number, dt: number): Vec2 {
  let direction = safeDirection(input);
  if (actor.stunnedUntil > tick) return { x: 0, y: 0 };
  const ability = species.activeId ? abilities[species.activeId] : null;
  const forced = actor.ability && actor.ability.until > tick && !['capture', 'discharge'].includes(actor.ability.effect) && ability;
  if (forced && actor.ability && ability) {
    direction = { x: actor.ability.direction.x * ability.speed / actor.speed, y: actor.ability.direction.y * ability.speed / actor.speed };
    if (actor.ability.effect !== 'phototaxis') return direction;
  } else if (Math.hypot(actor.velocity.x, actor.velocity.y) <= 0.01) return direction;
  const magnitude = Math.hypot(direction.x, direction.y);
  if (!magnitude) return direction;
  const difference = Math.atan2(direction.y, direction.x) - actor.heading;
  const turn = Math.atan2(Math.sin(difference), Math.cos(difference));
  const heading = actor.heading + Math.max(-species.turnRate * dt, Math.min(species.turnRate * dt, turn));
  return { x: Math.cos(heading) * magnitude, y: Math.sin(heading) * magnitude };
}
