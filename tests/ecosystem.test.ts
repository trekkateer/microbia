import { describe, expect, it } from 'vitest';
import { pond } from '../src/data/arenas/pond';
import { organisms, species } from '../src/data';
import { amoeba } from '../src/data/species/amoeba';
import { paramecium } from '../src/data/species/paramecium';
import { didinium } from '../src/data/species/didinium';
import { createOrganism, createWorld, foodPositionClear, snapshot } from '../src/sim/world';
import { aiCommand } from '../src/sim/systems/ai';
import { killOrganism, respawnOrganism } from '../src/sim/systems/lifecycle';
import { activateAbility, eligiblePrey } from '../src/sim/systems/abilities';
import { bodyHull, penetration } from '../src/sim/systems/collisions';
import { step } from '../src/sim/step';
import { validateDefinitions } from '../src/data/validate';
import type { PlayerState, World } from '../src/sim/types';

function controlled(selected = amoeba as typeof organisms[string]) {
  const world = createWorld({ ...pond, aiSpawns: [] }, selected);
  world.player.protectedUntil = 0;
  world.foodParticles = [];
  return world;
}
function bot(world: World, id: string, speciesId: string, x: number, y: number, profileId: string, mass?: number): PlayerState {
  const actor = createOrganism(organisms[speciesId], world.nutrition, id, x, y, mass);
  actor.kind = organisms[speciesId].npc ? 'npc' : 'ai';
  actor.ai = { profileId, mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0, wanderAngle: 0, targetId: null };
  world.organisms.push(actor);
  return actor;
}
function advance(w: World, ticks: number) { for (let i = 0; i < ticks; i++) step(w, { direction: { x: 0, y: 0 } }); }

