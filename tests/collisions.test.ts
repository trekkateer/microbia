import { expect, it } from 'vitest';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import { paramecium } from '../src/data/species/paramecium';
import { didinium } from '../src/data/species/didinium';
import { createOrganism, createWorld } from '../src/sim/world';
import { bodyHull, moveBodies, penetration, resolveBodies } from '../src/sim/systems/collisions';
import { step } from '../src/sim/step';

function scene() {
  const w = createWorld({ ...pond, practiceTargets: [] }, amoeba);
  w.foodParticles = [];
  const other = createOrganism(paramecium, w.nutrition, 'other', w.player.x + 90, w.player.y, 35);
  w.organisms = [other];
  return { w, other };
}
it('solid membranes prevent sustained steering through another cell', () => {
  const { w, other } = scene();
  for (let tick = 0; tick < 120; tick++) {
    step(w, { direction: { x: 1, y: 0 } });
    expect(penetration(bodyHull(w, w.player), bodyHull(w, other), 0)).toBeNull();
  }
});
it('high-speed motion and defensive knockback cannot tunnel through bodies', () => {
  const { w, other } = scene();
  moveBodies(w, new Map([[w.player.id, { x: 400, y: 0 }]]));
  expect(w.contacts.size).toBeGreaterThan(0);
  for (let index = 0; index < w.player.motionPath.length; index++) {
    expect(penetration(bodyHull(w, { ...w.player, ...w.player.motionPath[index] }), bodyHull(w, { ...other, ...other.motionPath[index] }), 0)).toBeNull();
  }
  expect(penetration(bodyHull(w, w.player), bodyHull(w, other), 0)).toBeNull();
  moveBodies(w, new Map([[other.id, { x: -700, y: 0 }]]));
  for (let index = 0; index < w.player.motionPath.length; index++) {
    expect(penetration(bodyHull(w, { ...w.player, ...w.player.motionPath[index] }), bodyHull(w, { ...other, ...other.motionPath[index] }), 0)).toBeNull();
  }
  expect(penetration(bodyHull(w, w.player), bodyHull(w, other), 0)).toBeNull();
});
it('separates coincident bodies and growth against the wall without NaN or visible overlap', () => {
  const { w, other } = scene();
  w.player.x = other.x = 20;
  w.player.y = other.y = 20;
  w.player.radius *= 2;
  other.heading = Math.PI / 2;
  for (let tick = 0; tick < 10; tick++) resolveBodies(w);
  expect(penetration(bodyHull(w, w.player), bodyHull(w, other), 0)).toBeNull();
  for (const actor of [w.player, other]) for (const p of bodyHull(w, actor)) {
    expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeGreaterThanOrEqual(0);
  }
});
it('a toxicyst strike still hits at the solid membrane and starts capture', () => {
  const { w, other } = scene();
  w.species = didinium; w.roster = { ...w.roster, [didinium.id]: didinium };
  w.player = createOrganism(didinium, w.nutrition, 'local-player', other.x - 100, other.y);
  step(w, { direction: { x: 1, y: 0 }, activate: true });
  for (let i = 0; i < 8; i++) step(w, { direction: { x: 0, y: 0 } });
  expect(other.stunnedUntil).toBeGreaterThan(w.tick);
  expect(w.player.ability?.effect).toBe('capture');
  expect(penetration(bodyHull(w, w.player), bodyHull(w, other), 0)).toBeNull();
});

it('invalidates cached shapes after growth, turning, stretch and a new tick', () => {
  const { w, other } = scene();
  resolveBodies(w);
  for (const change of ['growth', 'turn', 'stretch', 'tick']) {
    w.player.x = 1000; w.player.y = 1000; other.x = 1050; other.y = 1000;
    if (change === 'growth') w.player.radius *= 2;
    if (change === 'turn') other.heading = Math.PI / 2;
    if (change === 'stretch') w.player.stretch = 0.1;
    if (change === 'tick') w.tick += 100;
    resolveBodies(w);
    expect(penetration(bodyHull(w, w.player), bodyHull(w, other), 0)).toBeNull();
  }
});
