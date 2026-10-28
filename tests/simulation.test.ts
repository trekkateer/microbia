import { describe, expect, it } from 'vitest';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import { nutrition } from '../src/data/nutrition';
import type { MetabolismDefinition } from '../src/data/schemas';
import { validateDefinitions } from '../src/data/validate';
import { createWorld, snapshot } from '../src/sim/world';
import { FIXED_DT, step, TICK_RATE } from '../src/sim/step';
import { idleCommand } from '../src/sim/commands';
import { FixedStepClock } from '../src/sim/fixed-step';
import type { World } from '../src/sim/types';
import { worldContour } from '../src/sim/membrane';
import { species } from '../src/data';

const baseProfile = nutrition.metabolism[amoeba.metabolismId];
function isolated(overrides: Partial<MetabolismDefinition> = {}): World {
  const content = { ...nutrition, metabolism: { [amoeba.metabolismId]: { ...baseProfile, maintenancePerSecond: {}, ...overrides } } };
  const world = createWorld({ ...pond, roster: [amoeba.id], practiceTargets: [] }, amoeba, 2026, content);
  world.foodParticles = [];
  return world;
}
function advance(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(world, idleCommand());
}
function foodAtPlayer(world: World, foodId = 'detritus', id = 0) {
  return { id, foodId, x: world.player.x, y: world.player.y, availableAtTick: 0 };
}
function fillReserves(world: World): void {
  for (const [id, reserve] of Object.entries(baseProfile.reserves)) world.player.reserves[id] = reserve.capacity;
}

describe('deterministic simulation and movement', () => {
  it('spawns a nearby variety outside the player and does not grow without food', () => {
    for (const seed of [0, 1, 41, 2026, 123456]) {
      const world = createWorld(pond, amoeba, seed);
      expect(world.foodParticles).toHaveLength(pond.foodSpawns.reduce((n, spawn) => n + spawn.count, 0));
      for (const spawn of pond.foodSpawns) {
        const particles = world.foodParticles.filter(p => p.foodId === spawn.foodId);
        expect(particles).toHaveLength(spawn.count);
        expect(particles.filter(p => Math.hypot(p.x - world.player.x, p.y - world.player.y) <= pond.foodPlacement.starterRadius).length).toBeGreaterThanOrEqual(spawn.starterCount);
      }
      for (const food of world.foodParticles) {
        expect(Math.hypot(food.x - world.player.x, food.y - world.player.y)).toBeGreaterThan(world.player.radius + nutrition.foods[food.foodId].radius);
      }
      advance(world, 30);
      expect(world.player.eaten).toBe(0);
      expect(world.player.mass).toBe(25);
    }
  });

  it('replays the same seed and command stream exactly including digestion', () => {
    const a = createWorld(pond, amoeba, 48);
    const b = createWorld(pond, amoeba, 48);
    for (let tick = 0; tick < 1800; tick++) {
      const command = { direction: { x: Math.cos(tick / 40), y: Math.sin(tick / 70) } };
      step(a, command);
      step(b, command);
    }
    expect(a).toEqual(b);
    expect(a.player.eaten).toBeGreaterThan(0);
    expect(a.player.mass).toBeGreaterThan(25);
    expect(createWorld(pond, amoeba, 49).foodParticles).not.toEqual(createWorld(pond, amoeba, 48).foodParticles);
    for (const [id, amount] of Object.entries(a.player.reserves)) {
      expect(amount).toBeGreaterThanOrEqual(0);
      expect(amount).toBeLessThanOrEqual(baseProfile.reserves[id].capacity);
    }
  });

  it('normalizes diagonal movement and keeps steering usable at zero energy', () => {
    const horizontal = isolated();
    const diagonal = isolated();
    horizontal.player.reserves.energy = 0;
    diagonal.player.reserves.energy = 0;
    for (let i = 0; i < TICK_RATE; i++) {
      step(horizontal, { direction: { x: 1, y: 0 } });
      step(diagonal, { direction: { x: 1, y: 1 } });
    }
    const distance = (p: { x: number; y: number }) => Math.hypot(p.x - pond.spawn.x, p.y - pond.spawn.y);
    expect(distance(horizontal.player)).toBeCloseTo(amoeba.growth.startingSpeed, 6);
    expect(distance(diagonal.player)).toBeCloseTo(distance(horizontal.player), 6);
    expect(horizontal.player.reserves.energy).toBe(0);
  });

  it('ignores invalid directions and caps oversized commands', () => {
    const world = isolated();
    step(world, { direction: { x: NaN, y: Infinity } });
    expect(world.player.x).toBe(pond.spawn.x);
    step(world, { direction: { x: 1000, y: 0 } });
    expect(world.player.x - pond.spawn.x).toBeCloseTo(amoeba.growth.startingSpeed * FIXED_DT);
  });

  it('caps growth and keeps a growing body inside the map', () => {
    const world = isolated();
    fillReserves(world);
    world.player.x = world.player.radius;
    world.player.mass = amoeba.growth.maximumMass - 0.01;
    step(world, { direction: { x: -1, y: 0 } });
    expect(world.player.mass).toBe(225);
    expect(world.player.radius).toBe(102);
    expect(world.player.speed).toBe(amoeba.growth.minimumSpeed);
    expect(world.player.x).toBeGreaterThanOrEqual(world.player.radius);
    expect(world.player.speciesId).toBe(amoeba.id);
    for (let i = 0; i < 1800; i++) step(world, { direction: { x: 1, y: 1 } });
    for (const point of worldContour({ ...world.player, time: world.tick * FIXED_DT })) {
      expect(point.x).toBeLessThanOrEqual(pond.map.width);
      expect(point.y).toBeLessThanOrEqual(pond.map.height);
    }
  });

  it('copies nested reserve and digestion state for rendering', () => {
    const world = isolated();
    world.foodParticles = [foodAtPlayer(world)];
    step(world, idleCommand());
    const view = snapshot(world);
    view.player.x = 0;
    view.player.velocity.x = 999;
    view.player.reserves.energy = 999;
    view.player.digestion[0].composition.carbohydrate = 999;
    view.player.nutrients.carbohydrate = 999;
    view.foodParticles[0].x = -5;
    expect(world.player.x).toBe(pond.spawn.x);
    expect(world.player.velocity.x).toBe(0);
    expect(world.player.reserves.energy).toBeLessThan(80);
    expect(world.player.digestion[0].composition.carbohydrate).toBeLessThan(30);
    expect(world.player.nutrients.carbohydrate).toBeLessThan(30);
    expect(world.foodParticles[0].x).toBeGreaterThan(0);
  });

  it('produces the same result at 30, 60 and 144 rendering frames per second', () => {
    const run = (fps: number) => {
      const world = createWorld(pond, amoeba);
      const clock = new FixedStepClock();
      for (let frame = 0; frame < fps * 10; frame++) clock.advance(1 / fps, () => step(world, { direction: { x: 1, y: 0 } }));
      return snapshot(world);
    };
    expect(run(30)).toEqual(run(60));
    expect(run(60)).toEqual(run(144));
    expect(run(144).tick).toBe(300);
  });

  it('limits catch-up after a long frame and resets its remainder', () => {
    const clock = new FixedStepClock();
    let ticks = 0;
    clock.advance(60, () => ticks++);
    expect(ticks).toBe(7);
    clock.reset();
    expect(clock.advance(0, () => ticks++)).toBe(0);
    expect(clock.advance(NaN, () => ticks++)).toBe(0);
  });
});

