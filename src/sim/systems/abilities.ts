import { abilities } from '../../data/abilities/pond';
import { counters } from '../../data/counters/pond';
import type { AbilityDefinition, SpeciesDefinition } from '../../data/schemas';
import type { PlayerState, Vec2, World } from '../types';
import { bodyHull, contactKey, penetration } from './collisions';
import { segmentDistance } from '../membrane';
import { killOrganism } from './lifecycle';
import { favorableLight } from './environment';
import { sameColony } from './colonies';

const actors = (world: World) => [world.player, ...world.organisms];
const definition = (world: World, actor: PlayerState): SpeciesDefinition => actor === world.player ? world.species : world.roster[actor.speciesId];
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export function eligiblePrey(world: World, actor: PlayerState, prey: PlayerState): boolean {
  const species = definition(world, actor);
  const multiplier = counters.find(c => c.attacker === actor.speciesId && c.target === prey.speciesId)?.preyRatioMultiplier ?? 1;
  const massLimit = actor.mass * species.preyMassRatio * multiplier * (definition(world, prey).defense?.preyRatio ?? 1);
  const sizeEligible = species.preyMassRatioExclusive ? prey.mass < massLimit : prey.mass <= massLimit;
  return actor.alive && prey !== actor && prey.alive && !sameColony(actor, prey) && actor.protectedUntil <= world.tick && prey.protectedUntil <= world.tick && species.prey.includes(prey.speciesId) && sizeEligible;
}
const reach = (actor: PlayerState, prey: PlayerState, ability: AbilityDefinition) => actor.radius + prey.radius + ability.range * Math.sqrt(actor.mass / 25);

export function withinCaptureStart(world: World, actor: PlayerState, prey: PlayerState, ability: AbilityDefinition): boolean {
  const gap = ability.activationGap;
  if (gap === undefined) return distance(actor, prey) <= reach(actor, prey, ability);
  if (distance(actor, prey) > (actor.radius + prey.radius) * 1.4 + gap) return false;
  const a = bodyHull(world, actor), b = bodyHull(world, prey);
  if (penetration(a, b, 0)) return true;
  // Measure membrane edges, not centers: long cells and large Amoebae should
  // both be able to start a capture at the same small surface gap.
  const near = (points: Vec2[], edges: Vec2[]) => points.some(p => edges.some((v, i) => segmentDistance(p, v, edges[(i + 1) % edges.length]) <= gap));
  return near(a, b) || near(b, a);
}

// The first accepted attack owns its prey until it ends. Deriving ownership from
// active state avoids a second lock that could survive death, stun or escape.
export function attackOwner(world: World, prey: PlayerState): PlayerState | undefined {
  return actors(world).find(hunter => {
    const state = hunter.ability;
    if (!state || state.targetId !== prey.id || !['capture', 'strike'].includes(state.effect)
      || hunter.stunnedUntil > world.tick || !eligiblePrey(world, hunter, prey)) return false;
    const abilityId = definition(world, hunter).activeId;
    if (!abilityId) return false;
    return state.effect === 'strike' ? world.tick <= state.until : distance(hunter, prey) <= reach(hunter, prey, abilities[abilityId]);
  });
}

export function availablePrey(world: World, actor: PlayerState, prey: PlayerState): boolean {
  if (!eligiblePrey(world, actor, prey)) return false;
  const owner = attackOwner(world, prey);
  return !owner || owner === actor;
}

export function abilityBlock(world: World, actor: PlayerState): string | null {
  if (!actor.alive) return 'Unavailable';
  if (actor.protectedUntil > world.tick) return 'Settling in';
  if (!definition(world, actor).activeId) return 'No active ability';
  if (actor.stunnedUntil > world.tick) return 'Stunned';
  if (actor.ability) return 'Active';
  if (actor.cooldownUntil > world.tick) return 'Cooling down';
  const ability = abilities[definition(world, actor).activeId!];
  const missing = Object.entries(ability.costs).filter(([id, cost]) => actor.reserves[id] < cost).map(([id]) => id);
  return missing.length ? `Need ${missing.join(' + ')}` : null;
}

