import { expect, it } from 'vitest';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import { paramecium } from '../src/data/species/paramecium';
import { createOrganism, createWorld, snapshot } from '../src/sim/world';
import { reproduce } from '../src/sim/systems/reproduction';
import { aiColonyCommands } from '../src/sim/systems/ai';
import { eligiblePrey } from '../src/sim/systems/abilities';
import { killOrganism, respawnOrganism } from '../src/sim/systems/lifecycle';
import { updateGrowth } from '../src/sim/systems/growth';
import { step } from '../src/sim/step';

function scene(hunter = false) {
  const w = createWorld({ ...pond, practiceTargets: [], lifecycle: { playerRespawnSeconds: 3, aiRespawnSeconds: 7, protectionSeconds: 3, spawnClearance: 20 } }, amoeba);
  w.player.x = 2900; w.player.y = 2200; w.foodParticles = [];
  const species = hunter ? amoeba : paramecium;
  const parent = createOrganism(species, w.nutrition, 'colony-parent', 900, 900, species.growth.maximumMass);
  parent.kind = 'ai';
  parent.ai = { profileId: species.reproduction.offspringAi, mode: 'wander', direction: { x: 0.5, y: 0 }, decisionAt: 100000, wanderAt: 100000, wanderAngle: 0, targetId: null };
  w.organisms = [parent];
  reproduce(w, parent);
  return { w, parent, child: w.organisms[1] };
}

it('AI daughters and later generations inherit one colony without sharing mutable state', () => {
  const { w, parent, child } = scene();
  expect(child.colonyId).toBe(parent.colonyId);
  expect(child.ai).toEqual(parent.ai); expect(child.ai).not.toBe(parent.ai);
  expect(child.ai!.direction).not.toBe(parent.ai!.direction);
  expect(reproduce(w, child)).toBe(true);
  expect(w.organisms.every(p => p.colonyId === parent.colonyId)).toBe(true);
  expect(snapshot(w).organisms[2].colonyId).toBe(parent.colonyId);
});

it('a colony moves together despite unequal cell speeds and regroups a separated daughter', () => {
  const { w, parent, child } = scene();
  child.mass = 30; updateGrowth({ ...w, player: child, species: paramecium });
  child.x -= 250;
  const initial = Math.hypot(parent.x - child.x, parent.y - child.y), start = parent.x;
  for (let i = 0; i < 240; i++) step(w, { direction: { x: 0, y: 0 } });
  expect(parent.x).toBeGreaterThan(start + 200);
  expect(child.x).toBeGreaterThan(start);
  expect(Math.hypot(parent.x - child.x, parent.y - child.y)).toBeLessThan(initial * 0.65);
  expect(child.ai!.mode).toBe(parent.ai!.mode);
});

it('surviving daughters stay together after parent death; the founder respawns only after colony extinction', () => {
  const { w, parent, child } = scene();
  reproduce(w, child); const grandchild = w.organisms[2];
  const colonyId = parent.colonyId;
  killOrganism(w, parent, 'test', 30); w.tick = parent.respawnAtTick;
  expect(respawnOrganism(w, parent, 30)).toBe(false);
  const commands = aiColonyCommands(w, [child, grandchild], 30);
  expect(commands.get(child.id)!.direction.x).toBeGreaterThan(0);
  expect(commands.get(grandchild.id)!.direction.x).toBeGreaterThan(0);
  expect(child.colonyId).toBe(grandchild.colonyId);
  killOrganism(w, child, 'test', 30); killOrganism(w, grandchild, 'test', 30);
  expect(respawnOrganism(w, parent, 30)).toBe(true);
  expect(parent.colonyId).not.toBe(colonyId);
});

it('predator colonies protect relatives and choose the closest ready cell for their shared prey', () => {
  const { w, parent, child } = scene(true);
  parent.x = 800; parent.y = 900; child.x = 980; child.y = 900;
  child.mass = 30; updateGrowth({ ...w, player: child, species: amoeba });
  expect(eligiblePrey(w, parent, child)).toBe(false);
  const rival = createOrganism(amoeba, w.nutrition, 'unrelated', 1400, 900, 30);
  expect(eligiblePrey(w, parent, rival)).toBe(true);
  const prey = createOrganism(paramecium, w.nutrition, 'meal', 1040, 900, 16);
  w.organisms.push(prey); parent.ai!.decisionAt = 0;
  const commands = aiColonyCommands(w, [parent, child], 30);
  expect(parent.ai!.targetId).toBe(prey.id); expect(child.ai!.targetId).toBe(prey.id);
  expect(commands.get(child.id)!.activate).toBe(true);
  expect(commands.get(parent.id)!.activate).toBe(false);
});

it('colony decisions and reproduction replay deterministically', () => {
  const a = scene(), b = scene();
  a.parent.ai!.decisionAt = b.parent.ai!.decisionAt = 0;
  for (let i = 0; i < 100; i++) for (const { w } of [a, b]) step(w, { direction: { x: 0, y: 0 } });
  expect(snapshot(a.w)).toEqual(snapshot(b.w));
});
