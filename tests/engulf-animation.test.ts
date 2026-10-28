import { expect, it } from 'vitest';
import { createWorld, createOrganism, snapshot } from '../src/sim/world';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import { paramecium } from '../src/data/species/paramecium';
import { organisms } from '../src/data';
import { activateAbility, advanceAbility } from '../src/sim/systems/abilities';
import { EngulfAnimations } from '../src/client/rendering/engulf-animation';
import { pseudopodGeometry } from '../src/client/rendering/pseudopods';

function scene() {
  const world = createWorld({ ...pond, practiceTargets: [] }, amoeba);
  const prey = createOrganism(paramecium, world.nutrition, 'prey', world.player.x + 60, world.player.y, 16);
  world.organisms = [prey]; world.tick = 30;
  activateAbility(world, world.player, { x: 1, y: 0 }, 30, prey.id);
  const animations = new EngulfAnimations();
  const update = (dt = 0.01) => animations.update(snapshot(world), world.tick, 1, dt, organisms);
  return { world, prey, animations, update };
}

it('follows the authoritative capture clock, then draws the prey inward only after successful capture', () => {
  const { world, prey, update } = scene();
  world.tick = 43.5;
  const before = snapshot(world);
  const visual = update().get(world.player.id)!;
  expect(visual.progress).toBeCloseTo(0.5); expect(visual.phase).toBe('capture');
  expect(snapshot(world)).toEqual(before);
  world.tick = 57; advanceAbility(world, world.player, world.player, 30);
  expect(prey.alive).toBe(false);
  const swallowed = update(0.4).get(world.player.id)!;
  expect(swallowed.phase).toBe('swallow'); expect(swallowed.offset.x).toBeLessThan(60);
  expect(swallowed.preyScale).toBeLessThan(1); expect(swallowed.prey.alive).toBe(true);
  expect(update(0.6).size).toBe(0); expect(world.player.eaten).toBe(1);
});

it('escape retracts empty pseudopods without a swallowed ghost; death or respawn clears the animation', () => {
  const { world, prey, update } = scene();
  world.tick = 45; update();
  prey.x += 500; advanceAbility(world, world.player, world.player, 30);
  expect(update(0.1).get(world.player.id)?.phase).toBe('retract'); expect(prey.alive).toBe(true);
  expect(update(0.2).size).toBe(0);
  world.player.cooldownUntil = 0; prey.x -= 500;
  activateAbility(world, world.player, { x: 1, y: 0 }, 30, prey.id); update();
  world.player.alive = false;
  expect(update().size).toBe(0);
  world.player.alive = true; world.player.generation++; world.player.ability = null;
  expect(update().size).toBe(0);
});

it('pseudopods remain finite at different sizes, directions, distances and stages', () => {
  const { world, update } = scene();
  const base = update().get(world.player.id)!;
  for (const radius of [34, 100]) for (const angle of [-2.5, 0, 1.8]) for (const progress of [0, 0.03, 0.2, 0.6, 0.94, 1]) {
    const visual = { ...base, progress, offset: { x: Math.cos(angle) * radius * 2.4, y: Math.sin(angle) * radius * 2.4 } };
    const geometry = pseudopodGeometry(radius, 0.8, 0.1, 2.5, visual, 'slipper');
    expect(geometry.outline.length).toBeGreaterThan(20);
    for (const point of geometry.outline) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
      expect(Math.hypot(point.x, point.y)).toBeLessThan(radius * 6);
    }
  }
});
