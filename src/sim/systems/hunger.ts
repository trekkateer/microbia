import type { World } from '../types';

// Normalized game balance, not a biochemical concentration model.
export const HUNGER = {
  shortageSeconds: 45,
  recoverySeconds: 12,
  deathSeconds: 30,
  warning: 0.25,
} as const;

// Maintenance gets first use of processed reserves, before biomass production.
// Raw food and pending digestion must still pass through ordinary metabolism.
export function sustain(world: World, dt: number, movement: number): void {
  const p = world.player, profile = world.nutrition.metabolism[world.species.metabolismId];
  const scale = Math.max(0.5, p.mass / world.species.growth.startingMass);
  let supplied = true;
  const pay = (id: string, rate: number) => {
    const cost = rate * dt * scale;
    const available = p.reserves[id] ?? 0;
    if (available + 1e-9 < cost) supplied = false;
    p.reserves[id] = Math.max(0, available - cost);
  };
  pay(profile.energyReserveId, profile.upkeepPerSecond + profile.movementCostPerSecond * movement);
  for (const [id, rate] of Object.entries(profile.maintenancePerSecond ?? {})) pay(id, rate);
  p.satiety = Math.max(0, Math.min(1, p.satiety + (supplied ? dt / HUNGER.recoverySeconds : -dt / HUNGER.shortageSeconds)));
  if (p.satiety >= HUNGER.warning) p.hungryTicks = 0;
}