describe('food, digestion and metabolism', () => {
  it('stores nutrients immediately, but waits for digestion before metabolism', () => {
    const world = isolated({ upkeepPerSecond: 0, movementCostPerSecond: 0 });
    world.foodParticles = [foodAtPlayer(world)];
    step(world, idleCommand());
    expect(world.player.mass).toBe(25);
    expect(world.player.reserves.carbon).toBe(0);
    expect(world.player.eaten).toBe(1);
    expect(world.player.nutrients.carbohydrate).toBe(nutrition.foods.detritus.composition.carbohydrate);
    const completion = world.player.digestion[0].completesAtTick;
    advance(world, completion - world.tick - 1);
    expect(world.player.mass).toBe(25);
    step(world, idleCommand());
    expect(world.player.mass).toBeGreaterThan(25);
    expect(world.player.digestion).toHaveLength(0);
    world.foodParticles = [];
    world.player.mass = 225;
    const after = { ...world.player.reserves };
    advance(world, 300);
    expect(world.player.reserves).toEqual(after);
    expect(world.player.eaten).toBe(1);
  });

  it('different meals create different reserves and different growth outcomes', () => {
    const eat = (foodId: string, suppressGrowth: boolean) => {
      const world = isolated({ upkeepPerSecond: 0, movementCostPerSecond: 0 });
      if (suppressGrowth) world.player.mass = 225;
      world.foodParticles = [foodAtPlayer(world, foodId)];
      step(world, idleCommand());
      world.foodParticles = [];
      advance(world, 300);
      return world.player;
    };
    const carbon = eat('carbon-flake', true);
    const protein = eat('protein-fragment', true);
    const lipid = eat('lipid-droplet', true);
    const mixed = eat('detritus', true);
    expect(carbon.reserves.energy).toBeGreaterThan(protein.reserves.energy);
    expect(protein.reserves.nitrogen).toBeGreaterThan(carbon.reserves.nitrogen);
    expect(lipid.reserves.lipids).toBeGreaterThan(carbon.reserves.lipids);
    expect(mixed.reserves.phosphorus).toBeGreaterThan(carbon.reserves.phosphorus);
    expect(eat('detritus', false).mass).toBeGreaterThan(eat('carbon-flake', false).mass);
  });

  it('missing nitrogen blocks growth despite excess energy and carbon', () => {
    const world = isolated({ upkeepPerSecond: 0 });
    fillReserves(world);
    world.player.reserves.nitrogen = 0;
    advance(world, 90);
    expect(world.player.mass).toBe(25);
    world.player.reserves.nitrogen = 0.6;
    advance(world, 90);
    expect(world.player.mass).toBeCloseTo(26);
    expect(world.player.reserves.nitrogen).toBeCloseTo(0);
  });

  it('consumes the correct resources as it grows, with no instant mass bonus', () => {
    const world = isolated({ upkeepPerSecond: 0 });
    fillReserves(world);
    const before = { ...world.player.reserves };
    advance(world, 30);
    expect(world.player.mass).toBeCloseTo(26);
    for (const [id, cost] of Object.entries(baseProfile.growthCost)) {
      expect(world.player.reserves[id]).toBeCloseTo(before[id] - cost);
    }
  });

  it('honors food-specific renewal and retains the food identity', () => {
    const world = isolated();
    world.foodParticles = [foodAtPlayer(world, 'protein-fragment')];
    step(world, idleCommand());
    const particle = world.foodParticles[0];
    expect(particle.availableAtTick).toBe(1 + 11 * TICK_RATE);
    expect(particle.foodId).toBe('protein-fragment');
    particle.x = world.player.x;
    particle.y = world.player.y;
    advance(world, particle.availableAtTick - world.tick - 1);
    expect(world.player.eaten).toBe(1);
    step(world, idleCommand());
    // Renewal must move an occupied spawn away instead of creating food inside us.
    expect(world.player.eaten).toBe(1);
    expect(Math.hypot(particle.x - world.player.x, particle.y - world.player.y)).toBeGreaterThan(world.player.radius);
    particle.x = world.player.x;
    particle.y = world.player.y;
    step(world, idleCommand());
    expect(world.player.eaten).toBe(2);
  });

  it('rejects distant food and incompatible diets without deleting the food', () => {
    const world = isolated();
    world.species = { ...amoeba, diet: ['carbon-flake'] };
    world.foodParticles = [foodAtPlayer(world, 'protein-fragment'), { ...foodAtPlayer(world, 'carbon-flake', 1), x: world.player.x + 100 }];
    step(world, idleCommand());
    expect(world.player.eaten).toBe(0);
    expect(world.player.digestion).toHaveLength(0);
    expect(world.foodParticles.every(food => food.availableAtTick === 0)).toBe(true);
  });

  it('absorbs touched food with full reserves and retains unused nutrient stock', () => {
    const world = isolated({ upkeepPerSecond: 0 });
    fillReserves(world);
    world.player.mass = 225;
    world.foodParticles = [foodAtPlayer(world, 'carbon-flake'), foodAtPlayer(world, 'carbon-flake', 1)];
    step(world, idleCommand());
    expect(world.player.eaten).toBe(2);
    expect(world.player.nutrients.carbohydrate).toBe(16);
    expect(world.foodParticles[1].availableAtTick).toBeGreaterThan(0);
    advance(world, 60);
    expect(world.player.reserves.energy).toBe(80);
    expect(world.player.eaten).toBe(2);
    expect(world.player.nutrients.carbohydrate).toBe(16);
    for (const [id, value] of Object.entries(world.player.reserves)) expect(value).toBe(baseProfile.reserves[id].capacity);
    world.player.reserves.energy -= 12;
    step(world, idleCommand());
    expect(world.player.nutrients.carbohydrate).toBeLessThan(16);
    expect(world.player.reserves.energy).toBeCloseTo(80);
  });

  it('absorbs a dense batch without digestion-slot limits or duplicate inventory', () => {
    const world = isolated({ upkeepPerSecond: 0 });
    fillReserves(world);
    world.player.mass = 225;
    world.foodParticles = Array.from({ length: 48 }, (_, id) => foodAtPlayer(world, 'detritus', id));
    step(world, idleCommand());
    expect(world.player.digestion).toHaveLength(48);
    expect(world.player.eaten).toBe(48);
    expect(world.player.nutrients.carbohydrate).toBe(48 * 3);
    advance(world, 90);
    expect(world.player.digestion).toHaveLength(0);
    expect(world.player.eaten).toBe(48);
    expect(world.player.nutrients.carbohydrate).toBe(48 * 3);
    expect(world.player.mass).toBe(225);
  });

  it('keeps inventories separate for different organisms', () => {
    const world = isolated({ upkeepPerSecond: 0 });
    const other = isolated({ upkeepPerSecond: 0 });
    world.foodParticles = [foodAtPlayer(world)];
    step(world, idleCommand());
    expect(world.player.nutrients.carbohydrate).toBe(3);
    expect(other.player.nutrients.carbohydrate).toBe(0);
  });

  it('long starvation never creates negative reserves and respects the sandbox mass floor', () => {
    const world = isolated();
    advance(world, 9000);
    expect(world.player.reserves.energy).toBe(0);
    expect(world.player.mass).toBe(amoeba.starvation.minimumMass);
    expect(Object.values(world.player.reserves).every(v => Number.isFinite(v) && v >= 0)).toBe(true);
  });
});

