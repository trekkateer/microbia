import type { PlayerState, World } from '../types';
import { createOrganism, foodPositionClear, placeFood, safeOrganismPosition } from '../world';
import { sameColony } from './colonies';

export function killOrganism(world: World, actor: PlayerState, reason: string, rate: number): void {
  if (!actor.alive) return;
  actor.alive = false;
  actor.deathReason = reason;
  actor.satiety = 0;
  const delay = actor.kind === 'player' ? world.arena.lifecycle?.playerRespawnSeconds : world.arena.lifecycle?.aiRespawnSeconds;
  actor.respawnAtTick = delay === undefined ? Number.MAX_SAFE_INTEGER : world.tick + Math.ceil(delay * rate);
  actor.ability = null;
  actor.velocity = { x: 0, y: 0 };
  actor.pendingMotion = { x: 0, y: 0 };
  actor.motionPath = [{ x: actor.x, y: actor.y }];
  actor.digestion = [];
  actor.nutrients = Object.fromEntries(Object.keys(actor.nutrients).map(id => [id, 0]));
  actor.reserves = Object.fromEntries(Object.keys(actor.reserves).map(id => [id, 0]));
  for (const other of [world.player, ...world.organisms]) if (other.ability?.targetId === actor.id) { other.ability = null; other.abilityMessage = 'Target lost'; }
}

export function respawnOrganism(world: World, actor: PlayerState, rate: number): boolean {
  if (actor.kind === 'ai' && world.organisms.some(p => p !== actor && p.alive && sameColony(actor, p))) return false;
  if (actor === world.player && world.organisms.some(p => p.kind === 'player' && p.ownerId === actor.ownerId && p.alive)) return false;
  if (actor.alive || (actor.parentId !== null && actor !== world.player) || world.tick < actor.respawnAtTick || !world.arena.lifecycle) return false;
  const species = world.roster[actor.speciesId];
  const replacement = createOrganism(species, world.nutrition, actor.id, 0, 0);
  if (!safeOrganismPosition(world, replacement, world.arena.lifecycle.spawnClearance)) return false;
  replacement.ownerId = actor.ownerId;
  replacement.kind = actor.kind;
  replacement.generation = actor.generation + 1;
  replacement.colonyId = `${actor.id}:${replacement.generation}`;
  replacement.ai = actor.ai ? { ...actor.ai, mode: 'wander', targetId: null, direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0 } : null;
  replacement.protectedUntil = world.tick + Math.ceil(world.arena.lifecycle.protectionSeconds * rate);
  Object.assign(actor, replacement);
  for (const food of world.foodParticles) if (!foodPositionClear(world, food, world.nutrition.foods[food.foodId].radius)) placeFood(world, food);
  return true;
}
