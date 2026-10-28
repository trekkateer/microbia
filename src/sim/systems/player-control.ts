import type { MoveCommand } from '../commands';
import { safeDirection } from '../commands';
import type { PlayerState, Vec2, World } from '../types';
import { abilities } from '../../data/abilities/pond';
import { abilityBlock, activateAbility, eligiblePrey } from './abilities';

export function playerCells(world: Pick<World, 'player' | 'organisms'>): PlayerState[] {
  return [world.player, ...world.organisms.filter(p => p.kind === 'player' && p.ownerId === world.player.ownerId)].filter(p => p.alive);
}

export function playerCellCommand(actor: PlayerState, command: MoveCommand): MoveCommand {
  if (!command.target || !Number.isFinite(command.target.x) || !Number.isFinite(command.target.y)) return { ...command, direction: safeDirection(command.direction) };
  const dx = command.target.x - actor.x, dy = command.target.y - actor.y, distance = Math.hypot(dx, dy);
  const strength = Math.max(0, Math.min(1, (distance - 18) / 70));
  return { ...command, direction: { x: distance ? dx / distance * strength : 0, y: distance ? dy / distance * strength : 0 } };
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
// Heading records swimming direction; collision pushes and currents must not
// turn the targeting cone around. At rest, retain the last swimming direction.
const movementAim = (cell: PlayerState): Vec2 => ({ x: Math.cos(cell.heading), y: Math.sin(cell.heading) });

// Amoeba uses each cell's swimming heading and prey proximity. Other hunters
// retain pointer/group-cone aiming. Only an eligible, ready cell can attack.
export function selectPlayerAttacker(world: World, command: MoveCommand): { actor: PlayerState; target: PlayerState } | null {
  const cells = playerCells(world);
  if (!cells.length) return null;
  if (world.species.activeId && abilities[world.species.activeId].visual === 'pseudopods') {
    let best: { actor: PlayerState; target: PlayerState } | null = null, bestDistance = Infinity;
    for (const actor of cells) {
      if (abilityBlock(world, actor)) continue;
      const aim = movementAim(actor);
      for (const target of world.organisms) {
        if (!eligiblePrey(world, actor, target)) continue;
        const d = distance(actor, target);
        if ((target.x - actor.x) * aim.x + (target.y - actor.y) * aim.y < d * 0.35) continue;
        const gap = Math.max(0, d - actor.radius - target.radius);
        if (gap < bestDistance || (gap === bestDistance && `${target.id}|${actor.id}` < `${best?.target.id}|${best?.actor.id}`)) {
          best = { actor, target }; bestDistance = gap;
        }
      }
    }
    return best;
  }
  const center = { x: cells.reduce((n, p) => n + p.x, 0) / cells.length, y: cells.reduce((n, p) => n + p.y, 0) / cells.length };
  const aim = Math.hypot(command.direction.x, command.direction.y) > 0 ? safeDirection(command.direction) : { x: Math.cos(world.player.heading), y: Math.sin(world.player.heading) };
  const cursor = command.target && Number.isFinite(command.target.x) && Number.isFinite(command.target.y) ? command.target : null;
  const targets = world.organisms.filter(p => !cells.includes(p) && cells.some(cell => eligiblePrey(world, cell, p)))
    .filter(p => cursor || (p.x - center.x) * aim.x + (p.y - center.y) * aim.y >= distance(center, p) * 0.35);
  const score = (p: PlayerState) => cursor ? Math.max(0, distance(cursor, p) - p.radius) : distance(center, p) + Math.abs((p.x - center.x) * aim.y - (p.y - center.y) * aim.x) * 2;
  targets.sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
  const target = targets[0];
  if (!target) return null;
  const ready = cells.filter(cell => eligiblePrey(world, cell, target) && !abilityBlock(world, cell));
  ready.sort((a, b) => distance(a, target) - distance(b, target) || a.id.localeCompare(b.id));
  return ready.length ? { actor: ready[0], target } : null;
}

export function activatePlayerAbility(world: World, command: MoveCommand, rate: number): void {
  const ability = world.species.activeId ? abilities[world.species.activeId] : null;
  const cells = playerCells(world);
  if (!ability || !cells.length) return;
  if (ability.effect === 'capture' || ability.effect === 'strike') {
    const selection = selectPlayerAttacker(world, command);
    if (selection) {
      activateAbility(world, selection.actor, { x: selection.target.x - selection.actor.x, y: selection.target.y - selection.actor.y }, rate, selection.target.id);
      return;
    }
    // Preserve free aiming/lunging when there is no eligible target under aim.
    const ready = cells.filter(cell => !abilityBlock(world, cell));
    const actor = ability.visual === 'pseudopods' ? ready[0] ?? world.player : ready.sort((a, b) => command.target ? distance(a, command.target) - distance(b, command.target) : distance(a, world.player) - distance(b, world.player))[0] ?? world.player;
    activateAbility(world, actor, ability.visual === 'pseudopods' ? movementAim(actor) : playerCellCommand(actor, command).direction, rate);
  } else for (const cell of cells) activateAbility(world, cell, playerCellCommand(cell, command).direction, rate);
}

export function keepPlayerAlive(world: World): void {
  if (world.player.alive) return;
  const survivor = world.organisms.find(p => p.kind === 'player' && p.ownerId === world.player.ownerId && p.alive);
  if (!survivor) return;
  world.organisms = world.organisms.filter(p => p !== survivor);
  world.player = survivor;
}