describe('visible membrane contact', () => {
  it('absorbs at protruding membrane edges at different sizes and headings', () => {
    for (const mass of [25, 225]) for (const heading of [0, 1, 2, 3]) {
      const world = isolated({ upkeepPerSecond: 0 });
      world.tick = 137;
      world.player.mass = mass;
      world.player.heading = heading;
      world.player.stretch = 0.1;
      step(world, idleCommand());
      const p = world.player;
      const contour = worldContour({ ...p, time: world.tick * FIXED_DT });
      const tip = contour.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) > Math.hypot(b.x - p.x, b.y - p.y) ? a : b);
      const length = Math.hypot(tip.x - p.x, tip.y - p.y);
      const foodRadius = nutrition.foods['carbon-flake'].radius;
      const particle = { ...foodAtPlayer(world, 'carbon-flake'), x: tip.x + (tip.x - p.x) / length * (foodRadius - 0.3), y: tip.y + (tip.y - p.y) / length * (foodRadius - 0.3) };
      expect(Math.hypot(particle.x - p.x, particle.y - p.y)).toBeGreaterThan(p.radius + foodRadius);
      world.foodParticles = [particle];
      step(world, idleCommand());
      expect(world.player.eaten).toBe(1);
      expect(particle.availableAtTick).toBeGreaterThan(world.tick);
    }
  });

  it('does not skip food crossed between simulation ticks', () => {
    const world = isolated();
    world.player.speed = 6000;
    world.foodParticles = [{ ...foodAtPlayer(world, 'carbon-flake'), x: world.player.x + 100 }];
    step(world, { direction: { x: 1, y: 0 } });
    expect(world.player.x).toBeCloseTo(pond.spawn.x + 200);
    expect(world.player.eaten).toBe(1);
  });

  it('leaves nearby but untouched food in the pond', () => {
    const world = isolated();
    world.foodParticles = [{ ...foodAtPlayer(world, 'carbon-flake'), x: world.player.x + world.player.radius * 1.4 + 12 }];
    advance(world, 30);
    expect(world.player.eaten).toBe(0);
  });
});

