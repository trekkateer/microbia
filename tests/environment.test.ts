import { describe, expect, it } from 'vitest';
import { pond } from '../src/data/arenas/pond';
import { euglena } from '../src/data/species/euglena';
import { diatom } from '../src/data/species/diatom';
import { amoeba } from '../src/data/species/amoeba';
import { organisms } from '../src/data';
import type { ArenaDefinition, SpeciesDefinition } from '../src/data/schemas';
import type { World } from '../src/sim/types';
import { createOrganism, createWorld, snapshot } from '../src/sim/world';
import { step } from '../src/sim/step';
import { environmentAt, renewDissolved, uptakeAndProduce } from '../src/sim/systems/environment';
import { activateAbility, eligiblePrey } from '../src/sim/systems/abilities';
import { bodyHull, penetration } from '../src/sim/systems/collisions';
import { aiCommand } from '../src/sim/systems/ai';
import { killOrganism, respawnOrganism } from '../src/sim/systems/lifecycle';
import { validateDefinitions } from '../src/data/validate';

function world(species: SpeciesDefinition = euglena, changes: Partial<ArenaDefinition> = {}) {
  const w = createWorld({ ...pond, aiSpawns: [], ...changes }, species);
  w.player.protectedUntil = 0; w.foodParticles = [];
  return w;
}
function advance(w: World, ticks = 300) { for (let i = 0; i < ticks; i++) step(w, { direction: { x: 0, y: 0 } }); }

