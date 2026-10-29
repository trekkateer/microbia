import { aiProfiles } from '../../data/ai/pond';
import { abilities } from '../../data/abilities/pond';
import { counters } from '../../data/counters/pond';
import type { MoveCommand } from '../commands';
import { safeDirection } from '../commands';
import { random } from '../random';
import type { PlayerState, World } from '../types';
import { abilityBlock, eligiblePrey, availablePrey, withinCaptureStart } from './abilities';
import { foodYields, limitingResource } from './metabolism';
import { contains, environmentAt, favorableLight } from './environment';
import { reproductionBlock } from './reproduction';
import { sameColony } from './colonies';

function nearbyThreat(world: World, actor: PlayerState, candidates = [world.player, ...world.organisms]): PlayerState | undefined {
  if (!actor.ai) return;
  const profile = aiProfiles[actor.ai.profileId];
  let nearest: PlayerState | undefined, best = Infinity;
  for (const other of candidates) {
    if (other === actor || !other.alive || sameColony(actor, other)) continue;
    const d = (other.x - actor.x) ** 2 + (other.y - actor.y) ** 2;
    if (d > profile.vision ** 2 || (d >= (profile.fleeDistance + other.radius) ** 2 && other.ability?.targetId !== actor.id)) continue;
    if (d < best && (eligiblePrey(world, other, actor) || counters.some(c => c.attacker === other.speciesId && c.target === actor.speciesId))) { nearest = other; best = d; }
  }
  return nearest;
}

function escapeDirection(world: World, actor: PlayerState, threat: PlayerState) {
  const away = safeDirection({ x: actor.x - threat.x, y: actor.y - threat.y });
  const margin = actor.radius * 1.4 + 60;
  const direction = { ...away };
  if ((actor.x < margin && direction.x < 0) || (actor.x > world.arena.map.width - margin && direction.x > 0)) direction.x = 0;
  if ((actor.y < margin && direction.y < 0) || (actor.y > world.arena.map.height - margin && direction.y > 0)) direction.y = 0;
  if (Math.hypot(direction.x, direction.y) < 0.01) {
    const sign = -away.y * (world.arena.map.width / 2 - actor.x) + away.x * (world.arena.map.height / 2 - actor.y) >= 0 ? 1 : -1;
    direction.x = -away.y * sign; direction.y = away.x * sign;
  }
  return safeDirection(direction);
}

