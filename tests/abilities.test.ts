import { describe, it, expect } from 'vitest';
import { species } from '../src/data';
import { abilities } from '../src/data/abilities/pond';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import { paramecium } from '../src/data/species/paramecium';
import { didinium } from '../src/data/species/didinium';
import { createWorld, createOrganism, snapshot, placeFood, foodPositionClear, resetPracticeTargets } from '../src/sim/world';
import { step, TICK_RATE } from '../src/sim/step';
import { activateAbility, eligiblePrey, withinCaptureStart } from '../src/sim/systems/abilities';
import type { SpeciesDefinition } from '../src/data/schemas';
import type { World } from '../src/sim/types';
import { validateDefinitions } from '../src/data/validate';
import { worldContour } from '../src/sim/membrane';

function setup(s: SpeciesDefinition = amoeba) {
  const w = createWorld({ ...pond, practiceTargets: [] }, s);
  w.foodParticles = [];
  return w;
}
function prey(w: World, s = paramecium as SpeciesDefinition, mass = 16, dx = 65) {
  const p = createOrganism(s, w.nutrition, `target-${w.organisms.length}`, w.player.x + dx, w.player.y, mass);
  w.organisms.push(p);
  return p;
}
function advance(w: World, ticks: number) { for (let i = 0; i < ticks; i++) step(w, { direction: { x: 0, y: 0 } }); }
const fire = (w: World) => step(w, { direction: { x: 0, y: 0 }, activate: true });