describe('definition validation', () => {
  it('accepts launch data and rejects unknown species and foods', () => {
    expect(() => validateDefinitions(pond, species)).not.toThrow();
    expect(() => validateDefinitions({ ...pond, roster: ['missing'] }, { [amoeba.id]: amoeba })).toThrow('Unknown species');
    expect(() => createWorld({ ...pond, foodSpawns: [{ ...pond.foodSpawns[0], foodId: 'missing' }] }, amoeba)).toThrow('Invalid food spawn');
  });

  it('rejects invalid growth, spawn positions and resource settings', () => {
    expect(() => createWorld(pond, { ...amoeba, growth: { ...amoeba.growth, startingMass: 0 } })).toThrow('Invalid growth');
    expect(() => createWorld({ ...pond, foodSpawns: [{ ...pond.foodSpawns[0], respawnSeconds: -1 }] }, amoeba)).toThrow('Invalid food spawn');
    expect(() => createWorld({ ...pond, spawn: { x: -1, y: 100 } }, amoeba)).toThrow('Invalid spawn');
    expect(() => createWorld({ ...pond, roster: [] }, amoeba)).toThrow('Species is not in this arena');
    expect(() => isolated({ efficiency: 2 })).toThrow('Invalid metabolism');
    expect(() => isolated({ growthCost: { nitrogen: NaN } })).toThrow('Invalid growth requirement');
    expect(() => isolated({ assimilation: { imaginary: { carbon: 1 } } })).toThrow('Unknown assimilation resource');
    expect(() => isolated({ reserves: { ...baseProfile.reserves, energy: { name: 'energy', capacity: 1, initial: 2 } } })).toThrow('Invalid reserve');
  });

  it('rejects malformed food composition and unsupported diet entries', () => {
    const bad = { ...nutrition, foods: { ...nutrition.foods, detritus: { ...nutrition.foods.detritus, composition: { imaginary: 1 } } } };
    expect(() => createWorld(pond, amoeba, 0, bad)).toThrow('Invalid composition');
    expect(() => createWorld(pond, { ...amoeba, diet: ['imaginary'] })).toThrow('Unsupported diet');
  });
});