export function aiCommand(world: World, actor: PlayerState, rate: number, colonyThreat?: PlayerState | null): MoveCommand {
  const state = actor.ai;
  if (!state || !actor.alive) return { direction: { x: 0, y: 0 } };
  const threat = colonyThreat === undefined ? nearbyThreat(world, actor) : colonyThreat;
  if (!threat && world.tick < state.decisionAt) return { direction: state.direction };
  const profile = aiProfiles[state.profileId], species = world.roster[actor.speciesId];
  state.decisionAt = world.tick + Math.max(1, Math.ceil(profile.decisionSeconds * rate));
  const distance = (other: { x: number; y: number }) => Math.hypot(other.x - actor.x, other.y - actor.y);
  let activate = false;
  const ability = species.activeId ? abilities[species.activeId] : null;
  if (threat) {
    if (actor.ability?.effect === 'phototaxis') { actor.ability = null; actor.abilityMessage = 'Escaping predator'; }
    state.mode = 'flee'; state.targetId = threat.id;
    state.direction = escapeDirection(world, actor, threat);
    // Reverse while still facing the threat; once already facing away, keep swimming away.
    const facingThreat = Math.cos(actor.heading) * (threat.x - actor.x) + Math.sin(actor.heading) * (threat.y - actor.y) > 0;
    activate = (ability?.effect === 'glide' || (ability?.effect === 'discharge' && (facingThreat || threat.ability?.targetId === actor.id))) && !abilityBlock(world, actor);
  } else {
    const neighbors = profile.hunt ? [world.player, ...world.organisms].filter(p => p !== actor && p.alive && !sameColony(actor, p) && distance(p) <= profile.vision)
      .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id)) : [];
    const target = profile.hunt ? neighbors.find(other => availablePrey(world, actor, other)) : undefined;
    if (target) {
      state.mode = 'hunt'; state.targetId = target.id;
      state.direction = safeDirection({ x: target.x - actor.x, y: target.y - actor.y });
      const activationReach = actor.radius + target.radius + (ability?.effect === 'strike' ? ability.speed * ability.duration * 0.8 : (ability?.range ?? 0) * Math.sqrt(actor.mass / 25));
      activate = !!ability && (ability.effect === 'capture' ? withinCaptureStart(world, actor, target, ability) : distance(target) <= activationReach) && !abilityBlock(world, actor);
      if (actor.ability?.effect === 'capture' && distance(target) < actor.radius + target.radius + 12) state.direction = { x: 0, y: 0 };
    } else {
      const metabolic = world.nutrition.metabolism[species.metabolismId];
      const limiting = limitingResource(actor, metabolic) ?? metabolic.energyReserveId;
      // Score each nearby particle once, with one yield calculation per food type.
      let food: World['foodParticles'][number] | undefined, bestScore = Infinity;
      if (profile.forage) {
        const values = new Map(species.diet.map(id => [id, 1 + (foodYields(world.nutrition.foods[id], metabolic)[limiting] ?? 0)]));
        for (const particle of world.foodParticles) {
          const value = values.get(particle.foodId);
          if (particle.availableAtTick > world.tick || value === undefined) continue;
          const d = distance(particle);
          if (d > profile.vision) continue;
          const score = d / value;
          if (score < bestScore || (score === bestScore && particle.id < food!.id)) { food = particle; bestScore = score; }
        }
      }
      if (food) { state.mode = 'forage'; state.targetId = `food:${food.id}`; state.direction = safeDirection({ x: food.x - actor.x, y: food.y - actor.y }); }
      else {
        if (world.tick >= state.wanderAt) { state.wanderAngle += (random(world) - 0.5) * Math.PI * 1.2; state.wanderAt = world.tick + Math.ceil(profile.wanderSeconds * rate); }
        state.mode = 'wander'; state.targetId = null;
        state.direction = { x: Math.cos(state.wanderAngle) * profile.cruise, y: Math.sin(state.wanderAngle) * profile.cruise };
      }
    }
  }
  if (!threat && species.photosynthesis) {
    const light = environmentAt(world.arena, actor).light;
    const patches = (world.arena.dissolvedPatches ?? []).filter(patch => environmentAt(world.arena, patch).light >= 0.8
      && Object.keys(species.dissolvedUptake ?? {}).every(id => (world.dissolvedPatches.find(p => p.id === patch.id)?.resources[id] ?? 0) > 0.01));
    patches.sort((a, b) => distance(a) - distance(b));
    const patch = patches[0];
    if (patch) {
      state.mode = 'forage'; state.targetId = patch.id;
      state.direction = contains({ ...patch, radius: patch.radius * 0.65 }, actor) && light >= 0.8 ? { x: 0, y: 0 } : safeDirection({ x: patch.x - actor.x, y: patch.y - actor.y });
    }
    // Phototaxis helps the producer reach the light, with the same costs as players.
    if (light < 0.8 && ability?.effect === 'phototaxis' && favorableLight(world.arena, actor)) activate = !abilityBlock(world, actor);
  }
  const margin = actor.radius * 1.4 + 60;
  const avoidance = { x: actor.x < margin ? 1 : actor.x > world.arena.map.width - margin ? -1 : 0,
    y: actor.y < margin ? 1 : actor.y > world.arena.map.height - margin ? -1 : 0 };
  if (!threat && (avoidance.x || avoidance.y)) state.direction = safeDirection({ x: state.direction.x + avoidance.x * 2, y: state.direction.y + avoidance.y * 2 });
  const reproduce = !threat && !reproductionBlock(world, actor);
  return { direction: state.direction, activate: activate && !reproduce, reproduce };
}

