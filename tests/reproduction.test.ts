import { describe, expect, it } from 'vitest';
import { pond } from './fixtures';
import { organisms } from '../src/data';
import { amoeba } from '../src/data/species/amoeba';
import { paramecium } from '../src/data/species/paramecium';
import { didinium } from '../src/data/species/didinium';
import { euglena } from '../src/data/species/euglena';
import { diatom } from '../src/data/species/diatom';
import type { SpeciesDefinition } from '../src/data/schemas';
import type { World } from '../src/sim/types';
import { createOrganism, createWorld, snapshot } from '../src/sim/world';
import { reproduce, reproductionBlock } from '../src/sim/systems/reproduction';
import { playerCells, playerCellCommand, selectPlayerAttacker, keepPlayerAlive, activatePlayerAbility } from '../src/sim/systems/player-control';
import { updateGrowth } from '../src/sim/systems/growth';
import { metabolize } from '../src/sim/systems/metabolism';
import { killOrganism, respawnOrganism } from '../src/sim/systems/lifecycle';
import { bodyHull, penetration } from '../src/sim/systems/collisions';
import { step } from '../src/sim/step';
import { validateDefinitions } from '../src/data/validate';

function setup(species: SpeciesDefinition = amoeba): World {
  const w = createWorld({ ...pond, practiceTargets: [], lifecycle: { playerRespawnSeconds: 3, aiRespawnSeconds: 7, protectionSeconds: 3, spawnClearance: 160 } }, species);
  w.player.protectedUntil = 0; w.foodParticles = [];
  return w;
}
function grow(w: World, mass = w.species.growth.maximumMass * w.species.reproduction!.threshold) {
  w.player.mass = mass; updateGrowth(w);
}
function prey(w: World, id: string, x: number, y: number, mass = 20) {
  const target = createOrganism(paramecium, w.nutrition, id, x, y, mass);
  w.organisms.push(target); return target;
}

