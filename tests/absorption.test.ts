import { expect, it } from 'vitest';
import { AbsorptionPulses } from '../src/client/rendering/absorption-pulses';
import { createWorld, createOrganism } from '../src/sim/world';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import { euglena } from '../src/data/species/euglena';
import { ingest } from '../src/sim/systems/metabolism';
import { uptakeAndProduce } from '../src/sim/systems/environment';

it('animates each daughter independently when it absorbs food, even after becoming the surviving player', () => {
  const w = createWorld(pond, amoeba), pulses = new AbsorptionPulses();
  const child = createOrganism(amoeba, w.nutrition, 'daughter', 1600, 1400);
  child.kind = 'player'; child.parentId = w.player.id;
  const cells = [w.player, child];
  expect(pulses.update(cells, 0, 0).size).toBe(0);
  w.tick = 1;
  ingest({ ...w, player: child }, w.nutrition.foods.detritus, 30);
  expect([...pulses.update(cells, 1, 0.01).keys()]).toEqual([child.id]);
  w.tick = 2;
  ingest(w, w.nutrition.foods.detritus, 30);
  expect(pulses.update(cells, 2, 0.02).size).toBe(2);
  expect([...pulses.update([child], 3, 0.02).keys()]).toEqual([child.id]);
  expect(pulses.update([child], 25, 0.7).size).toBe(0);
  child.generation++; child.lastAbsorbedTick = -1;
  expect(pulses.update([child], 26, 0.01).size).toBe(0);
});

it('pulses during actual dissolved uptake without freezing the expanding animation or flashing at full storage', () => {
  const w = createWorld(pond, euglena), pulses = new AbsorptionPulses();
  w.arena = { ...w.arena, dissolvedPatches: [{ id: 'test', name: 'Test nutrients', x: w.player.x, y: w.player.y, radius: 200, resources: { ammonium: { capacity: 10, renewal: 0 } } }] };
  w.dissolvedPatches = [{ id: 'test', resources: { ammonium: 10 } }];
  for (let tick = 1; tick <= 6; tick++) {
    w.tick = tick; uptakeAndProduce(w, w.player, 1 / 30);
    const age = pulses.update([w.player], tick, 0.1).get(w.player.id)!;
    expect(age).toBeCloseTo(tick * 0.1);
  }
  w.player.nutrients.ammonium = euglena.dissolvedUptake.ammonium.capacity;
  const last = w.player.lastAbsorbedTick;
  w.tick = 7; uptakeAndProduce(w, w.player, 1 / 30);
  expect(w.player.lastAbsorbedTick).toBe(last);
  expect(pulses.update([w.player], 7, 0.1).size).toBe(0);
});