// One decision per colony; all daughters steer toward its shared destination.
// Membership survives parent death, and a surviving cell inherits the brain.
export function aiColonyCommands(world: World, actors: PlayerState[], rate: number): Map<string, MoveCommand> {
  const groups = new Map<string, PlayerState[]>();
  const commands = new Map<string, MoveCommand>();
  for (const actor of actors) if (actor.kind !== 'player') {
    const group = groups.get(actor.colonyId);
    if (group) group.push(actor); else groups.set(actor.colonyId, [actor]);
  }
  const threatsBySpecies = new Map<string, PlayerState[]>();
  const threatsFor = (speciesId: string) => {
    let candidates = threatsBySpecies.get(speciesId);
    if (!candidates) {
      candidates = [world.player, ...world.organisms].filter(p => p.alive && (world.roster[p.speciesId].prey.includes(speciesId)
        || counters.some(c => c.attacker === p.speciesId && c.target === speciesId)));
      threatsBySpecies.set(speciesId, candidates);
    }
    return candidates;
  };
  for (const members of groups.values()) {
    const leader = members[0];
    let threat: PlayerState | null = null;
    for (const cell of members) { threat = nearbyThreat(world, cell, threatsFor(cell.speciesId)) ?? null; if (threat) break; }
    const deciding = !!leader.ai && world.tick >= leader.ai.decisionAt;
    const command = aiCommand(world, leader, rate, threat);
    if (members.length === 1 || !leader.ai) { commands.set(leader.id, command); continue; }
    const state = leader.ai, center = { x: 0, y: 0 };
    for (const cell of members) { center.x += cell.x / members.length; center.y += cell.y / members.length; }
    const comfort = Math.max(100, Math.sqrt(members.reduce((sum, p) => sum + p.radius ** 2, 0)) * 2.5);
    const slowest = Math.min(...members.map(p => p.speed));
    const target = state.mode === 'hunt' ? [world.player, ...world.organisms].find(p => p.id === state.targetId && p.alive) : undefined;
    const food = state.targetId?.startsWith('food:') ? world.foodParticles.find(p => `food:${p.id}` === state.targetId && p.availableAtTick <= world.tick) : undefined;
    const patch = world.arena.dissolvedPatches?.find(p => p.id === state.targetId);
    const destination = target ?? food ?? patch ?? { x: center.x + state.direction.x * comfort * 2, y: center.y + state.direction.y * comfort * 2 };
    const abilityId = world.roster[leader.speciesId].activeId;
    const ability = abilityId ? abilities[abilityId] : null;
    const attacker = deciding && target && ability ? members.filter(p => !abilityBlock(world, p) && availablePrey(world, p, target))
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y) || a.id.localeCompare(b.id))[0] : undefined;
    for (const cell of members) {
      if (cell !== leader && cell.ai) Object.assign(cell.ai, { ...state, direction: { ...state.direction } });
      const fromCenter = Math.hypot(cell.x - center.x, cell.y - center.y);
      const regroup = fromCenter > comfort;
      const goal = regroup ? center : destination;
      const direction = safeDirection({ x: goal.x - cell.x, y: goal.y - cell.y });
      // Front cells ease off so smaller/faster daughters and lagging cells can
      // converge, instead of preserving a permanent gap at identical speeds.
      const ahead = (cell.x - center.x) * state.direction.x + (cell.y - center.y) * state.direction.y;
      const pace = Math.max(0.4, Math.min(1.6, 1 - ahead / comfort * 0.6));
      const speed = regroup ? 1 : Math.min(1, slowest / cell.speed * pace * (target || food || patch ? 1 : Math.hypot(state.direction.x, state.direction.y)));
      direction.x *= speed; direction.y *= speed;
      if (cell.ability?.effect === 'capture' || (patch && !regroup && contains({ ...patch, radius: patch.radius * 0.65 }, cell))) direction.x = direction.y = 0;
      // Escape overrides light-seeking and cohesion, including threats detected
      // by a daughter rather than the leader. Never regroup through a predator.
      if (threat) {
        Object.assign(direction, escapeDirection(world, cell, threat));
        if (cell.ability?.effect === 'phototaxis') { cell.ability = null; cell.abilityMessage = 'Escaping predator'; }
      }
      const reproduce = deciding && state.mode !== 'flee' && !reproductionBlock(world, cell);
      const activate = cell === attacker && target && ability
        ? ability.effect === 'capture' ? withinCaptureStart(world, cell, target, ability) : Math.hypot(cell.x - target.x, cell.y - target.y) <= cell.radius + target.radius + ability.speed * ability.duration * 0.8
        : !target && !!command.activate && !abilityBlock(world, cell);
      commands.set(cell.id, { direction, activate: !!activate && !reproduce, reproduce });
    }
  }
  return commands;
}