describe('reproduction and player cell groups', () => {
  it.each([amoeba, paramecium, didinium, euglena, diatom])('$name divides exactly at its configured threshold', species => {
    const w = setup(species), threshold = species.growth.maximumMass * species.reproduction.threshold;
    grow(w, threshold - 0.001);
    expect(reproduce(w, w.player)).toBe(false);
    expect(w.organisms).toHaveLength(0);
    grow(w, threshold);
    expect(reproduce(w, w.player)).toBe(true);
    expect(w.player.mass).toBe(threshold / 2);
    const child = w.organisms[0];
    expect(child.mass).toBe(threshold / 2); expect(child.speciesId).toBe(species.id);
    expect(child.kind).toBe('player'); expect(child.ai).toBeNull();
    expect(playerCells(w)).toHaveLength(2);
    expect(reproduce(w, w.player)).toBe(false);
    expect(reproduce(w, child)).toBe(false);
    // The next growth update must not inflate either daughter to a size floor.
    for (const actor of playerCells(w)) updateGrowth({ ...w, player: actor });
    expect(w.player.mass + child.mass).toBe(threshold);
  });
  it('hunters have higher cutoffs than grazers and producers', () => {
    expect(amoeba.reproduction.threshold).toBeGreaterThan(paramecium.reproduction.threshold);
    expect(didinium.reproduction.threshold).toBeGreaterThan(euglena.reproduction.threshold);
    for (const s of [paramecium, euglena, diatom]) expect(s.reproduction.threshold).toBe(0.3);
  });
  it('conserves biomass, every nutrient, reserves and pending digestion without aliasing', () => {
    const w = setup(); grow(w);
    w.player.nutrients = { peptides: 12, carbohydrate: 10, silicate: 3 };
    w.player.reserves = { energy: 32, carbon: 5, nitrogen: 3, phosphorus: 1, lipids: 2 };
    w.player.digestion = [{ foodId: 'protein-fragment', completesAtTick: 100, composition: { peptides: 8 } }];
    w.player.cooldownUntil = 200; w.player.hungryTicks = 4;
    const before = snapshot(w).player;
    reproduce(w, w.player); const child = w.organisms[0];
    expect(w.player.mass + child.mass).toBe(before.mass);
    for (const key of ['nutrients', 'reserves'] as const) for (const [id, value] of Object.entries(before[key])) {
      expect(w.player[key][id]).toBe(value / 2); expect(child[key][id]).toBe(value / 2);
    }
    expect(child.digestion[0].completesAtTick).toBe(100);
    expect(child.digestion[0].composition.peptides + w.player.digestion[0].composition.peptides).toBe(8);
    expect(child.cooldownUntil).toBe(200); expect(w.player.cooldownUntil).toBe(200);
    expect(child.hungryTicks).toBe(4); expect(child.protectedUntil).toBe(0);
    child.nutrients.peptides = 0; child.reserves.energy = 0; child.digestion[0].composition.peptides = 0;
    expect(w.player.nutrients.peptides).toBe(6); expect(w.player.reserves.energy).toBe(16);
    expect(w.player.digestion[0].composition.peptides).toBe(4);
  });
  it('does not release pending meals early or duplicate their yields', () => {
    const w = setup(); grow(w);
    w.player.nutrients.peptides = 8;
    w.player.digestion = [{ foodId: 'protein-fragment', completesAtTick: 100, composition: { peptides: 8 } }];
    reproduce(w, w.player); const child = w.organisms[0];
    for (const actor of playerCells(w)) metabolize({ ...w, player: actor }, 0, 0);
    expect(w.player.nutrients.peptides + child.nutrients.peptides).toBe(8);
    w.tick = 100;
    for (const actor of playerCells(w)) metabolize({ ...w, player: actor }, 0, 0);
    expect(w.player.reserves.nitrogen + child.reserves.nitrogen).toBeCloseTo(8 * 0.8);
    expect(w.player.digestion).toHaveLength(0); expect(child.digestion).toHaveLength(0);
    for (const actor of playerCells(w)) metabolize({ ...w, player: actor }, 0, 0);
    expect(w.player.reserves.nitrogen + child.reserves.nitrogen).toBeCloseTo(6.4);
  });
  it('places two solid cells without crossing neighbors or walls', () => {
    const w = setup(); grow(w); w.player.x = 200; w.player.y = 200;
    const before = { x: w.player.x, y: w.player.y };
    expect(reproduce(w, w.player)).toBe(true); const child = w.organisms[0];
    expect((w.player.x + child.x) / 2).toBe(before.x); expect((w.player.y + child.y) / 2).toBe(before.y);
    expect(penetration(bodyHull(w, w.player), bodyHull(w, child), 0)).toBeNull();
    for (const cell of playerCells(w)) for (const point of bodyHull(w, cell)) {
      expect(point.x).toBeGreaterThan(0); expect(point.y).toBeGreaterThan(0);
    }
  });
  it.each(['crowded', 'corner'])('makes room for division in a %s location', location => {
    const w = setup(); grow(w); const mass = w.player.mass;
    if (location === 'corner') { w.player.x = 110; w.player.y = 110; }
    else for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      w.organisms.push(createOrganism(amoeba, w.nutrition, `neighbor-${i}`, w.player.x + Math.cos(angle) * 170, w.player.y + Math.sin(angle) * 170, 55));
    }
    expect(reproduce(w, w.player)).toBe(true);
    expect(playerCells(w)).toHaveLength(2);
    expect(playerCells(w).reduce((sum, cell) => sum + cell.mass, 0)).toBe(mass);
    expect(w.nextOrganismId).toBe(2);
    const cells = [w.player, ...w.organisms];
    for (const cell of cells) for (const point of bodyHull(w, cell)) {
      expect(point.x).toBeGreaterThanOrEqual(0); expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(w.arena.map.width); expect(point.y).toBeLessThanOrEqual(w.arena.map.height);
    }
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      expect(penetration(bodyHull(w, cells[i]), bodyHull(w, cells[j]), 0)).toBeNull();
    }
  });
  it('blocks division during stun, active abilities, protection and capture', () => {
    const w = setup(); grow(w);
    w.player.stunnedUntil = 1; expect(reproduce(w, w.player)).toBe(false); w.player.stunnedUntil = 0;
    w.player.protectedUntil = 1; expect(reproduce(w, w.player)).toBe(false); w.player.protectedUntil = 0;
    w.player.ability = { effect: 'capture', startedAtTick: 0, until: 20, targetId: null, direction: { x: 1, y: 0 } };
    expect(reproduce(w, w.player)).toBe(false); w.player.ability = null;
    const hunter = createOrganism(amoeba, w.nutrition, 'hunter', 1000, 1000, 225); w.organisms = [hunter];
    hunter.ability = { effect: 'capture', startedAtTick: 0, until: 20, targetId: w.player.id, direction: { x: 1, y: 0 } };
    expect(reproductionBlock(w, w.player)).toBe('Escape capture before dividing');
  });
  it('does not let offspring respawn', () => {
    const w = setup(); grow(w);
    expect(reproduce(w, w.player)).toBe(true);
    const child = w.organisms[0]; child.kind = 'ai';
    killOrganism(w, child, 'Test', 30); w.tick = child.respawnAtTick;
    expect(respawnOrganism(w, child, 30)).toBe(false);
    step(w, { direction: { x: 0, y: 0 } }); expect(w.organisms).toHaveLength(0);
  });
  it('R divides all eligible controlled cells once per command and keeps keyboard control', () => {
    const w = setup(paramecium); grow(w); step(w, { direction: { x: 0, y: 0 }, reproduce: true });
    expect(playerCells(w)).toHaveLength(2);
    const old = playerCells(w).map(p => ({ id: p.id, x: p.x }));
    step(w, { direction: { x: 1, y: 0 } });
    for (const p of playerCells(w)) expect(p.x).toBeGreaterThan(old.find(o => o.id === p.id)!.x);
    for (const [i, p] of playerCells(w).entries()) { p.mass = 180; p.x = 900 + i * 900; p.y = 1200; updateGrowth({ ...w, player: p }); }
    step(w, { direction: { x: 0, y: 0 }, reproduce: true }); expect(playerCells(w)).toHaveLength(4);
  });
  it('mouse steering directs each cell toward the same world point', () => {
    const w = setup(); grow(w); reproduce(w, w.player);
    const a = w.player, b = w.organisms[0], target = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ca = playerCellCommand(a, { target, direction: { x: 0, y: 0 } });
    const cb = playerCellCommand(b, { target, direction: { x: 0, y: 0 } });
    expect(ca.direction.y * cb.direction.y).toBeLessThan(0);
  });
  it('Amoeba selects nearby forward prey regardless of pointer position', () => {
    const w = setup(); grow(w); reproduce(w, w.player);
    const sibling = w.organisms[0];
    w.player.x = 800; w.player.y = 1200; sibling.x = 1600; sibling.y = 1200;
    const target = prey(w, 'intended', 1680, 1200), decoy = prey(w, 'decoy', 750, 1200);
    const command = { direction: { x: 1, y: 0 }, target: { x: decoy.x, y: decoy.y } };
    expect(selectPlayerAttacker(w, command)).toEqual({ actor: sibling, target });
    activatePlayerAbility(w, command, 30);
    expect(sibling.ability?.targetId).toBe(target.id); expect(w.player.ability).toBeNull();
    expect(decoy.alive).toBe(true);
    sibling.ability = null; sibling.cooldownUntil = 100;
    expect(selectPlayerAttacker(w, command)?.actor).toBe(w.player);
    sibling.cooldownUntil = 0; sibling.mass = 10;
    expect(selectPlayerAttacker(w, command)?.actor).toBe(w.player);
  });
  it('keyboard aiming chooses prey ahead and Didinium uses the nearest daughter', () => {
    const w = setup(didinium); grow(w); reproduce(w, w.player); const sibling = w.organisms[0];
    w.player.x = 800; sibling.x = 1000; w.player.y = sibling.y = 1200;
    const target = prey(w, 'ahead', 1100, 1200); prey(w, 'behind', 700, 1200);
    const command = { direction: { x: 1, y: 0 } };
    expect(selectPlayerAttacker(w, command)).toEqual({ actor: sibling, target });
    activatePlayerAbility(w, command, 30);
    expect(sibling.ability?.effect).toBe('strike'); expect(sibling.ability?.targetId).toBe(target.id);
    expect(w.player.cooldownUntil).toBe(0);
  });
  it('losing one cell continues the round; losing all allows a fresh single-cell respawn', () => {
    const w = setup(); grow(w); reproduce(w, w.player); const sibling = w.organisms[0];
    killOrganism(w, w.player, 'First lost', 30);
    expect(respawnOrganism(w, w.player, 30)).toBe(false);
    keepPlayerAlive(w); expect(w.player).toBe(sibling); expect(w.player.alive).toBe(true);
    expect(playerCells(w)).toHaveLength(1);
    killOrganism(w, w.player, 'Last lost', 30); w.tick = w.player.respawnAtTick;
    expect(respawnOrganism(w, w.player, 30)).toBe(true);
    expect(w.player.mass).toBe(25); expect(playerCells(w)).toHaveLength(1);
    expect(w.player.parentId).toBeNull();
  });
  it('AI can divide through its own command', () => {
    const w = setup(); w.player.x = 2800; w.player.y = 300;
    const ai = createOrganism(paramecium, w.nutrition, 'ai-parent', 800, 1200, 180);
    ai.kind = 'ai'; ai.ai = { profileId: 'forager', mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0, wanderAngle: 0, targetId: null };
    w.organisms = [ai]; step(w, { direction: { x: 0, y: 0 } });
    expect(w.organisms).toHaveLength(2); expect(w.organisms[1].kind).toBe('ai'); expect(w.organisms[1].ai?.profileId).toBe('forager');
  });
  it('division replays deterministically and validates balance settings', () => {
    const a = setup(), b = setup(); grow(a); grow(b);
    step(a, { direction: { x: 0, y: 0 }, reproduce: true }); step(b, { direction: { x: 0, y: 0 }, reproduce: true });
    expect(snapshot(a)).toEqual(snapshot(b));
    for (const threshold of [0, -0.1, 0.01, 1.1, NaN]) expect(() => validateDefinitions(pond, { ...organisms, [amoeba.id]: { ...amoeba, reproduction: { threshold, offspringAi: 'opportunist' } } })).toThrow('Invalid reproduction');
  });
});