export function activateAbility(world: World, actor: PlayerState, aim: Vec2, rate: number, targetId?: string): void {
  const blocked = abilityBlock(world, actor);
  if (blocked) { actor.abilityMessage = blocked; return; }
  const ability = abilities[definition(world, actor).activeId!];
  const length = Math.hypot(aim.x, aim.y);
  const direction = length > 0 ? { x: aim.x / length, y: aim.y / length } : { x: Math.cos(actor.heading), y: Math.sin(actor.heading) };
  let target: PlayerState | undefined;
  if (ability.effect === 'phototaxis') {
    const light = favorableLight(world.arena, actor);
    if (!light) { actor.abilityMessage = 'No favorable light sensed'; return; }
    if (Math.hypot(light.x, light.y) === 0) { actor.abilityMessage = 'Already centered in favorable light'; return; }
    direction.x = light.x; direction.y = light.y;
  }
  if (ability.effect === 'capture') {
    target = actors(world).filter(prey => (!targetId || prey.id === targetId) && eligiblePrey(world, actor, prey) && distance(actor, prey) <= reach(actor, prey, ability)
      && ((prey.x - actor.x) * direction.x + (prey.y - actor.y) * direction.y) >= distance(actor, prey) * 0.35)
      .sort((a, b) => distance(actor, a) - distance(actor, b) || a.id.localeCompare(b.id))[0];
    if (!target) { actor.abilityMessage = 'Aim at smaller prey within reach'; return; }
    if (!withinCaptureStart(world, actor, target, ability)) { actor.abilityMessage = 'Move closer to begin engulfing'; return; }
  }
  if (ability.effect === 'strike') {
    target = targetId ? actors(world).find(prey => prey.id === targetId && eligiblePrey(world, actor, prey))
      : actors(world).filter(prey => eligiblePrey(world, actor, prey) && distance(actor, prey) <= actor.radius + prey.radius + ability.speed * ability.duration
        && (prey.x - actor.x) * direction.x + (prey.y - actor.y) * direction.y >= distance(actor, prey) * 0.35)
        .sort((a, b) => distance(actor, a) - distance(actor, b) || a.id.localeCompare(b.id))[0];
    if (targetId && !target) { actor.abilityMessage = 'Target unavailable'; return; }
  }
  if (target && !availablePrey(world, actor, target)) { actor.abilityMessage = 'Prey already under attack'; return; }
  // Atomic payment: all checks precede any debit or cooldown.
  for (const [id, cost] of Object.entries(ability.costs)) actor.reserves[id] -= cost;
  actor.cooldownUntil = world.tick + Math.ceil(ability.cooldown * rate);
  actor.abilityMessage = ability.name;
  actor.ability = { effect: ability.effect, startedAtTick: world.tick, until: world.tick + Math.ceil(ability.duration * rate * (ability.effect === 'capture' && target ? definition(world, target).defense?.captureDuration ?? 1 : 1)), targetId: target?.id ?? null, direction };
  if (ability.effect === 'discharge') {
    for (const other of actors(world)) {
      if (other === actor || sameColony(actor, other) || !other.alive || other.protectedUntil > world.tick || actor.protectedUntil > world.tick || distance(actor, other) > reach(actor, other, ability)) continue;
      const multiplier = (counters.find(c => c.attacker === other.speciesId && c.target === actor.speciesId)?.pushMultiplier ?? 1) * (definition(world, other).defense?.push ?? 1);
      const d = distance(actor, other);
      const dx = d ? (other.x - actor.x) / d : Math.cos(actor.heading);
      const dy = d ? (other.y - actor.y) / d : Math.sin(actor.heading);
      other.pendingMotion.x += dx * ability.push * multiplier;
      other.pendingMotion.y += dy * ability.push * multiplier;
      if (multiplier > 0.2 && other.ability?.targetId === actor.id) { other.ability = null; other.abilityMessage = 'Capture interrupted'; }
    }
  }
}

