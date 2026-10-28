import type { MoveCommand } from './commands';
import { safeDirection } from './commands';
import type { PlayerState, Vec2, World } from './types';
import { updateGrowth } from './systems/growth';
import { foodPositionClear, placeFood } from './world';
import { ingest, metabolize } from './systems/metabolism';
import { membraneSweep, segmentDistanceSquared, touchesMembraneSweep } from './membrane';
import { activateAbility, advanceAbility } from './systems/abilities';
import { abilities } from '../data/abilities/pond';
import { moveBodies } from './systems/collisions';
import { aiColonyCommands } from './systems/ai';
import { killOrganism, respawnOrganism } from './systems/lifecycle';
import { environmentAt, renewDissolved, uptakeAndProduce } from './systems/environment';
import { reproduce, finishReproduction } from './systems/reproduction';
import { activatePlayerAbility, keepPlayerAlive, playerCellCommand } from './systems/player-control';
import { SpatialGrid } from './spatial-grid';
import { HUNGER } from './systems/hunger';

export const TICK_RATE = 30;
export const FIXED_DT = 1 / TICK_RATE;

export function step(world: World, command: MoveCommand, remoteCommands?: ReadonlyMap<string, MoveCommand>): void {
  world.tick++;
  world.organisms = world.organisms.filter(p => p.alive || p.parentId === null || (p.kind === 'player' && p.ownerId !== undefined));
  keepPlayerAlive(world);
  renewDissolved(world, FIXED_DT);
  const owners = new Map<string | undefined, PlayerState>();
  for (const p of [world.player, ...world.organisms]) if ((p.kind === 'player' || (!remoteCommands && p === world.player)) && (!owners.has(p.ownerId) || (!owners.get(p.ownerId)!.alive && p.alive))) owners.set(p.ownerId, p);
  const inputFor = (p: PlayerState): MoveCommand => remoteCommands ? remoteCommands.get(p.ownerId ?? '') ?? { direction: { x: 0, y: 0 } } : command;
  const viewFor = (p: PlayerState): World => ({ ...world, player: p, species: world.roster[p.speciesId], organisms: [world.player, ...world.organisms].filter(other => other !== p) });
  for (const p of owners.values()) if (inputFor(p).respawn) respawnOrganism(viewFor(p), p, TICK_RATE);
  for (const actor of world.organisms) if (actor.ai && !actor.alive) respawnOrganism(world, actor, TICK_RATE);
  const actors = [world.player, ...world.organisms].filter(p => p.alive);
  const pose = (p: PlayerState, time: number) => ({ x: p.x, y: p.y, radius: p.radius, heading: p.heading, stretch: p.stretch, time, shape: world.roster[p.speciesId].visual.shape });
  const before = new Map(actors.map(p => [p.id, pose(p, (world.tick - 1) * FIXED_DT)]));
  const commands = aiColonyCommands(world, actors, TICK_RATE);
  for (const p of actors) if (p.kind === 'player') commands.set(p.id, playerCellCommand(p, inputFor(p)));
  for (const p of owners.values()) if (inputFor(p).activate) activatePlayerAbility(viewFor(p), inputFor(p), TICK_RATE);
  for (const actor of actors) {
    const input = commands.get(actor.id)!;
    if (actor.kind !== 'player' && input.activate) {
      const ability = abilities[world.roster[actor.speciesId].activeId!];
      const targetId = ability && ['capture', 'strike'].includes(ability.effect) ? actor.ai?.targetId ?? undefined : undefined;
      activateAbility(world, actor, safeDirection(input.direction), TICK_RATE, targetId);
    }
  }
  const movements = new Map<string, Vec2>();
  for (const p of actors) {
    const definition = p === world.player ? world.species : world.roster[p.speciesId];
    const ability = definition.activeId ? abilities[definition.activeId] : null;
    let direction = safeDirection(commands.get(p.id)!.direction);
    if (p.stunnedUntil > world.tick) direction = { x: 0, y: 0 };
    else if (p.ability && p.ability.until > world.tick && p.ability.effect !== 'capture' && ability) {
      direction = { x: p.ability.direction.x * ability.speed / p.speed, y: p.ability.direction.y * ability.speed / p.speed };
      if (p.ability.effect === 'phototaxis' && Math.hypot(direction.x, direction.y) > 0) {
        const target = Math.atan2(direction.y, direction.x);
        const turn = Math.atan2(Math.sin(target - p.heading), Math.cos(target - p.heading));
        const heading = p.heading + Math.max(-definition.turnRate * FIXED_DT, Math.min(definition.turnRate * FIXED_DT, turn));
        const magnitude = Math.hypot(direction.x, direction.y);
        direction = { x: Math.cos(heading) * magnitude, y: Math.sin(heading) * magnitude };
      }
    }
    else if (Math.hypot(p.velocity.x, p.velocity.y) > 0.01 && Math.hypot(direction.x, direction.y) > 0) {
      const previousHeading = p.heading, targetHeading = Math.atan2(direction.y, direction.x);
      const turn = Math.atan2(Math.sin(targetHeading - previousHeading), Math.cos(targetHeading - previousHeading));
      const heading = previousHeading + Math.max(-definition.turnRate * FIXED_DT, Math.min(definition.turnRate * FIXED_DT, turn));
      const magnitude = Math.hypot(direction.x, direction.y);
      direction = { x: Math.cos(heading) * magnitude, y: Math.sin(heading) * magnitude };
    }
    const moving = Math.hypot(direction.x, direction.y) > 0.001;
    if (moving) p.heading = Math.atan2(direction.y, direction.x);
    p.stretch += ((moving ? 0.1 : 0) - p.stretch) * (1 - Math.exp(-FIXED_DT * 8));
    if (p.kind !== 'fixture' || p === world.player) {
      const actorWorld = { ...world, player: p, species: definition };
      uptakeAndProduce(world, p, FIXED_DT);
      metabolize(actorWorld, FIXED_DT, Math.min(1, Math.hypot(direction.x, direction.y)));
      if (p.satiety <= 1e-9) {
        p.mass -= Math.max(definition.starvation.massPerSecond, 0.35, p.mass * 0.015) * FIXED_DT;
        p.hungryTicks++;
        const deathSeconds = definition.starvation.deathAfterSeconds ?? HUNGER.deathSeconds;
        if (world.arena.lifecycle && p.hungryTicks >= deathSeconds * TICK_RATE) killOrganism(world, p, 'Starvation', TICK_RATE);
      }
      // Use the previous speed for this tick; changing mass affects subsequent motion.
      const env = environmentAt(world.arena, p);
      movements.set(p.id, { x: (direction.x * p.speed * env.speedMultiplier + env.current.x) * FIXED_DT + p.pendingMotion.x, y: (direction.y * p.speed * env.speedMultiplier + env.current.y) * FIXED_DT + p.pendingMotion.y });
      updateGrowth(actorWorld);
    } else movements.set(p.id, { ...p.pendingMotion });
    p.pendingMotion = { x: 0, y: 0 };
  }
  moveBodies(world, movements);
  for (const p of actors) if (p.alive && (p.kind === 'player' || p.ai || p.ability)) advanceAbility(world, p, before.get(p.id)!, TICK_RATE);
  // Ability advancement changes capture/stun/life state, never body positions.
  // Movement already resolved contacts; a second full solve here is redundant.
  for (const particle of world.foodParticles) {
    if (particle.availableAtTick === world.tick && !foodPositionClear(world, particle, world.nutrition.foods[particle.foodId].radius)) placeFood(world, particle);
  }
  const foodGrid = new SpatialGrid(world.foodParticles.filter(particle => particle.availableAtTick <= world.tick));
  const maxFoodRadius = Math.max(0, ...Object.values(world.nutrition.foods).map(food => food.radius * 1.2));
  for (const p of actors) {
    if (!p.alive) continue;
    const start = before.get(p.id)!;
    const definition = p === world.player ? world.species : world.roster[p.speciesId];
    p.velocity = { x: (p.x - start.x) / FIXED_DT, y: (p.y - start.y) / FIXED_DT };
    p.motionPath[p.motionPath.length - 1] = { x: p.x, y: p.y };
    if (p.kind === 'fixture' && p !== world.player) continue;
    if (!definition.diet.length || !world.foodParticles.length) continue;
    const end = pose(p, world.tick * FIXED_DT);
    const paths = p.motionPath.slice(1).map((point, index) => ({ a: { ...start, ...p.motionPath[index] }, b: { ...end, ...point } }));
    const minX = Math.min(...p.motionPath.map(point => point.x)), maxX = Math.max(...p.motionPath.map(point => point.x));
    const minY = Math.min(...p.motionPath.map(point => point.y)), maxY = Math.max(...p.motionPath.map(point => point.y));
    let contours: ReturnType<typeof membraneSweep>[] | null = null;
    const broadReach = Math.max(start.radius, p.radius) * 1.4 + maxFoodRadius + 1;
    for (const particle of foodGrid.query(minX - broadReach, minY - broadReach, maxX + broadReach, maxY + broadReach)) {
      if (particle.availableAtTick > world.tick) continue;
      const food = world.nutrition.foods[particle.foodId];
      if (!definition.diet.includes(food.id)) continue;
      const contactRadius = food.radius * (food.shape === 'capsule' || food.shape === 'diamond' ? 1.2 : 1);
      const reach = Math.max(start.radius, p.radius) * 1.4 + contactRadius + 1;
      // Most particles are far away. Reject against the whole motion bounds
      // before checking individual segments or constructing membrane contours.
      if (particle.x < minX - reach || particle.x > maxX + reach || particle.y < minY - reach || particle.y > maxY + reach) continue;
      if (!paths.some(path => segmentDistanceSquared(particle, path.a, path.b) <= reach * reach)) continue;
      contours ??= paths.map(path => membraneSweep(path.a, path.b));
      if (!contours.some(contour => touchesMembraneSweep(particle, contactRadius, contour))) continue;
      if (!ingest({ ...world, player: p, species: definition }, food, TICK_RATE)) continue;
      const spawn = world.arena.foodSpawns.find(entry => entry.foodId === food.id)!;
      particle.availableAtTick = world.tick + Math.ceil(spawn.respawnSeconds * TICK_RATE);
      placeFood(world, particle);
    }
  }
  const daughters = new Set<string>();
  for (const actor of actors) if (commands.get(actor.id)?.reproduce && reproduce(world, actor, true)) {
    daughters.add(actor.id); daughters.add(world.organisms[world.organisms.length - 1].id);
  }
  if (daughters.size) finishReproduction(world, daughters);
  keepPlayerAlive(world);
}
