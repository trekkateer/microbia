import { expect, it } from 'vitest';
import { pond } from '../src/data/arenas/pond';
import { amoeba } from '../src/data/species/amoeba';
import { euglena } from '../src/data/species/euglena';
import { didinium } from '../src/data/species/didinium';
import { paramecium } from '../src/data/species/paramecium';
import { abilities } from '../src/data/abilities/pond';
import { createOrganism, createWorld } from '../src/sim/world';
import { reproduce } from '../src/sim/systems/reproduction';
import { aiColonyCommands, aiCommand } from '../src/sim/systems/ai';
import { activateAbility, advanceAbility } from '../src/sim/systems/abilities';
import { selectPlayerAttacker } from '../src/sim/systems/player-control';
import { step } from '../src/sim/step';

it('enlarges both pond dimensions by 50% and supports division beyond 256 cells', () => {
  expect(pond.map).toEqual({ width: 4800, height: 3600 });
  const w = createWorld({ ...pond, aiSpawns: [] }, amoeba);
  w.player.mass = 220; w.player.protectedUntil = 0;
  for (let i = 0; i < 300; i++) w.organisms.push(createOrganism(paramecium, w.nutrition, `cell-${i}`, 150 + i % 20 * 225, 150 + Math.floor(i / 20) * 220));
  expect(reproduce(w, w.player)).toBe(true);
  expect(w.organisms).toHaveLength(301);
});

it.each([amoeba, didinium])('$name transfers only its configured fraction of prey nutrients exactly once', species => {
  const w = createWorld({ ...pond, aiSpawns: [] }, species); w.player.protectedUntil = 0;
  const prey = createOrganism(paramecium, w.nutrition, 'meal', w.player.x + 60, w.player.y, 16);
  prey.nutrients.peptides = 12; prey.nutrients.nucleotides = 5;
  prey.digestion = [{ foodId: 'protein-fragment', composition: { peptides: 8 }, completesAtTick: 100 }];
  w.organisms = [prey];
  const ability = abilities[species.activeId], fraction = ability.transferFraction;
  w.player.ability = { effect: 'capture', startedAtTick: 0, until: 1, targetId: prey.id, direction: { x: 1, y: 0 } };
  w.tick = 1; advanceAbility(w, w.player, w.player, 30);
  expect(fraction).toBeLessThan(1);
  expect(w.player.nutrients.peptides).toBeCloseTo((16 * paramecium.bodyComposition.peptides + 12) * fraction);
  expect(w.player.nutrients.nucleotides).toBeCloseTo((16 * paramecium.bodyComposition.nucleotides + 5) * fraction);
  const received = w.player.nutrients.peptides;
  advanceAbility(w, w.player, w.player, 30);
  expect(w.player.nutrients.peptides).toBe(received); expect(prey.alive).toBe(false);
});

function escapeScene() {
  const w = createWorld({ ...pond, aiSpawns: [] }, amoeba);
  w.player.protectedUntil = 0; w.player.mass = 100; w.player.x = 2400; w.player.y = 1800;
  const cell = createOrganism(euglena, w.nutrition, 'green', 2250, 1800);
  cell.kind = 'ai'; cell.heading = Math.PI;
  cell.ai = { profileId: 'drifter', mode: 'forage', direction: { x: 1, y: 0 }, decisionAt: 1000, wanderAt: 1000, wanderAngle: 0, targetId: 'pool-center' };
  w.organisms = [cell];
  activateAbility(w, cell, { x: 1, y: 0 }, 30);
  return { w, cell };
}

it('Euglena immediately cancels light-seeking to flee even between AI decisions', () => {
  const { w, cell } = escapeScene();
  expect(cell.ability?.effect).toBe('phototaxis'); const paid = cell.reserves.energy, cooldown = cell.cooldownUntil;
  const command = aiCommand(w, cell, 30);
  expect(command.direction.x).toBeLessThan(0); expect(cell.ability).toBeNull();
  expect(cell.reserves.energy).toBe(paid); expect(cell.cooldownUntil).toBe(cooldown);
  const start = cell.x;
  for (let i = 0; i < 15; i++) step(w, { direction: { x: 0, y: 0 } });
  expect(cell.x).toBeLessThan(start);
});

it('a daughter spots danger for the colony and never regroups toward the predator', () => {
  const { w, cell } = escapeScene();
  const leader = createOrganism(euglena, w.nutrition, 'leader', 1800, 1800);
  leader.kind = 'ai'; leader.ai = { ...cell.ai!, direction: { x: 1, y: 0 } }; leader.colonyId = cell.colonyId;
  w.organisms.unshift(leader);
  const commands = aiColonyCommands(w, [leader, cell], 30);
  for (const actor of [leader, cell]) {
    const direction = commands.get(actor.id)!.direction;
    expect(direction.x * (actor.x - w.player.x) + direction.y * (actor.y - w.player.y)).toBeGreaterThan(0);
    expect(actor.ai!.mode).toBe('flee'); expect(actor.ability).toBeNull();
  }
});

it('escaping at a wall chooses a tangent instead of turning toward the predator', () => {
  const { w, cell } = escapeScene(); cell.x = 45; w.player.x = 145;
  const command = aiCommand(w, cell, 30);
  expect(command.direction.x).toBeLessThanOrEqual(0); expect(Math.abs(command.direction.y)).toBeGreaterThan(0);
});

it('Amoeba ignores a pointer over a distant cell and selects the closest prey along actual movement', () => {
  const w = createWorld({ ...pond, aiSpawns: [] }, amoeba); w.player.protectedUntil = 0;
  const make = (id: string, dx: number) => createOrganism(paramecium, w.nutrition, id, w.player.x + dx, w.player.y, 16);
  const near = make('near', 60), far = make('far', 350), behind = make('behind', -50); w.organisms = [far, behind, near];
  w.player.velocity = { x: 30, y: 0 };
  for (const target of [far, behind]) expect(selectPlayerAttacker(w, { direction: { x: -1, y: 0 }, target })?.target).toBe(near);
  w.player.velocity = { x: -30, y: 0 }; // An external push cannot change swimming aim.
  expect(selectPlayerAttacker(w, { direction: { x: 0, y: 0 }, target: far })?.target).toBe(near);
  w.player.heading = Math.PI;
  expect(selectPlayerAttacker(w, { direction: { x: 1, y: 0 }, target: far })?.target).toBe(behind);
  w.player.velocity = { x: 0, y: 0 }; w.player.heading = Math.PI;
  expect(selectPlayerAttacker(w, { direction: { x: 0, y: 0 }, target: far })?.target).toBe(behind);
});
