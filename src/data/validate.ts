import type { ArenaDefinition, NutritionDefinitions, SpeciesDefinition } from './schemas';
import { nutrition } from './nutrition';
import { abilities } from './abilities/pond';
import { facts } from './facts/pond';
import { counters } from './counters/pond';
import { aiProfiles } from './ai/pond';

export function validateDefinitions(arena: ArenaDefinition, roster: Readonly<Record<string, SpeciesDefinition>>, content: NutritionDefinitions = nutrition): void {
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;
  if (!arena.roster.length || !positive(arena.map.width) || !positive(arena.map.height)) throw new Error('Invalid arena map or roster');
  if (!arena.foodSpawns.length || !positive(arena.foodPlacement.starterRadius)) throw new Error('Invalid food placement');
  const seen = new Set<string>();
  for (const [id, nutrient] of Object.entries(content.nutrients)) {
    if (id !== nutrient.id || !nutrient.sources.length || !nutrient.uses.length
      || nutrient.uses.some(use => !['biomass', 'energy', 'reproduction'].includes(use))) throw new Error(`Invalid nutrient: ${id}`);
  }
  for (const [id, food] of Object.entries(content.foods)) {
    if (food.id !== id || !positive(food.radius) || !positive(food.digestionSeconds)
      || !['circle', 'diamond', 'capsule', 'cluster'].includes(food.shape)
      || !Object.keys(food.composition).length) throw new Error(`Invalid food: ${id}`);
    for (const [resource, amount] of Object.entries(food.composition)) {
      if (!content.nutrients[resource] || !positive(amount)) throw new Error(`Invalid composition: ${id}/${resource}`);
    }
  }
  for (const spawn of arena.foodSpawns) {
    const food = content.foods[spawn.foodId];
    if (!food || seen.has(spawn.foodId) || !Number.isInteger(spawn.count) || spawn.count <= 0
      || !Number.isInteger(spawn.starterCount) || spawn.starterCount < 0 || spawn.starterCount > spawn.count
      || !positive(spawn.respawnSeconds) || food.radius * 2 >= Math.min(arena.map.width, arena.map.height)) throw new Error('Invalid food spawn');
    seen.add(spawn.foodId);
  }
  if (!Number.isInteger(arena.maxPlayers) || arena.maxPlayers <= 0) throw new Error('Invalid player limit');
  for (const id of new Set([...arena.roster, ...(arena.aiSpawns ?? []).map(spawn => spawn.speciesId)])) {
    const entry = roster[id];
    if (!entry || entry.id !== id) throw new Error(`Unknown species: ${id}`);
    const g = entry.growth;
    if (!Object.values(g).every(positive) || g.maximumMass < g.startingMass || g.minimumSpeed > g.startingSpeed) throw new Error(`Invalid growth: ${id}`);
    const reproduction = entry.reproduction;
    if (reproduction && (entry.npc || !positive(reproduction.threshold) || reproduction.threshold > 1
      || reproduction.threshold * g.maximumMass / 2 < entry.starvation.minimumMass || !aiProfiles[reproduction.offspringAi])) throw new Error('Invalid reproduction definition');
    const maxRadius = g.startingRadius * Math.sqrt(g.maximumMass / g.startingMass);
    if (maxRadius * 2 >= Math.min(arena.map.width, arena.map.height)) throw new Error('Species cannot fit in arena');
    if (!Number.isFinite(arena.spawn.x) || !Number.isFinite(arena.spawn.y)
      || arena.spawn.x < maxRadius || arena.spawn.x > arena.map.width - maxRadius
      || arena.spawn.y < maxRadius || arena.spawn.y > arena.map.height - maxRadius) throw new Error('Invalid spawn');
    const m = content.metabolism[entry.metabolismId];
    if (!m || m.id !== entry.metabolismId) throw new Error('Unknown metabolism');
    if (arena.roster.includes(id) && (entry.npc || entry.activeId === null)) throw new Error('Species is not playable yet');
    const a = entry.activeId === null ? null : abilities[entry.activeId];
    if (entry.activeId !== null) {
    if (!a || a.id !== entry.activeId || !['capture', 'discharge', 'strike', 'phototaxis', 'glide'].includes(a.effect)
      || !positive(a.cooldown) || !positive(a.duration) || !positive(a.range)
      || ![a.speed, a.stun, a.push, a.digestionSeconds, a.transferFraction].every(nonnegative)
      || a.transferFraction > 1 || (['capture', 'strike'].includes(a.effect) && (!positive(a.digestionSeconds) || !positive(a.transferFraction)))) throw new Error('Invalid ability');
    if ((a.activationGap !== undefined && !nonnegative(a.activationGap)) || (a.visual !== undefined && !['pseudopods', 'trichocysts', 'toxicysts', 'eyespot', 'raphe'].includes(a.visual))) throw new Error('Invalid ability presentation or activation range');
    for (const [resource, cost] of Object.entries(a.costs)) if (!m.reserves[resource] || !positive(cost)) throw new Error('Invalid ability cost');
    }
    if (!positive(entry.turnRate) || !nonnegative(entry.preyMassRatio) || !nonnegative(entry.contactCaptureSeconds)
      || (entry.preyMassRatioExclusive !== undefined && typeof entry.preyMassRatioExclusive !== 'boolean')
      || !nonnegative(entry.starvation.massPerSecond) || !positive(entry.starvation.minimumMass)
      || (entry.starvation.deathAfterSeconds !== undefined && !positive(entry.starvation.deathAfterSeconds))
      || entry.starvation.minimumMass > g.startingMass || !['amoeboid', 'slipper', 'barrel', 'flagellate', 'diatom'].includes(entry.visual.shape)) throw new Error('Invalid species mechanics');
    if (!facts[entry.factId]?.sources.length) throw new Error('Unknown fact');
    if (!Object.keys(entry.bodyComposition).length) throw new Error('Missing body composition');
    for (const [resource, amount] of Object.entries(entry.bodyComposition)) if (!content.nutrients[resource] || !positive(amount)) throw new Error('Invalid body composition');
    if (!positive(m.efficiency) || m.efficiency > 1 || !positive(m.maxGrowthPerSecond)
      || !nonnegative(m.upkeepPerSecond) || !nonnegative(m.movementCostPerSecond)
      || !m.reserves[m.energyReserveId]) throw new Error('Invalid metabolism');
    for (const [id, rate] of Object.entries(m.maintenancePerSecond ?? {})) if (!m.reserves[id] || !nonnegative(rate)) throw new Error('Invalid maintenance requirement');
    for (const reserve of Object.values(m.reserves)) {
      if (!positive(reserve.capacity) || !nonnegative(reserve.initial) || reserve.initial > reserve.capacity) throw new Error('Invalid reserve');
    }
    if (!Object.keys(m.growthCost).length) throw new Error('Missing growth requirements');
    for (const [reserve, cost] of Object.entries(m.growthCost)) {
      if (!m.reserves[reserve] || !positive(cost)) throw new Error('Invalid growth requirement');
    }
    for (const [resource, yields] of Object.entries(m.assimilation)) {
      if (!content.nutrients[resource] || !Object.keys(yields).length) throw new Error('Unknown assimilation resource');
      for (const [reserve, amount] of Object.entries(yields)) {
        if (!m.reserves[reserve] || !positive(amount)) throw new Error('Invalid assimilation yield');
      }
    }
    for (const foodId of entry.diet) {
      const food = content.foods[foodId];
      if (!food || !Object.keys(food.composition).some(resource => m.assimilation[resource])) throw new Error('Unsupported diet');
    }
    for (const prey of entry.prey) if (!roster[prey]) throw new Error('Unknown prey');
    for (const [resource, uptake] of Object.entries(entry.dissolvedUptake ?? {})) {
      if (content.nutrients[resource]?.form !== 'dissolved' || !positive(uptake.rate) || !positive(uptake.capacity)
        || (!m.assimilation[resource] && entry.photosynthesis?.input !== resource)) throw new Error('Invalid dissolved uptake');
    }
    const photo = entry.photosynthesis;
    if (photo && (!entry.dissolvedUptake?.[photo.input] || !content.nutrients[photo.output] || !m.assimilation[photo.output]
      || !positive(photo.rate) || !positive(photo.capacity) || !nonnegative(photo.darkMassLoss))) throw new Error('Invalid photosynthesis');
    if (entry.defense && (!Object.values(entry.defense).every(positive) || entry.defense.preyRatio > 1 || entry.defense.captureDuration < 1 || entry.defense.stun > 1 || entry.defense.push > 1)) throw new Error('Invalid defense');
  }
  if (arena.ambientLight !== undefined && (!nonnegative(arena.ambientLight) || arena.ambientLight > 1)) throw new Error('Invalid ambient light');
  const environmentalIds = new Set<string>();
  const validateArea = (area: { id: string; x: number; y: number; radius: number }) => {
    if (!area.id || environmentalIds.has(area.id) || ![area.x, area.y].every(nonnegative) || !positive(area.radius)
      || area.x - area.radius < 0 || area.y - area.radius < 0 || area.x + area.radius > arena.map.width || area.y + area.radius > arena.map.height) throw new Error('Invalid environmental area');
    environmentalIds.add(area.id);
  };
  for (const zone of arena.zones) {
    validateArea(zone);
    if (zone.effectId === 'light') {
      if (!nonnegative(zone.light) || zone.light > 1) throw new Error('Invalid light zone');
    } else if (zone.effectId === 'current') {
      if (!Object.values(zone.velocity).every(Number.isFinite) || !positive(zone.speedMultiplier) || zone.speedMultiplier > 1) throw new Error('Invalid current');
    } else throw new Error('Unknown zone effect');
  }
  for (const patch of arena.dissolvedPatches ?? []) {
    validateArea(patch);
    if (!Object.keys(patch.resources).length) throw new Error('Empty dissolved patch');
    for (const [id, resource] of Object.entries(patch.resources)) if (content.nutrients[id]?.form !== 'dissolved' || !positive(resource.capacity) || !nonnegative(resource.renewal)) throw new Error('Invalid dissolved patch');
  }
  {
    for (const id of arena.roster) for (const prey of roster[id].prey) if (!roster[prey]) throw new Error('Unknown prey');
    for (const counter of counters.filter(c => arena.roster.includes(c.attacker))) if (!roster[counter.attacker] || !roster[counter.target] || !positive(counter.preyRatioMultiplier) || !nonnegative(counter.pushMultiplier)) throw new Error('Invalid counter');
    for (const target of arena.practiceTargets ?? []) {
      const entry = roster[target.speciesId];
      if (!entry || !arena.roster.includes(target.speciesId) || !content.metabolism[entry.metabolismId] || !positive(target.mass) || target.mass > entry.growth.maximumMass || !Number.isFinite(target.dx) || !Number.isFinite(target.dy)) throw new Error('Invalid practice organism');
      const radius = entry.growth.startingRadius * Math.sqrt(target.mass / entry.growth.startingMass) * 1.4;
      if (arena.spawn.x + target.dx < radius || arena.spawn.x + target.dx > arena.map.width - radius || arena.spawn.y + target.dy < radius || arena.spawn.y + target.dy > arena.map.height - radius) throw new Error('Practice organism outside map');
    }
    const spawnIds = new Set<string>();
    for (const spawn of arena.aiSpawns ?? []) {
      const entry = roster[spawn.speciesId], profile = aiProfiles[spawn.profileId];
      if (!entry || !profile || spawnIds.has(spawn.speciesId) || !Number.isInteger(spawn.count) || spawn.count < 1 || spawn.count > 100
        || !positive(spawn.minMass) || spawn.minMass > spawn.maxMass || spawn.maxMass > entry.growth.maximumMass
        || ![profile.vision, profile.fleeDistance, profile.decisionSeconds, profile.wanderSeconds, profile.cruise].every(positive) || profile.cruise > 1
        || (entry.npc && !arena.npcTypes.includes(entry.id))) throw new Error('Invalid AI spawn');
      spawnIds.add(spawn.speciesId);
    }
    for (const id of arena.npcTypes) if (!roster[id]?.npc) throw new Error('Unknown NPC');
    if (arena.lifecycle && !Object.values(arena.lifecycle).every(positive)) throw new Error('Invalid lifecycle');
  }
}
