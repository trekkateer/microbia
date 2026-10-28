import type { World } from '../types';

export function updateGrowth(world: World): void {
  const g = world.species.growth;
  const p = world.player;
  p.mass = Math.min(g.maximumMass, Math.max(Math.min(world.species.starvation.minimumMass, p.spawnMass), p.mass));
  p.radius = g.startingRadius * Math.sqrt(p.mass / g.startingMass);
  const progress = Math.max(0, (p.mass - g.startingMass) / Math.max(1, g.maximumMass - g.startingMass));
  p.speed = g.startingSpeed + (g.minimumSpeed - g.startingSpeed) * progress;
}

export function constrainToMap(world: World): void {
  const p = world.player;
  p.x = Math.max(p.radius, Math.min(world.arena.map.width - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(world.arena.map.height - p.radius, p.y));
}
