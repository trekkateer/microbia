import { expect, it } from 'vitest';
import { AbilityAnimations } from '../src/client/rendering/ability-animations';
import { species } from '../src/data';
import { abilities } from '../src/data/abilities/pond';
import { pond } from './fixtures';
import { createWorld, snapshot } from '../src/sim/world';

it.each(Object.values(species).filter(s => s.id !== 'amoeba-proteus'))('$name has a timed, bounded animation that fades without altering simulation state', entry => {
  const w = createWorld({ ...pond, practiceTargets: [] }, entry);
  const ability = abilities[entry.activeId!];
  w.player.ability = { effect: ability.effect, startedAtTick: 0, until: 60, direction: { x: 1, y: 0 }, targetId: null };
  const animations = new AbilityAnimations();
  for (let tick = 0; tick <= 30; tick++) {
    w.tick = tick; w.player.x++; w.player.motionPath = [{ x: w.player.x, y: w.player.y }];
    const current = snapshot(w), before = structuredClone(current);
    const visuals = animations.update(current, tick, 1, species);
    expect(current).toEqual(before); expect(visuals).toHaveLength(1);
    expect(visuals[0].style).toBe(ability.visual); expect(visuals[0].trail.length).toBeLessThanOrEqual(14);
  }
  expect(animations.update(snapshot(w), 30, 1, species)[0].progress).toBe(0.5);
  w.player.ability = null;
  animations.update(snapshot(w), 31, 1, species);
  expect(animations.update(snapshot(w), 40, 1, species)[0].opacity).toBe(0.5);
  expect(animations.update(snapshot(w), 50, 1, species)).toHaveLength(0);
});

it('clears visual effects on death and respawn', () => {
  const entry = species['euglena-gracilis'], w = createWorld(pond, entry), animations = new AbilityAnimations();
  w.player.ability = { effect: 'phototaxis', startedAtTick: 0, until: 60, direction: { x: 1, y: 0 }, targetId: null };
  animations.update(snapshot(w), 0, 1, species);
  w.player.alive = false;
  expect(animations.update(snapshot(w), 1, 1, species)).toHaveLength(0);
  w.player.alive = true; w.player.generation++; w.player.ability = null;
  expect(animations.update(snapshot(w), 2, 1, species)).toHaveLength(0);
});