describe('M2 abilities and feeding', () => {
  it.each([amoeba, paramecium, didinium])('Amoeba requires $name prey strictly below 70% mass for player and AI attacks', targetSpecies => {
    for (const ai of [false, true]) for (const mass of [69.99, 70, 70.01]) {
      const w = setup();
      const hunter = ai ? prey(w, amoeba, 100, -60) : w.player;
      hunter.mass = 100;
      if (ai) hunter.kind = 'ai';
      const target = prey(w, targetSpecies, mass, 0);
      target.x = hunter.x + 60;
      expect(eligiblePrey(w, hunter, target)).toBe(mass < 70);
      activateAbility(w, hunter, { x: 1, y: 0 }, 30, target.id);
      if (mass < 70) expect(hunter.ability?.targetId).toBe(target.id);
      else {
        expect(hunter.ability).toBeNull();
        expect(hunter.reserves.energy).toBe(35);
        expect(hunter.cooldownUntil).toBe(0);
      }
    }
  });
  it('preserves the inclusive Didinium specialist mass limit', () => {
    const w = setup(didinium), target = prey(w, paramecium, 37.5, 60);
    expect(eligiblePrey(w, w.player, target)).toBe(true);
    target.mass += 0.001;
    expect(eligiblePrey(w, w.player, target)).toBe(false);
  });
  it('Amoebae can engulf smaller Amoebae but never their own controlled cells', () => {
    const w = setup(), target = prey(w, amoeba, 16, 55);
    const own = prey(w, amoeba, 12, -55); own.kind = 'player'; own.parentId = w.player.id;
    expect(eligiblePrey(w, w.player, target)).toBe(true);
    expect(eligiblePrey(w, w.player, own)).toBe(false);
    expect(eligiblePrey(w, own, w.player)).toBe(false);
    activateAbility(w, w.player, { x: 1, y: 0 }, 30, target.id);
    expect(w.player.ability?.targetId).toBe(target.id);
    advance(w, 28);
    expect(target.alive).toBe(false); expect(own.alive).toBe(true);
    expect(w.player.lastFoodId).toBe(`prey:${amoeba.id}`);
    const sameSize = prey(w, amoeba, w.player.mass, 65);
    expect(eligiblePrey(w, w.player, sameSize)).toBe(false);
  });
  it('engulfing begins only at a small membrane gap, with no cost for distant attempts', () => {
    const w = setup(), target = prey(w, paramecium, 16, 110);
    const ability = abilities['pseudopod-engulf'];
    expect(withinCaptureStart(w, w.player, target, ability)).toBe(false);
    activateAbility(w, w.player, { x: 1, y: 0 }, 30, target.id);
    expect(w.player.ability).toBeNull(); expect(w.player.reserves.energy).toBe(35);
    expect(w.player.cooldownUntil).toBe(0); expect(w.player.abilityMessage).toBe('Move closer to begin engulfing');
    target.x = w.player.x + 65;
    expect(withinCaptureStart(w, w.player, target, ability)).toBe(true);
    activateAbility(w, w.player, { x: 1, y: 0 }, 30, target.id);
    expect(w.player.ability?.targetId).toBe(target.id);
    // The start gate does not shorten the existing escape distance mid-capture.
    target.x = w.player.x + 100; advance(w, 1);
    expect(w.player.ability?.targetId).toBe(target.id);
  });
  it('captures a single smaller prey, transfers inventory once, then digests before growth', () => {
    const w = setup(), a = prey(w), b = prey(w, didinium, 14, 90);
    a.nutrients.peptides = 4;
    fire(w);
    expect(w.player.ability?.targetId).toBe(a.id);
    expect(w.player.reserves.energy).toBeLessThan(35 - 8);
    expect(a.alive).toBe(true);
    advance(w, 27);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    expect(w.player.mass).toBe(25);
    expect(w.player.eaten).toBe(1);
    expect(w.player.nutrients.peptides).toBeCloseTo((16 * 0.7 + 4) * 0.65);
    expect(a.nutrients.peptides).toBe(0);
    const amount = w.player.nutrients.peptides;
    advance(w, 30);
    expect(w.player.nutrients.peptides).toBe(amount);
    expect(w.player.mass).toBe(25);
    advance(w, 90);
    expect(w.player.mass).toBeGreaterThan(25);
    expect(w.player.eaten).toBe(1);
  });
  it('rejects equal, larger, out of cone and out of reach prey without charging', () => {
    for (const [mass, dx] of [[25, 60], [30, 60], [16, -80], [16, 300]]) {
      const w = setup(); prey(w, paramecium, mass, dx);
      activateAbility(w, w.player, { x: 1, y: 0 }, TICK_RATE);
      expect(w.player.ability).toBeNull();
      expect(w.player.reserves.energy).toBe(35);
      expect(w.player.cooldownUntil).toBe(0);
    }
  });
  it('does not capture prey merely by overlapping an amoeba', () => {
    const w = setup(), target = prey(w, paramecium, 10, 0);
    advance(w, 100);
    expect(target.alive).toBe(true);
  });
  it('retains the cost and cooldown after escape; cooldown blocks repeat payment', () => {
    const w = setup(), target = prey(w);
    fire(w);
    const deadline = w.player.cooldownUntil, paid = w.player.reserves.energy;
    target.x += 500;
    advance(w, 1);
    expect(w.player.abilityMessage).toBe('Prey escaped');
    fire(w);
    expect(w.player.cooldownUntil).toBe(deadline);
    expect(w.player.reserves.energy).toBeGreaterThan(paid - 1);
    advance(w, deadline - w.tick);
    target.x = w.player.x + 65;
    fire(w);
    expect(w.player.ability?.targetId).toBe(target.id);
  });
  it('checks all material costs atomically, and nitrogen food restores defensive availability', () => {
    const w = setup(paramecium);
    w.player.reserves.nitrogen = 0;
    activateAbility(w, w.player, { x: 1, y: 0 }, TICK_RATE);
    expect(w.player.reserves.energy).toBe(35);
    expect(w.player.cooldownUntil).toBe(0);
    expect(w.player.abilityMessage).toBe('Need nitrogen');
    w.player.nutrients.peptides = 2;
    advance(w, 1);
    fire(w);
    expect(w.player.ability?.effect).toBe('discharge');
    expect(w.player.reserves.nitrogen).toBeGreaterThanOrEqual(0);
  });
  it('pushes susceptible attackers without recoil or turning, and interrupts their capture', () => {
    const w = setup(paramecium), hunter = prey(w, amoeba, 40, 80);
    activateAbility(w, hunter, { x: -1, y: 0 }, TICK_RATE);
    expect(hunter.ability?.targetId).toBe(w.player.id);
    const start = w.player.x, before = hunter.x;
    fire(w);
    expect(w.player.x).toBe(start);
    expect(hunter.x - before).toBeCloseTo(105);
    expect(hunter.ability).toBeNull();
    expect(hunter.cooldownUntil).toBeGreaterThan(0);
    expect(Math.cos(w.player.heading)).toBeCloseTo(1);
  });
  it('discharges radially without sideways drift and retains normal steering throughout', () => {
    const w = setup(paramecium);
    const above = prey(w, amoeba, 40, 0); above.y += 100;
    const left = prey(w, amoeba, 40, -100);
    const ally = prey(w, paramecium, 25, 100); ally.colonyId = w.player.colonyId;
    const far = prey(w, amoeba, 40, 1000);
    activateAbility(w, w.player, { x: 1, y: 0 }, TICK_RATE);
    expect(above.pendingMotion.x).toBe(0);
    expect(above.pendingMotion.y).toBeCloseTo(105);
    expect(left.pendingMotion.x).toBeCloseTo(-105);
    expect(ally.pendingMotion).toEqual({ x: 0, y: 0 });
    expect(far.pendingMotion).toEqual({ x: 0, y: 0 });
    const before = w.player.x;
    for (let i = 0; i < 6; i++) step(w, { direction: { x: 1, y: 0 } });
    expect(w.player.x).toBeGreaterThan(before + 20);
    expect(w.player.ability?.effect).toBe('discharge');
  });
  it('Didinium resists discharge and specializes against larger Paramecium', () => {
    const w = setup(paramecium), hunter = prey(w, didinium, 25, 70);
    const before = hunter.x;
    fire(w);
    expect(hunter.x - before).toBeCloseTo(10.5);
    const d = setup(didinium), p = prey(d, paramecium, 32, 85), a = prey(d, amoeba, 10, 60);
    expect(eligiblePrey(d, d.player, p)).toBe(true);
    expect(eligiblePrey(d, d.player, a)).toBe(false);
    fire(d);
    advance(d, 3);
    expect(p.stunnedUntil).toBeGreaterThan(d.tick);
    expect(d.player.ability?.effect).toBe('capture');
    advance(d, 30);
    expect(p.alive).toBe(false);
    expect(a.alive).toBe(true);
    expect(d.player.mass).toBe(25);
    advance(d, 100);
    expect(d.player.mass).toBeGreaterThan(25);
  });
  it('missed strikes cost energy; starvation shrinks to a floor, with contact feeding for recovery', () => {
    const w = setup(didinium);
    fire(w);
    advance(w, 15);
    expect(w.player.ability).toBeNull();
    expect(w.player.abilityMessage).toBe('Strike missed');
    expect(w.player.reserves.energy).toBeLessThan(31);
    advance(w, 3000);
    expect(w.player.mass).toBe(12.5);
    const target = prey(w, paramecium, 14, 20);
    advance(w, 76);
    expect(target.alive).toBe(false);
    advance(w, 76);
    expect(w.player.reserves.energy).toBeGreaterThan(0);
  });
  it('stun blocks activation and movement without spending resources', () => {
    const w = setup(); prey(w, paramecium, 16, 100);
    w.player.stunnedUntil = 60;
    step(w, { direction: { x: 1, y: 0 }, activate: true });
    expect(w.player.x).toBe(pond.spawn.x);
    expect(w.player.cooldownUntil).toBe(0);
    expect(w.player.abilityMessage).toBe('Stunned');
  });
  it('Paramecium turns tighter than Amoeba and cannot engulf other cells', () => {
    const a = setup(), p = setup(paramecium);
    for (const w of [a, p]) { step(w, { direction: { x: 1, y: 0 } }); step(w, { direction: { x: 0, y: 1 } }); }
    expect(p.player.heading).toBeGreaterThan(a.player.heading);
    expect(eligiblePrey(p, p.player, prey(p, didinium, 1, 0))).toBe(false);
  });
  it('copies target inventories and active state deeply into snapshots', () => {
    const w = setup(); prey(w); fire(w);
    const snap = snapshot(w);
    snap.organisms[0].nutrients.peptides = 200;
    snap.player.ability!.direction.x = 900;
    expect(w.organisms[0].nutrients.peptides).toBe(0);
    expect(w.player.ability!.direction.x).toBe(1);
  });
  it('particle contact uses Paramecium shape; Didinium cannot graze particles', () => {
    const w = setup(paramecium);
    const tip = worldContour({ ...w.player, time: 0, shape: 'slipper' })[0];
    w.foodParticles = [{ id: 0, foodId: 'detritus', x: tip.x, y: tip.y, availableAtTick: 0 }];
    advance(w, 1);
    expect(w.player.eaten).toBe(1);
    const d = setup(didinium);
    d.foodParticles = [{ id: 0, foodId: 'detritus', x: d.player.x, y: d.player.y, availableAtTick: 0 }];
    advance(d, 1);
    expect(d.player.eaten).toBe(0);
  });
});

