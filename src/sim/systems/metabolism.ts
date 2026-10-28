import type { FoodDefinition, MetabolismDefinition } from '../../data/schemas';
import type { PlayerState, World } from '../types';
import { environmentAt } from './environment';
import { sustain } from './hunger';

export function foodYields(food: FoodDefinition, profile: MetabolismDefinition): Record<string, number> {
  const yields: Record<string, number> = {};
  for (const [resource, quantity] of Object.entries(food.composition)) {
    for (const [reserve, rate] of Object.entries(profile.assimilation[resource] ?? {})) {
      yields[reserve] = (yields[reserve] ?? 0) + quantity * rate * profile.efficiency;
    }
  }
  return yields;
}

export function ingest(world: World, food: FoodDefinition, ticksPerSecond: number): boolean {
  const p = world.player;
  if (!world.species.diet.includes(food.id)) return false;
  for (const [id, amount] of Object.entries(food.composition)) p.nutrients[id] = (p.nutrients[id] ?? 0) + amount;
  // Absorption is unconditional for compatible food. Processing never blocks pickup.
  p.digestion.push({ foodId: food.id, completesAtTick: world.tick + Math.ceil(food.digestionSeconds * ticksPerSecond), composition: { ...food.composition } });
  p.eaten++;
  p.lastAbsorbedTick = world.tick;
  p.lastFoodId = food.id;
  return true;
}

export function metabolize(world: World, dt: number, movement: number): void {
  const p = world.player;
  const profile = world.nutrition.metabolism[world.species.metabolismId];
  p.digestion = p.digestion.filter(meal => meal.completesAtTick > world.tick);
  const digesting: Record<string, number> = {};
  for (const meal of p.digestion) for (const [id, amount] of Object.entries(meal.composition)) digesting[id] = (digesting[id] ?? 0) + amount;
  for (const [id, stored] of Object.entries(p.nutrients)) {
    const conversion = profile.assimilation[id];
    if (!conversion) continue;
    const available = Math.max(0, stored - (digesting[id] ?? 0));
    // Use only the amount needed by at least one reserve; retain the rest as current stock.
    let needed = 0;
    for (const [reserve, rate] of Object.entries(conversion)) {
      needed = Math.max(needed, (profile.reserves[reserve].capacity - p.reserves[reserve]) / (rate * profile.efficiency));
    }
    const used = Math.min(available, Math.max(0, needed));
    if (used <= 1e-9) continue;
    p.nutrients[id] = Math.max(0, stored - used);
    for (const [reserve, rate] of Object.entries(conversion)) {
      p.reserves[reserve] = Math.min(profile.reserves[reserve].capacity, p.reserves[reserve] + used * rate * profile.efficiency);
    }
  }
  sustain(world, dt, movement);
  let growth = Math.min(profile.maxGrowthPerSecond * dt, Math.max(0, world.species.growth.maximumMass - p.mass));
  // This milestone models producer growth during illumination; stored carbon
  // still maintains energy in shade. Full heterotrophy is not modeled.
  if (world.species.photosynthesis) growth *= environmentAt(world.arena, p).light;
  for (const [id, cost] of Object.entries(profile.growthCost)) growth = Math.min(growth, p.reserves[id] / cost);
  if (growth < 1e-9) growth = 0;
  for (const [id, cost] of Object.entries(profile.growthCost)) p.reserves[id] = Math.max(0, p.reserves[id] - cost * growth);
  p.mass += growth;
  p.growthRate = growth / dt;
}

// Read-only presentation/AI query: find the next growth bottleneck, not the largest reserve.
export function limitingResource(player: PlayerState, profile: MetabolismDefinition): string | null {
  let lowest = 1;
  let limiting: string | null = null;
  for (const [id, cost] of Object.entries(profile.growthCost)) {
    const available = player.reserves[id] / cost;
    if (available < lowest) { lowest = available; limiting = id; }
  }
  return limiting;
}
