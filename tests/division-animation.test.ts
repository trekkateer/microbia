import { expect, it } from 'vitest';
import { createWorld, snapshot } from '../src/sim/world';
import { pond } from './fixtures';
import { paramecium } from '../src/data/species/paramecium';
import { reproduce } from '../src/sim/systems/reproduction';
import { DivisionAnimations, DIVISION_SECONDS } from '../src/client/rendering/division-animation';

it('animates a birth continuously without mutating the simulation and completes exactly at daughter positions', () => {
  const world = createWorld({ ...pond, practiceTargets: [] }, paramecium);
  world.player.mass = 100; world.player.protectedUntil = 0;
  const animation = new DivisionAnimations(snapshot(world));
  expect(reproduce(world, world.player)).toBe(true);
  const state = snapshot(world), original = JSON.stringify(state);
  const start = animation.update(state, 1, DIVISION_SECONDS / 2);
  const child = start.organisms.find(p => p.parentId === start.player.id)!;
  expect(child.radius).toBe(0);
  expect(child.x).toBe(start.player.x);
  const middle = animation.update(state, 1, DIVISION_SECONDS / 2);
  const daughter = middle.organisms.find(p => p.id === child.id)!;
  expect(daughter.radius).toBeGreaterThan(0);
  expect(daughter.radius).toBeLessThan(state.organisms.find(p => p.id === child.id)!.radius);
  expect(animation.necks[0].width).toBeGreaterThan(0);
  const end = animation.update(state, 1, 0);
  expect(end.player).toEqual(state.player);
  expect(animation.necks).toHaveLength(0);
  expect(JSON.stringify(state)).toBe(original);
});

it('does not animate an existing colony on join and clears a split when a daughter dies', () => {
  const world = createWorld({ ...pond, practiceTargets: [] }, paramecium);
  world.player.mass = 100; world.player.protectedUntil = 0;
  const animation = new DivisionAnimations(snapshot(world));
  reproduce(world, world.player);
  const state = snapshot(world);
  const joining = new DivisionAnimations(state);
  joining.update(state, 1, 0.1);
  expect(joining.necks).toHaveLength(0);
  animation.update(state, 1, 0.1);
  state.organisms.find(p => p.parentId === state.player.id)!.alive = false;
  animation.update(state, 1, 0.1);
  expect(animation.necks).toHaveLength(0);
  expect(animation.activeIds.size).toBe(0);
});
