import type { ArenaDefinition, NutritionDefinitions, SpeciesDefinition } from '../data/schemas';
import { nutrition } from '../data/nutrition';
import { validateDefinitions } from '../data/validate';
import { random } from './random';
import { organisms as speciesRegistry } from '../data';
import type { FoodParticle, PlayerState, World, WorldSnapshot } from './types';
import { environmentAt } from './systems/environment';

export function foodPositionClear(world: World, point: { x: number; y: number }, radius: number): boolean {
  return [world.player, ...world.organisms].every(p => !p.alive || Math.hypot(point.x - p.x, point.y - p.y) > p.radius * 1.4 + radius * 1.2 + 12);
}

export function placeFood(world: World, nutrient: FoodParticle): void {
  const radius = world.nutrition.foods[nutrient.foodId].radius;
  for (let attempt = 0; attempt < 16; attempt++) {
    nutrient.x = radius + random(world) * (world.arena.map.width - radius * 2);
    nutrient.y = radius + random(world) * (world.arena.map.height - radius * 2);
    if (foodPositionClear(world, nutrient, radius)) return;
  }
  // Deterministic bounded fallback; never accept an occupied point.
  for (let y = radius; y <= world.arena.map.height - radius; y += 24) {
    for (let x = radius; x <= world.arena.map.width - radius; x += 24) {
      if (foodPositionClear(world, { x, y }, radius)) { nutrient.x = x; nutrient.y = y; return; }
    }
  }
  throw new Error('No clear space for food in this arena');
}

export function createOrganism(species: SpeciesDefinition, content: NutritionDefinitions, id: string, x: number, y: number, mass = species.growth.startingMass): PlayerState {
  const profile = content.metabolism[species.metabolismId];
  return { id, speciesId: species.id, x, y, mass, spawnMass: mass, radius: species.growth.startingRadius * Math.sqrt(mass / species.growth.startingMass),
    speed: species.growth.startingSpeed, velocity: { x: 0, y: 0 }, eaten: 0,
    reserves: Object.fromEntries(Object.entries(profile.reserves).map(([key, reserve]) => [key, reserve.initial])),
    nutrients: Object.fromEntries(Object.keys(content.nutrients).map(key => [key, 0])),
    digestion: [], growthRate: 0, lastFoodId: null, lastAbsorbedTick: -1, heading: 0, stretch: 0,
    alive: true, cooldownUntil: 0, stunnedUntil: 0, ability: null, abilityMessage: '', pendingMotion: { x: 0, y: 0 }, motionPath: [{ x, y }],
    kind: 'fixture', generation: 0, parentId: null, colonyId: `${id}:0`, divisionCount: 0, reproductionMessage: '', respawnAtTick: 0, protectedUntil: 0, hungryTicks: 0, satiety: 1, deathReason: '', ai: null };
}

export function safeOrganismPosition(world: World, actor: PlayerState, clearance: number, nearSpawn = false): boolean {
  const margin = actor.radius * 1.4 + 2;
  const clear = (x: number, y: number) => [world.player, ...world.organisms].every(other => other === actor || !other.alive
    || Math.hypot(x - other.x, y - other.y) > (actor.radius + other.radius) * 1.4 + clearance);
  // Slow producers need a viable feeding route when entering or rejoining.
  const patches = world.roster[actor.speciesId].photosynthesis ? (world.arena.dissolvedPatches ?? []).filter(p => environmentAt(world.arena, p).light >= 0.8) : [];
  for (let attempt = 0; patches.length && attempt < 60; attempt++) {
    const patch = patches[attempt % patches.length], angle = random(world) * Math.PI * 2;
    const distance = random(world) * Math.max(0, patch.radius - margin);
    const x = patch.x + Math.cos(angle) * distance, y = patch.y + Math.sin(angle) * distance;
    if (x >= margin && y >= margin && x <= world.arena.map.width - margin && y <= world.arena.map.height - margin && environmentAt(world.arena, { x, y }).light >= 0.8 && clear(x, y)) {
      actor.x = x; actor.y = y; actor.motionPath = [{ x, y }]; return true;
    }
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    const angle = random(world) * Math.PI * 2, distance = 300 + random(world) * 350;
    const x = nearSpawn && attempt < 40 ? world.arena.spawn.x + Math.cos(angle) * distance : margin + random(world) * (world.arena.map.width - 2 * margin);
    const y = nearSpawn && attempt < 40 ? world.arena.spawn.y + Math.sin(angle) * distance : margin + random(world) * (world.arena.map.height - 2 * margin);
    if (x >= margin && y >= margin && x <= world.arena.map.width - margin && y <= world.arena.map.height - margin && clear(x, y)) {
      actor.x = x; actor.y = y; actor.motionPath = [{ x, y }]; return true;
    }
  }
  for (let y = margin; y < world.arena.map.height - margin; y += 60) for (let x = margin; x < world.arena.map.width - margin; x += 60) {
    if (clear(x, y)) { actor.x = x; actor.y = y; actor.motionPath = [{ x, y }]; return true; }
  }
  return false;
}

