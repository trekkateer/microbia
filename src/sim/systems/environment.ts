import type { ArenaDefinition } from '../../data/schemas';
import type { PlayerState, Vec2, World } from '../types';
import { safeDirection } from '../commands';

export const contains = (area: Vec2 & { radius: number }, p: Vec2) => Math.hypot(area.x - p.x, area.y - p.y) <= area.radius;

// Membership uses the organism's center. Shade wins overlapping light zones;
// currents sum, while the strongest cold slowdown wins.
export function environmentAt(arena: ArenaDefinition, p: Vec2) {
  let light = arena.ambientLight ?? 0.3, speedMultiplier = 1;
  const current = { x: 0, y: 0 };
  const zones = arena.zones.filter(z => contains(z, p));
  const lights = zones.filter(z => z.effectId === 'light');
  if (lights.length) light = Math.min(...lights.map(z => z.light));
  for (const zone of zones) if (zone.effectId === 'current') {
    current.x += zone.velocity.x; current.y += zone.velocity.y;
    speedMultiplier = Math.min(speedMultiplier, zone.speedMultiplier);
  }
  return { light, speedMultiplier, current, zones };
}

export function favorableLight(arena: ArenaDefinition, p: Vec2): Vec2 | null {
  const light = environmentAt(arena, p).light;
  const zones = arena.zones.filter(z => z.effectId === 'light' && z.light >= Math.max(0.8, light))
    .filter(z => environmentAt(arena, z).light >= 0.8)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  return zones.length ? safeDirection({ x: zones[0].x - p.x, y: zones[0].y - p.y }) : null;
}

export function renewDissolved(world: World, dt: number): void {
  for (const patch of world.dissolvedPatches) {
    const definition = world.arena.dissolvedPatches!.find(p => p.id === patch.id)!;
    for (const [id, resource] of Object.entries(definition.resources)) patch.resources[id] = Math.min(resource.capacity, patch.resources[id] + resource.renewal * dt);
  }
}

export function uptakeAndProduce(world: World, actor: PlayerState, dt: number): void {
  const species = world.roster[actor.speciesId];
  for (const [id, uptake] of Object.entries(species.dissolvedUptake ?? {})) {
    let remaining = Math.min(uptake.rate * dt, Math.max(0, uptake.capacity - (actor.nutrients[id] ?? 0)));
    for (const patch of world.dissolvedPatches) {
      const definition = world.arena.dissolvedPatches!.find(p => p.id === patch.id)!;
      if (!contains(definition, actor)) continue;
      const amount = Math.min(remaining, patch.resources[id] ?? 0);
      if (amount <= 0) continue;
      patch.resources[id] -= amount;
      actor.nutrients[id] = (actor.nutrients[id] ?? 0) + amount;
      actor.lastAbsorbedTick = world.tick;
      remaining -= amount;
    }
  }
  const photo = species.photosynthesis;
  if (!photo) return;
  const light = environmentAt(world.arena, actor).light;
  const amount = Math.min(photo.rate * dt * light, actor.nutrients[photo.input] ?? 0, Math.max(0, photo.capacity - (actor.nutrients[photo.output] ?? 0)));
  actor.nutrients[photo.input] = Math.max(0, (actor.nutrients[photo.input] ?? 0) - amount);
  actor.nutrients[photo.output] = (actor.nutrients[photo.output] ?? 0) + amount;
  if (light === 0) actor.mass = Math.max(Math.min(actor.spawnMass, species.starvation.minimumMass), actor.mass - photo.darkMassLoss * dt);
}