describe('living Pond Water', () => {
  it('includes only the five single-celled pond species, with no overlapping spawns', () => {
    const w = createWorld(pond, amoeba);
    expect(new Set(w.organisms.map(p => p.speciesId))).toEqual(new Set(Object.keys(species)));
    expect(w.organisms).toHaveLength(22);
    expect(pond.npcTypes).toEqual([]);
    expect(Object.keys(organisms)).toEqual(Object.keys(species));
    for (const food of w.foodParticles) expect(foodPositionClear(w, food, w.nutrition.foods[food.foodId].radius)).toBe(true);
    const all = [w.player, ...w.organisms];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(penetration(bodyHull(w, all[i]), bodyHull(w, all[j]), 0)).toBeNull();
  });
  it('chooses flee, hunt, forage and wander with diet and counter awareness', () => {
    const w = controlled(); w.player.x = 50; w.player.y = 50;
    const hunter = bot(w, 'hunter', didinium.id, 600, 600, 'hunter');
    const grazer = bot(w, 'grazer', paramecium.id, 700, 600, 'forager');
    expect(aiCommand(w, hunter, 30).direction.x).toBeGreaterThan(0);
    expect(hunter.ai?.mode).toBe('hunt');
    expect(aiCommand(w, grazer, 30).direction.x).toBeGreaterThan(0);
    expect(grazer.ai?.mode).toBe('flee');
    hunter.alive = false; grazer.ai!.decisionAt = 0;
    w.foodParticles = [{ id: 1, foodId: 'protein-fragment', x: 750, y: 600, availableAtTick: 0 }];
    aiCommand(w, grazer, 30);
    expect(grazer.ai?.mode).toBe('forage');
    w.foodParticles = []; grazer.ai!.decisionAt = 0;
    aiCommand(w, grazer, 30);
    expect(grazer.ai?.mode).toBe('wander');
    const algae = bot(w, 'green', 'euglena-gracilis', 1300, 800, 'drifter');
    w.foodParticles = [{ id: 1, foodId: 'detritus', x: algae.x, y: algae.y, availableAtTick: 0 }];
    aiCommand(w, algae, 30);
    expect(algae.ai?.mode).toBe('forage');
    expect(algae.ai?.targetId).toMatch(/^pool-/);
    advance(w, 1);
    expect(algae.eaten).toBe(0);
  });
  it('AI eats, digests and grows through its own inventory without feeding the player', () => {
    const w = controlled();
    const actor = bot(w, 'forager', paramecium.id, 600, 600, 'forager');
    actor.ai!.direction = { x: 0, y: 0 }; actor.ai!.decisionAt = 500;
    w.foodParticles = [{ id: 0, foodId: 'detritus', x: actor.x, y: actor.y, availableAtTick: 0 }];
    advance(w, 1);
    expect(actor.nutrients.carbohydrate).toBe(3);
    expect(actor.mass).toBe(25);
    expect(w.player.eaten).toBe(0);
    advance(w, 120);
    expect(actor.mass).toBeGreaterThan(25);
    expect(actor.nutrients.carbohydrate).toBeLessThan(3);
    expect(w.player.nutrients.carbohydrate).toBe(0);
  });
  it('a Didinium hunts and kills a small Paramecium player through the shared capture rules', () => {
    const w = controlled(paramecium);
    const hunter = bot(w, 'predator', didinium.id, w.player.x + 170, w.player.y, 'hunter');
    advance(w, 180);
    expect(w.player.alive).toBe(false);
    expect(w.player.deathReason).toBe('Eaten by Didinium');
    expect(hunter.eaten).toBe(1);
    expect(hunter.mass).toBeGreaterThanOrEqual(25);
    const eaten = hunter.eaten;
    advance(w, 120);
    expect(hunter.eaten).toBe(eaten);
    expect(w.player.alive).toBe(false); // No automatic player respawn.
    w.player.mass = 100; w.player.alive = true;
    expect(eligiblePrey(w, hunter, w.player)).toBe(false);
  });
  it('blocks early respawn, resets the same species, protects both sides and excludes food', () => {
    const w = controlled(paramecium);
    const hunter = bot(w, 'hunter', didinium.id, w.player.x + 180, w.player.y, 'hunter');
    w.player.nutrients.peptides = 80;
    killOrganism(w, w.player, 'Eaten by Didinium', 30);
    expect(respawnOrganism(w, w.player, 30)).toBe(false);
    const oldId = w.player.id;
    advance(w, 90);
    step(w, { direction: { x: 0, y: 0 }, respawn: true });
    expect(w.player.alive).toBe(true);
    expect(w.player.id).toBe(oldId);
    expect(w.player.speciesId).toBe(paramecium.id);
    expect(w.player.mass).toBe(25);
    expect(w.player.nutrients.peptides).toBe(0);
    expect(w.player.digestion).toEqual([]);
    expect(w.player.ability).toBeNull();
    expect(w.player.generation).toBe(1);
    expect(Math.hypot(w.player.x - hunter.x, w.player.y - hunter.y)).toBeGreaterThan(w.player.radius + hunter.radius + 160);
    expect(eligiblePrey(w, hunter, w.player)).toBe(false);
    const energy = w.player.reserves.energy;
    activateAbility(w, w.player, { x: 1, y: 0 }, 30);
    expect(w.player.reserves.energy).toBe(energy);
    expect(w.player.abilityMessage).toBe('Settling in');
  });
  it('replenishes dead AI with clean state after the configured delay, without multiplying actors', () => {
    const w = controlled();
    const actor = bot(w, 'dead-bot', paramecium.id, 500, 500, 'forager');
    actor.nutrients.peptides = 50;
    killOrganism(w, actor, 'Eaten by Didinium', 30);
    advance(w, 209);
    expect(actor.alive).toBe(false);
    advance(w, 1);
    expect(actor.alive).toBe(true);
    expect(actor.generation).toBe(1);
    expect(w.organisms).toHaveLength(1);
    expect(actor.nutrients.peptides).toBe(0);
    expect(actor.protectedUntil).toBeGreaterThan(w.tick);
    expect(actor.ai?.profileId).toBe('forager');
  });
  it('Didinium dies after prolonged starvation in the live pond', () => {
    const w = controlled(didinium);
    w.player.reserves.energy = 0; w.player.satiety = 0;
    advance(w, 900);
    expect(w.player.alive).toBe(false);
    expect(w.player.deathReason).toBe('Starvation');
  });
  it('replays a populated pond deterministically, with moving AI and no overlapping live bodies', () => {
    const a = createWorld(pond, amoeba, 902), b = createWorld(pond, amoeba, 902);
    const positions = a.organisms.map(p => ({ x: p.x, y: p.y }));
    for (let tick = 0; tick < 300; tick++) {
      const command = { direction: { x: Math.cos(tick / 90), y: Math.sin(tick / 90) }, activate: tick % 60 === 0 };
      step(a, command); step(b, command);
    }
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(a.organisms.some((p, index) => Math.hypot(p.x - positions[index].x, p.y - positions[index].y) > 30)).toBe(true);
    const living = [a.player, ...a.organisms].filter(p => p.alive);
    for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) expect(penetration(bodyHull(a, living[i]), bodyHull(a, living[j]), 0)).toBeNull();
    for (const p of living) expect(Object.values(p.reserves).every(value => Number.isFinite(value) && value >= 0)).toBe(true);
  }, 20000);
  it('validates AI and NPC definitions and protects the playable roster', () => {
    expect(() => validateDefinitions(pond, organisms)).not.toThrow();
    expect(() => validateDefinitions(pond, { ...organisms, [amoeba.id]: { ...amoeba, activeId: null } })).toThrow('not playable');
    expect(() => validateDefinitions({ ...pond, aiSpawns: [{ ...pond.aiSpawns[0], profileId: 'missing' }] }, organisms)).toThrow('Invalid AI spawn');
    expect(() => validateDefinitions({ ...pond, lifecycle: { ...pond.lifecycle, protectionSeconds: -1 } }, organisms)).toThrow('Invalid lifecycle');
  });
});