export function seedPopulation(world: World): void {
  for (const spawn of world.arena.aiSpawns ?? []) for (let index = 0; index < spawn.count; index++) {
    const definition = world.roster[spawn.speciesId];
    const actor = createOrganism(definition, world.nutrition, `${spawn.speciesId}-${index}`, 0, 0, spawn.minMass + random(world) * (spawn.maxMass - spawn.minMass));
    actor.kind = definition.npc ? 'npc' : 'ai';
    actor.ai = { profileId: spawn.profileId, mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0, wanderAngle: random(world) * Math.PI * 2, targetId: null };
    if (!safeOrganismPosition(world, actor, definition.npc ? world.arena.lifecycle?.spawnClearance ?? 160 : 25, index === 0)) throw new Error('No safe organism spawn');
    world.organisms.push(actor);
  }
}

export function resetPracticeTargets(world: World): void {
  world.organisms = (world.arena.practiceTargets ?? []).map((target, index) => createOrganism(world.roster[target.speciesId], world.nutrition,
    `practice-${index}`, world.arena.spawn.x + target.dx, world.arena.spawn.y + target.dy, target.mass));
  // Resetting the fixtures can occupy previously clear food positions.
  for (const food of world.foodParticles) if (!foodPositionClear(world, food, world.nutrition.foods[food.foodId].radius)) placeFood(world, food);
  world.player.ability = null;
}

export function createWorld(arena: ArenaDefinition, species: SpeciesDefinition, seed = 2026, content: NutritionDefinitions = nutrition, roster: Readonly<Record<string, SpeciesDefinition>> = speciesRegistry): World {
  if (!arena.roster.includes(species.id)) throw new Error('Species is not in this arena');
  const definitions = { ...roster, [species.id]: species };
  validateDefinitions(arena, definitions, content);
  const world: World = {
    tick: 0, randomState: seed >>> 0, nextOrganismId: 1, arena, species, nutrition: content,
    player: createOrganism(species, content, 'local-player', arena.spawn.x, arena.spawn.y),
    foodParticles: [], organisms: [], roster: definitions, contacts: new Set(),
    dissolvedPatches: (arena.dissolvedPatches ?? []).map(p => ({ id: p.id, resources: Object.fromEntries(Object.entries(p.resources).map(([id, r]) => [id, r.capacity])) })),
  };
  resetPracticeTargets(world);
  world.player.kind = 'player';
  seedPopulation(world);
  world.player.protectedUntil = Math.ceil((arena.lifecycle?.protectionSeconds ?? 0) * 30);
  for (const spawn of arena.foodSpawns) {
    for (let index = 0; index < spawn.count; index++) {
      const particle = { id: world.foodParticles.length, foodId: spawn.foodId, x: 0, y: 0, availableAtTick: 0 };
      const radius = content.foods[spawn.foodId].radius;
      placeFood(world, particle);
      // Guarantee a nearby variety without changing collision or feeding rules.
      if (index < spawn.starterCount) {
        for (let attempt = 0; attempt < 64; attempt++) {
          const angle = random(world) * Math.PI * 2;
          const inner = species.growth.startingRadius * 2 + radius;
          const distance = inner + random(world) * Math.max(0, arena.foodPlacement.starterRadius - inner);
          particle.x = Math.max(radius, Math.min(arena.map.width - radius, arena.spawn.x + Math.cos(angle) * distance));
          particle.y = Math.max(radius, Math.min(arena.map.height - radius, arena.spawn.y + Math.sin(angle) * distance));
          if (foodPositionClear(world, particle, radius)) break;
        }
        if (!foodPositionClear(world, particle, radius)) placeFood(world, particle);
      }
      world.foodParticles.push(particle);
    }
  }
  return world;
}

export function snapshot(world: World): WorldSnapshot {
  const copy = (p: PlayerState): PlayerState => ({ ...p, velocity: { ...p.velocity }, pendingMotion: { ...p.pendingMotion }, motionPath: p.motionPath.map(point => ({ ...point })), reserves: { ...p.reserves }, nutrients: { ...p.nutrients },
    ability: p.ability ? { ...p.ability, direction: { ...p.ability.direction } } : null,
    ai: p.ai ? { ...p.ai, direction: { ...p.ai.direction } } : null,
    digestion: p.digestion.map(meal => ({ ...meal, composition: { ...meal.composition } })) });
  return {
    tick: world.tick,
    dissolvedPatches: world.dissolvedPatches.map(p => ({ id: p.id, resources: { ...p.resources } })),
    player: copy(world.player), organisms: world.organisms.map(copy),
    foodParticles: world.foodParticles.map(n => ({ ...n })),
  };
}