describe('spawn clearance and data validation', () => {
  it('initial and renewed food avoids every living organism over multiple seeds and sizes', () => {
    for (const seed of [0, 1, 42, 2026]) {
      const w = createWorld(pond, amoeba, seed);
      for (const food of w.foodParticles) expect(foodPositionClear(w, food, w.nutrition.foods[food.foodId].radius)).toBe(true);
      w.organisms.forEach(p => { p.radius *= 3; });
      for (const food of w.foodParticles.slice(0, 50)) {
        placeFood(w, food);
        expect(foodPositionClear(w, food, w.nutrition.foods[food.foodId].radius)).toBe(true);
      }
      resetPracticeTargets(w);
      for (const food of w.foodParticles) expect(foodPositionClear(w, food, w.nutrition.foods[food.foodId].radius)).toBe(true);
    }
  });
  it('checks clearance again on renewal if an organism moved onto a hidden particle', () => {
    const w = setup();
    const target = prey(w);
    w.foodParticles = [{ id: 0, foodId: 'detritus', x: target.x, y: target.y, availableAtTick: 1 }];
    advance(w, 1);
    expect(foodPositionClear(w, w.foodParticles[0], 5)).toBe(true);
    expect(w.player.eaten).toBe(0);
  });
  it('rejects broken ability, body, fact and practice references', () => {
    expect(() => validateDefinitions(pond, species)).not.toThrow();
    for (const edit of [{ activeId: 'missing' }, { factId: 'missing' }, { bodyComposition: { imaginary: 1 } }, { turnRate: NaN }]) {
      expect(() => createWorld(pond, { ...amoeba, ...edit })).toThrow();
    }
    expect(() => validateDefinitions({ ...pond, practiceTargets: [{ speciesId: 'missing', mass: 1, dx: 0, dy: 0 }] }, species)).toThrow('Invalid practice organism');
    expect(Object.keys(abilities)).toHaveLength(5);
  });
});