function consume(world: World, actor: PlayerState, prey: PlayerState, ability: AbilityDefinition, rate: number): void {
  const body = definition(world, prey).bodyComposition;
  const composition: Record<string, number> = {};
  for (const id of Object.keys(world.nutrition.nutrients)) {
    composition[id] = ((body[id] ?? 0) * prey.mass + (prey.nutrients[id] ?? 0)) * ability.transferFraction;
    actor.nutrients[id] = (actor.nutrients[id] ?? 0) + composition[id];
  }
  actor.digestion.push({ foodId: `prey:${prey.speciesId}`, completesAtTick: world.tick + Math.ceil(ability.digestionSeconds * rate), composition });
  actor.eaten++;
  actor.lastAbsorbedTick = world.tick;
  actor.lastFoodId = `prey:${prey.speciesId}`;
  killOrganism(world, prey, `Eaten by ${definition(world, actor).name}`, rate);
  actor.ability = null;
  actor.abilityMessage = 'Prey captured � digesting';
}

export function advanceAbility(world: World, actor: PlayerState, before: Vec2, rate: number): void {
  const species = definition(world, actor);
  if (!actor.alive || !species.activeId) return;
  if (!actor.ability && actor.stunnedUntil <= world.tick && species.contactCaptureSeconds > 0) {
    const prey = actors(world).find(p => availablePrey(world, actor, p) && world.contacts.has(contactKey(actor, p)));
    if (prey) {
      actor.ability = { effect: 'capture', startedAtTick: world.tick, until: world.tick + Math.ceil(species.contactCaptureSeconds * rate * (definition(world, prey).defense?.captureDuration ?? 1)), targetId: prey.id, direction: { x: Math.cos(actor.heading), y: Math.sin(actor.heading) } };
      actor.abilityMessage = 'Contact feeding � stay within reach';
    }
  }
  const state = actor.ability;
  if (!state) return;
  const ability = abilities[species.activeId];
  if (actor.stunnedUntil > world.tick) { actor.ability = null; actor.abilityMessage = 'Interrupted by stun'; return; }
  if (state.effect === 'strike') {
    const intended = actors(world).find(p => p.id === state.targetId);
    if (intended && !availablePrey(world, actor, intended)) { actor.ability = null; actor.abilityMessage = 'Target unavailable'; return; }
    const prey = actors(world).filter(p => (!state.targetId || p.id === state.targetId) && availablePrey(world, actor, p) && world.contacts.has(contactKey(actor, p)))
      .sort((a, b) => distance(before, a) - distance(before, b) || a.id.localeCompare(b.id))[0];
    if (prey) {
      prey.stunnedUntil = world.tick + Math.ceil(ability.stun * rate * (definition(world, prey).defense?.stun ?? 1));
      prey.ability = null;
      actor.ability = { ...state, effect: 'capture', startedAtTick: world.tick, targetId: prey.id, until: world.tick + Math.ceil(ability.stun * rate * 0.7 * (definition(world, prey).defense?.captureDuration ?? 1)) };
      actor.abilityMessage = 'Toxicyst hit � capturing';
      return;
    }
  }
  if (state.effect === 'capture') {
    const prey = actors(world).find(p => p.id === state.targetId);
    if (!prey || !availablePrey(world, actor, prey) || distance(actor, prey) > reach(actor, prey, ability)) {
      actor.ability = null; actor.abilityMessage = 'Prey escaped'; return;
    }
    if (world.tick >= state.until) consume(world, actor, prey, ability, rate);
  } else if (world.tick >= state.until) {
    actor.ability = null;
    actor.abilityMessage = state.effect === 'strike' ? 'Strike missed' : state.effect === 'phototaxis' ? 'Light sensing complete' : state.effect === 'glide' ? 'Glide complete' : 'Discharge complete';
  }
}
