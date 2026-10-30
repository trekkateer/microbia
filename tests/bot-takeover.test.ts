import { expect, it } from 'vitest';
import { Room } from '../src/server/room';
import { species } from '../src/data';
import { reproduce } from '../src/sim/systems/reproduction';
import { killOrganism } from '../src/sim/systems/lifecycle';

for (const definition of Object.values(species)) {
  it(`hands ${definition.name} to its species AI without resetting the organism`, () => {
    const room = new Room('takeover'); room.world.organisms = [];
    room.join('a', 'secret', definition.id, 'River');
    const actor = room.world.organisms[0];
    actor.x = 1000; actor.y = 1000; actor.cooldownUntil = 90; actor.stunnedUntil = 15;
    actor.pendingMotion = { x: 2, y: -3 };
    const { kind, ownerId, ai, ...before } = structuredClone(actor);
    room.leave('a');
    const { kind: afterKind, ownerId: afterOwner, ai: afterAi, ...after } = actor;
    expect(after).toEqual(before);
    expect(afterKind).toBe('ai'); expect(afterOwner).toBeUndefined();
    expect(afterAi?.profileId).toBe(definition.reproduction?.offspringAi);
    expect(room.world.organisms).toContain(actor);
    expect(room.clients.size).toBe(0);
    expect(room.leaderboard()[0]).toMatchObject({ name: 'River', speciesId: definition.id, mass: actor.mass, bot: true });
    expect(() => room.input('a', 1, { direction: { x: 1, y: 0 } })).toThrow('Player not joined');
    expect(() => room.state('a')).toThrow('Player not joined');
    const afterTakeover = structuredClone(actor);
    room.leave('a'); expect(actor).toEqual(afterTakeover);
    actor.stunnedUntil = 0;
    room.advance();
    expect(actor.ai!.decisionAt).toBeGreaterThan(room.world.tick);
  });
}

it('hands every surviving daughter to one named bot colony and permits further AI division', () => {
  const room = new Room('daughters'); room.world.organisms = [];
  room.join('a', 'secret', 'amoeba-proteus', 'River');
  const actor = room.world.organisms[0]; actor.mass = 220; actor.protectedUntil = 0;
  expect(reproduce(room.world, actor)).toBe(true);
  const ids = room.world.organisms.map(p => p.id);
  const mass = room.world.organisms.reduce((sum, p) => sum + p.mass, 0);
  room.leave('a');
  expect(room.world.organisms.map(p => p.id)).toEqual(ids);
  expect(room.world.organisms.every(p => p.kind === 'ai' && !p.ownerId && p.ai)).toBe(true);
  expect(room.leaderboard()).toHaveLength(1);
  expect(room.leaderboard()[0]).toMatchObject({ name: 'River', mass, bot: true });
  actor.mass = 220;
  expect(reproduce(room.world, actor)).toBe(true);
  expect(room.world.organisms.at(-1)).toMatchObject({ kind: 'ai', colonyId: actor.colonyId, ownerId: undefined });
  expect(room.leaderboard()).toHaveLength(1);
});

it('keeps living targets capturable, removes dead cells without resurrecting them, and preserves other players', () => {
  const room = new Room('targets'); room.world.organisms = [];
  room.join('a', 'secret', 'paramecium-caudatum'); room.join('b', 'secret-b', 'didinium-nasutum');
  const actor = room.world.organisms[0], hunter = room.world.organisms[1];
  hunter.ability = { effect: 'capture', targetId: actor.id, direction: { x: 1, y: 0 }, startedAtTick: 0, until: 90 };
  room.leave('a');
  expect(hunter.ability?.targetId).toBe(actor.id);
  expect(hunter.ownerId).toBe('b'); expect(room.clients.has('b')).toBe(true);
  killOrganism(room.world, hunter, 'test', 30);
  room.leave('b');
  expect(room.world.organisms.some(p => p.id === hunter.id)).toBe(false);
  expect(room.world.organisms).toContain(actor);
});

it('cleans up a join that never established a stream without creating a bot', () => {
  const room = new Room('abandoned'); room.world.organisms = [];
  room.join('a', 'secret', 'amoeba-proteus');
  room.leave('a', false);
  expect(room.world.organisms).toHaveLength(0); expect(room.clients.size).toBe(0);
});
