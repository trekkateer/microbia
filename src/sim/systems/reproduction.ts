import type { PlayerState, Vec2, World } from '../types';
import { createOrganism } from '../world';
import { updateGrowth } from './growth';
import { segmentDistanceSquared } from '../membrane';
import { resolveBodies } from './collisions';
import { HUNGER } from './hunger';

type ReproductionWorld = Pick<World, 'tick' | 'arena' | 'roster' | 'player' | 'organisms'>;

export function reproductionBlock(world: ReproductionWorld, actor: PlayerState): string | null {
  const species = world.roster[actor.speciesId], rule = species.reproduction;
  if (!rule) return 'Cannot divide';
  if (!actor.alive) return 'Life ended';
  if (actor.satiety <= HUNGER.warning) return 'Eat to recover hunger before dividing';
  const threshold = species.growth.maximumMass * rule.threshold;
  if (actor.mass < threshold) return `Grow to ${Number(threshold.toFixed(2))} mass (${Math.round(rule.threshold * 100)}%)`;
  if (actor.protectedUntil > world.tick) return 'Settling in';
  if (actor.stunnedUntil > world.tick) return 'Cannot divide while stunned';
  if (actor.ability) return 'Finish your active ability first';
  if ([world.player, ...world.organisms].some(p => p.alive && p.ability?.targetId === actor.id)) return 'Escape capture before dividing';
  return null;
}

function divisionPositions(world: World, actor: PlayerState, radius: number): [Vec2, Vec2] {
  const margin = radius * 1.4 + 2, offset = margin + 2;
  const obstacles = [world.player, ...world.organisms].filter(p => p !== actor && p.alive);
  const clear = (point: Vec2) => {
    if (point.x < margin || point.x > world.arena.map.width - margin || point.y < margin || point.y > world.arena.map.height - margin) return false;
    const minX = Math.min(actor.x, point.x), maxX = Math.max(actor.x, point.x);
    const minY = Math.min(actor.y, point.y), maxY = Math.max(actor.y, point.y);
    for (const other of obstacles) {
      const reach = margin + other.radius * 1.4;
      if (other.x < minX - reach || other.x > maxX + reach || other.y < minY - reach || other.y > maxY + reach) continue;
      if (segmentDistanceSquared(other, actor, point) <= reach * reach) return false;
    }
    return true;
  };
  // Prefer an open orientation, but crowding never prevents division.
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = actor.heading + Math.PI / 2 + attempt * Math.PI / 16;
    const dx = Math.cos(angle) * offset, dy = Math.sin(angle) * offset;
    const a = { x: actor.x - dx, y: actor.y - dy }, b = { x: actor.x + dx, y: actor.y + dy };
    if (clear(a) && clear(b)) return [a, b];
  }
  // Start inside the old membrane and let solid-body separation make room.
  // Do not teleport a daughter to the far side of a neighboring organism.
  const dx = Math.cos(actor.heading + Math.PI / 2), dy = Math.sin(actor.heading + Math.PI / 2);
  return [{ x: actor.x - dx, y: actor.y - dy }, { x: actor.x + dx, y: actor.y + dy }];
}

export function reproduce(world: World, actor: PlayerState, deferResolution = false): boolean {
  const blocked = reproductionBlock(world, actor);
  if (blocked) { actor.reproductionMessage = blocked; return false; }
  const species = world.roster[actor.speciesId];
  const halfMass = actor.mass / 2;
  const radius = species.growth.startingRadius * Math.sqrt(halfMass / species.growth.startingMass);
  const positions = divisionPositions(world, actor, radius);

  const child = createOrganism(species, world.nutrition, `offspring-${world.nextOrganismId++}`, positions[1].x, positions[1].y, halfMass);
  const half = (amounts: Record<string, number>) => Object.fromEntries(Object.entries(amounts).map(([id, amount]) => [id, amount / 2]));
  // Pending meals are already counted in stock. Split both records, preserving
  // completion ticks, so neither daughter gains a second digestion reward.
  actor.nutrients = half(actor.nutrients); child.nutrients = { ...actor.nutrients };
  actor.reserves = half(actor.reserves); child.reserves = { ...actor.reserves };
  actor.digestion = actor.digestion.map(meal => ({ ...meal, composition: half(meal.composition) }));
  child.digestion = actor.digestion.map(meal => ({ ...meal, composition: { ...meal.composition } }));
  actor.mass = halfMass;
  actor.x = positions[0].x; actor.y = positions[0].y;
  actor.divisionCount++;
  actor.reproductionMessage = actor.kind === 'player' ? 'Divided · both cells are yours' : 'Divided';
  child.kind = actor.kind === 'player' ? 'player' : 'ai'; child.parentId = actor.id; child.heading = actor.heading;
  child.ownerId = actor.ownerId;
  child.colonyId = actor.colonyId;
  child.cooldownUntil = actor.cooldownUntil; child.hungryTicks = actor.hungryTicks; child.satiety = actor.satiety;
  child.lastFoodId = actor.lastFoodId;
  child.ai = child.kind === 'player' ? null : actor.ai ? { ...actor.ai, direction: { ...actor.ai.direction } } : { profileId: species.reproduction!.offspringAi, mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: world.tick + 1, wanderAt: 0, wanderAngle: actor.heading, targetId: null };
  for (const daughter of [actor, child]) {
    daughter.velocity = { x: 0, y: 0 }; daughter.pendingMotion = { x: 0, y: 0 };
    daughter.motionPath = [{ x: daughter.x, y: daughter.y }]; daughter.stretch = 0; daughter.growthRate = 0;
    updateGrowth({ ...world, player: daughter, species });
  }
  world.organisms.push(child);
  if (deferResolution) return true;
  finishReproduction(world, new Set([actor.id, child.id]));
  return true;
}

export function finishReproduction(world: World, daughters: ReadonlySet<string>): void {
  for (const key of resolveBodies(world)) world.contacts.add(key);
  // Preserve neighbors' resolved paths and keep newborn interpolation local.
  for (const other of [world.player, ...world.organisms]) {
    if (daughters.has(other.id)) other.motionPath = [{ x: other.x, y: other.y }];
    else other.motionPath.push({ x: other.x, y: other.y });
  }
}