describe('light, dissolved nutrients and producer kits', () => {
  it.each([euglena, diatom])('$name grows in a sunlit patch without particle feeding', species => {
    const w = world(species);
    advance(w);
    expect(w.player.mass).toBeGreaterThan(species.growth.startingMass + 1);
    expect(w.player.eaten).toBe(0);
    expect(w.player.reserves.energy).toBeGreaterThan(0);
    expect(Object.values(w.player.reserves).every(n => n >= 0 && Number.isFinite(n))).toBe(true);
  });
  it.each(['carbon-dioxide', 'ammonium', 'phosphate'])('Euglena cannot grow without %s', id => {
    const w = world();
    w.dissolvedPatches.forEach(p => { p.resources[id] = 0; });
    w.arena = { ...w.arena, dissolvedPatches: w.arena.dissolvedPatches!.map(p => ({ ...p, resources: Object.fromEntries(Object.entries(p.resources).map(([key, value]) => [key, { ...value, renewal: key === id ? 0 : value.renewal }])) })) };
    advance(w);
    expect(w.player.mass).toBe(euglena.growth.startingMass);
  });
  it('Diatom needs silicate for new biomass, but keeps its existing shell', () => {
    const w = world(diatom);
    w.arena = { ...w.arena, dissolvedPatches: w.arena.dissolvedPatches!.map(p => ({ ...p, resources: { ...p.resources, silicate: { capacity: 50, renewal: 0 } } })) };
    w.dissolvedPatches.forEach(p => { p.resources.silicate = 0; });
    advance(w);
    expect(w.player.mass).toBe(diatom.growth.startingMass);
    expect(w.player.reserves.carbon).toBeGreaterThan(0);
    w.dissolvedPatches[0].resources.silicate = 10;
    advance(w, 90);
    expect(w.player.mass).toBeGreaterThan(diatom.growth.startingMass);
  });
  it('darkness stops production and drains Euglena down to its mass floor', () => {
    const w = world(euglena, { zones: [], ambientLight: 0 });
    w.player.nutrients['carbon-dioxide'] = 10;
    advance(w, 1200);
    expect(w.player.mass).toBe(euglena.starvation.minimumMass);
    expect(w.player.nutrients.carbohydrate).toBe(0);
    expect(w.player.growthRate).toBe(0);
  });
  it('Diatom pauses production in darkness without the Euglena-specific shrink penalty', () => {
    const w = world(diatom, { zones: [], ambientLight: 0 });
    advance(w);
    expect(w.player.mass).toBe(diatom.growth.startingMass);
    expect(w.player.growthRate).toBe(0);
  });
  it('limits uptake by time, compatibility, storage and shared patch supply', () => {
    const w = world();
    const patch = w.dissolvedPatches[0]; patch.resources.ammonium = 0.01;
    uptakeAndProduce(w, w.player, 1 / 30);
    expect(w.player.nutrients.ammonium).toBeCloseTo(0.01);
    expect(patch.resources.ammonium).toBe(0);
    expect(w.player.nutrients.nitrate).toBe(0);
    expect(w.player.nutrients.silicate).toBe(0);
    const second = createOrganism(euglena, w.nutrition, 'competitor', w.player.x, w.player.y);
    uptakeAndProduce(w, second, 1 / 30);
    expect(second.nutrients.ammonium).toBe(0);
    w.player.nutrients.ammonium = 8;
    patch.resources.ammonium = 20;
    uptakeAndProduce(w, w.player, 1);
    expect(patch.resources.ammonium).toBe(20);
    renewDissolved(w, 1000);
    expect(patch.resources.ammonium).toBe(50);
  });
  it('heterotrophs cannot absorb dissolved patches or photosynthesize', () => {
    const w = world(amoeba); advance(w);
    expect(w.player.mass).toBe(amoeba.growth.startingMass);
    expect(Object.values(w.player.nutrients).every(n => n === 0)).toBe(true);
  });
  it('production and growth remain bounded at full storage and maximum size', () => {
    const w = world(); w.player.mass = euglena.growth.maximumMass;
    advance(w, 600);
    expect(w.player.mass).toBe(euglena.growth.maximumMass);
    const profile = w.nutrition.metabolism[euglena.metabolismId];
    for (const [id, reserve] of Object.entries(profile.reserves)) expect(w.player.reserves[id]).toBeLessThanOrEqual(reserve.capacity);
    expect(w.player.nutrients.carbohydrate).toBeLessThanOrEqual(euglena.photosynthesis.capacity);
    expect(w.player.nutrients['carbon-dioxide']).toBeLessThanOrEqual(18);
  });
  it('phototaxis turns toward favorable light, costs once, and expires', () => {
    const w = world(); Object.assign(w.player, { x: pond.spawn.x - 600, y: pond.spawn.y, heading: Math.PI });
    activateAbility(w, w.player, { x: -1, y: 0 }, 30);
    expect(w.player.ability?.direction.x).toBe(1);
    expect(w.player.reserves.energy).toBe(32);
    activateAbility(w, w.player, { x: 0, y: 1 }, 30);
    expect(w.player.reserves.energy).toBe(32);
    advance(w, 30); expect(Math.abs(w.player.heading)).toBeLessThan(0.1);
    advance(w, 31); expect(w.player.ability).toBeNull();
    expect(w.player.cooldownUntil).toBeGreaterThan(w.tick);
  });
  it('failed light sensing does not charge energy or a cooldown', () => {
    const w = world(euglena, { zones: [] });
    activateAbility(w, w.player, { x: 1, y: 0 }, 30);
    expect(w.player.ability).toBeNull(); expect(w.player.cooldownUntil).toBe(0);
    expect(w.player.reserves.energy).toBe(35);
  });
  it('silica defense changes prey eligibility and gives eligible prey longer to escape', () => {
    const w = world(amoeba); w.player.mass = 40;
    const prey = createOrganism(diatom, w.nutrition, 'shell', w.player.x + 70, w.player.y, 25);
    w.organisms = [prey];
    expect(eligiblePrey(w, w.player, prey)).toBe(false);
    prey.mass = 16;
    activateAbility(w, w.player, { x: 1, y: 0 }, 30);
    expect(w.player.ability?.until).toBe(Math.ceil(0.9 * 30 * 2.5));
    expect(eligiblePrey(w, prey, w.player)).toBe(false);
  });
  it('glide respects solid cells and walls while increasing travel distance', () => {
    const w = world(diatom, { zones: [], dissolvedPatches: [] });
    const prey = createOrganism(amoeba, w.nutrition, 'blocker', w.player.x + 80, w.player.y, 100);
    w.organisms = [prey];
    activateAbility(w, w.player, { x: 1, y: 0 }, 30);
    for (let i = 0; i < 37; i++) {
      step(w, { direction: { x: 0, y: 0 } });
      expect(penetration(bodyHull(w, w.player), bodyHull(w, prey), 0)).toBeNull();
    }
    const free = world(diatom, { zones: [], dissolvedPatches: [] });
    activateAbility(free, free.player, { x: 1, y: 0 }, 30); advance(free, 37);
    expect(free.player.x).toBeGreaterThan(pond.spawn.x + diatom.growth.startingSpeed * 1.2);
    expect(w.player.ability).toBeNull();
    w.organisms = []; w.player.x = pond.map.width - 50; w.player.cooldownUntil = 0;
    activateAbility(w, w.player, { x: 1, y: 0 }, 30); advance(w, 37);
    expect(Math.max(...bodyHull(w, w.player).map(p => p.x))).toBeLessThanOrEqual(pond.map.width + 0.01);
  });
  it('currents drift idle cells, slow steering and cannot push through a blocker', () => {
    const w = world(amoeba, { zones: [{ id: 'test-current', name: 'Cold', effectId: 'current', x: pond.spawn.x, y: pond.spawn.y, radius: 500, velocity: { x: 60, y: 0 }, speedMultiplier: 0.5 }] });
    advance(w, 30); expect(w.player.x).toBeCloseTo(pond.spawn.x + 60, 2);
    const start = w.player.x;
    step(w, { direction: { x: 1, y: 0 } });
    expect(w.player.x - start).toBeCloseTo((135 * 0.5 + 60) / 30, 2);
    const blocker = createOrganism(amoeba, w.nutrition, 'blocker', w.player.x + 90, w.player.y, 100); w.organisms = [blocker];
    advance(w, 90);
    expect(penetration(bodyHull(w, w.player), bodyHull(w, blocker), 0)).toBeNull();
    expect(environmentAt(w.arena, { x: 200, y: 200 }).speedMultiplier).toBe(1);
  });
  it('producer AI seeks a lit nutrient patch and uses the shared uptake system', () => {
    const w = world(amoeba); w.player.x = 2800; w.player.y = 300;
    const bot = createOrganism(euglena, w.nutrition, 'producer', pond.spawn.x - 300, pond.spawn.y); bot.kind = 'ai';
    bot.ai = { profileId: 'drifter', mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0, wanderAngle: 0, targetId: null }; w.organisms = [bot];
    expect(aiCommand(w, bot, 30).direction.x).toBeGreaterThan(0);
    advance(w, 180); expect(bot.mass).toBeGreaterThan(euglena.growth.startingMass);
  });
  it('snapshots isolate patch stocks and respawn clears producer nutrient inventories', () => {
    const w = world(diatom); advance(w, 60);
    const view = snapshot(w); view.dissolvedPatches[0].resources.silicate = -10;
    expect(w.dissolvedPatches[0].resources.silicate).toBeGreaterThan(0);
    killOrganism(w, w.player, 'Test', 30); w.tick = w.player.respawnAtTick;
    expect(respawnOrganism(w, w.player, 30)).toBe(true);
    expect(Object.values(w.player.nutrients).every(n => n === 0)).toBe(true);
    expect(w.player.reserves.silicon).toBe(0);
    expect(environmentAt(w.arena, w.player).light).toBe(1);
  });
  it('rejects invalid zone effects, light levels and dissolved resources', () => {
    expect(() => validateDefinitions({ ...pond, ambientLight: 2 }, organisms)).toThrow('Invalid ambient light');
    expect(() => validateDefinitions({ ...pond, zones: [{ id: 'bad', name: 'Bad', x: 1600, y: 1200, radius: 200, effectId: 'light', light: -1 }] }, organisms)).toThrow('Invalid light zone');
    expect(() => validateDefinitions({ ...pond, dissolvedPatches: [{ ...pond.dissolvedPatches[0], resources: { carbohydrate: { capacity: 20, renewal: 1 } } }] }, organisms)).toThrow('Invalid dissolved patch');
  });
});
