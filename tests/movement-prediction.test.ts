import { expect, it } from 'vitest';
import { MovementPrediction } from '../src/client/movement-prediction';
import { Room } from '../src/server/room';
import { species } from '../src/data';
import { createOrganism } from '../src/sim/world';
import { bodyHull, penetration } from '../src/sim/systems/collisions';
import { reproduce } from '../src/sim/systems/reproduction';
import { RoomBroadcast } from '../src/server/broadcast';
import { FixedStepClock } from '../src/sim/fixed-step';
import type { WorldSnapshot } from '../src/sim/types';

function scene() {
  const room = new Room('prediction');
  room.world.organisms = []; room.world.arena = { ...room.world.arena, zones: [] };
  room.join('a', 'a', 'paramecium-caudatum');
  const actor = room.world.organisms.find(p => p.ownerId === 'a')!;
  actor.x = 1000; actor.y = 1000; actor.motionPath = [{ x: actor.x, y: actor.y }];
  const prediction = new MovementPrediction(room.world.arena, species);
  return { room, actor, prediction };
}
const right = { direction: { x: 1, y: 0 } };
const idle = { direction: { x: 0, y: 0 } };

it('responds within a render frame before any server reply, without modifying authoritative state or rival poses', () => {
  const { room, prediction } = scene();
  room.join('b', 'b', 'amoeba-proteus');
  const state = room.state('a'), original = JSON.stringify(state);
  const shown = prediction.render(state, state, 'a', -1, right, 0.5, 1 / 60, 0.016);
  expect(shown.current.player.x).toBeGreaterThan(state.player.x);
  expect(shown.previous.player.x).toBe(shown.current.player.x);
  expect(shown.current.organisms).toEqual(state.organisms);
  expect(JSON.stringify(state)).toBe(original);
  expect(shown.current.player.mass).toBe(state.player.mass);
  expect(shown.current.player.nutrients).toEqual(state.player.nutrients);
});

it('acknowledges only simulated input and replays each remaining command once', () => {
  const { room, prediction } = scene();
  const before = room.state('a');
  prediction.render(before, before, 'a', -1, idle, 0, 0, 0);
  prediction.record(0, right);
  room.input('a', 0, right);
  const encoder = new RoomBroadcast();
  expect(JSON.parse(encoder.prepare(room)('a', true)).appliedSequence).toBe(-1);
  room.advance();
  expect(JSON.parse(encoder.prepare(room)('a', false)).appliedSequence).toBe(0);
  const after = room.state('a');
  const shown = prediction.render(before, after, 'a', 0, idle, 0, 1, 0);
  expect(prediction.pendingInputs).toBe(0);
  expect(shown.current.player.x).toBeCloseTo(after.player.x, 3);
  prediction.record(1, right);
  const ahead = prediction.render(after, after, 'a', 0, idle, 0, 0, 0);
  expect(ahead.current.player.x).toBeGreaterThan(after.player.x);
  expect(ahead.current.player.x - after.player.x).toBeLessThanOrEqual(after.player.speed / 30 + 0.01);
});

it('bounds memory and visual travel during stalled snapshots, then freezes rather than running away', () => {
  const { room, prediction } = scene();
  const state = room.state('a');
  prediction.render(state, state, 'a', -1, idle, 0, 0, 0);
  for (let i = 0; i < 1000; i++) prediction.record(i, right);
  const ahead = prediction.render(state, state, 'a', -1, right, 1, 0.016, 0.2);
  expect(prediction.pendingInputs).toBeLessThanOrEqual(8);
  expect(ahead.current.player.x - state.player.x).toBeLessThanOrEqual(state.player.speed * 0.25 + 0.01);
  const frozen = prediction.render(state, state, 'a', -1, { direction: { x: -1, y: 0 } }, 1, 1, 2);
  expect(frozen.current.player.x).toBe(ahead.current.player.x);
});

it('does not predict combat, reproduction, stuns or an old life, and clamps to membrane bounds', () => {
  const { room, actor, prediction } = scene();
  actor.x = room.world.arena.map.width - 50;
  let state = room.state('a');
  prediction.render(state, state, 'a', -1, idle, 0, 0, 0);
  for (let i = 0; i < 8; i++) prediction.record(i, { ...right, activate: true, reproduce: true });
  const shown = prediction.render(state, state, 'a', -1, right, 1, 0.1, 0);
  expect(Math.max(...bodyHull(room.world, shown.current.player).map(p => p.x))).toBeLessThanOrEqual(room.world.arena.map.width - 1 + 0.001);
  expect(shown.current.player.ability).toBeNull();
  expect(shown.current.organisms).toHaveLength(0);
  actor.stunnedUntil = room.world.tick + 30;
  state = room.state('a');
  expect(prediction.render(state, state, 'a', -1, right, 1, 0.1, 0).current.player.x).toBe(state.player.x);
  actor.stunnedUntil = 0; actor.generation++;
  state = room.state('a');
  prediction.render(state, state, 'a', -1, idle, 0, 0, 0);
  expect(prediction.pendingInputs).toBe(0);
  actor.mass = 100; actor.protectedUntil = 0; actor.x = 2000;
  expect(reproduce(room.world, actor)).toBe(true);
  state = room.state('a');
  expect(prediction.render(state, state, 'a', 7, idle, 0, 0, 0).current.player.x).toBe(state.player.x);
});

it('checks detailed neighboring membranes without moving the obstacle or tunneling through it', () => {
  const { room, actor, prediction } = scene();
  const obstacle = createOrganism(species['amoeba-proteus'], room.world.nutrition, 'wall-cell', actor.x + 95, actor.y);
  obstacle.kind = 'ai'; room.world.organisms.push(obstacle);
  const state = room.state('a');
  prediction.render(state, state, 'a', -1, idle, 0, 0, 0);
  for (let i = 0; i < 8; i++) prediction.record(i, right);
  const shown = prediction.render(state, state, 'a', -1, right, 1, 0, 0).current;
  expect(penetration(bodyHull(room.world, shown.player), bodyHull(room.world, obstacle), 0)).toBeNull();
  expect(shown.organisms.find(p => p.id === obstacle.id)!.x).toBe(obstacle.x);
});

it('uses the same authoritative timeline for neighboring cells instead of predicting into interpolated bodies', () => {
  const { room, actor, prediction } = scene();
  const neighbor = createOrganism(species['paramecium-caudatum'], room.world.nutrition, 'neighbor', actor.x + 90, actor.y);
  neighbor.kind = 'ai'; neighbor.velocity = { x: -100, y: 0 };
  room.world.organisms.push(neighbor);
  const previous = room.state('a');
  actor.x -= 10; neighbor.x -= 8;
  const current = room.state('a'), original = JSON.stringify({ previous, current });
  for (let i = 0; i < 8; i++) prediction.record(i, right);
  const shown = prediction.render(previous, current, 'a', -1, right, 1, 1 / 60, 0.1);
  expect(shown.previous).toBe(previous);
  expect(shown.current).toBe(current);
  expect(JSON.stringify({ previous, current })).toBe(original);
});

it('includes owned siblings and discards correction offsets when approaching contact', () => {
  const { room, actor, prediction } = scene();
  const initial = room.state('a');
  for (let i = 0; i < 6; i++) prediction.record(i, right);
  expect(prediction.render(initial, initial, 'a', -1, right, 1, 1 / 60, 0.1).current.player.x).toBeGreaterThan(actor.x);
  const sibling = createOrganism(species[actor.speciesId], room.world.nutrition, 'sibling', actor.x + 75, actor.y);
  sibling.kind = 'player'; sibling.ownerId = 'a'; room.world.organisms.push(sibling);
  const current = room.state('a');
  expect(prediction.render(initial, current, 'a', 5, right, 1, 1 / 60, 0.1).current).toBe(current);
  room.world.organisms = room.world.organisms.filter(p => p.id !== sibling.id);
  const open = room.state('a');
  const resumed = prediction.render(current, open, 'a', 5, idle, 0, 1 / 60, 0.1);
  expect(resumed.current.player.x).toBeCloseTo(open.player.x, 3);
});

it('remains responsive with a simulated 200ms round trip and converges after stopping', () => {
  const { room, prediction } = scene();
  room.world.foodParticles = [];
  let current = room.state('a'), previous = current, sequence = 0, firstMovement = Infinity;
  const start = current.player.x;
  const clock = new FixedStepClock();
  const inputQueue: { at: number; sequence: number; command: typeof right }[] = [];
  const snapshots: { at: number; state: WorldSnapshot; ack: number }[] = [];
  let ack = -1, receivedAt = 0, shown = current;
  prediction.render(previous, current, 'a', ack, idle, 0, 0, 0);
  for (let frame = 1; frame <= 100; frame++) {
    const now = frame / 60;
    const command = now >= 0.2 && now < 0.8 ? right : idle;
    const fraction = clock.advance(1 / 60, () => {
      prediction.record(sequence, command);
      inputQueue.push({ at: now + 0.1, sequence: sequence++, command });
    });
    while (inputQueue[0]?.at <= now + 1e-9) {
      const input = inputQueue.shift()!; room.input('a', input.sequence, input.command);
    }
    if (frame % 2 === 0) {
      room.advance();
      if (room.world.tick % 2 === 0) snapshots.push({ at: now + 0.1, state: room.state('a'), ack: room.clients.get('a')!.appliedSequence });
    }
    while (snapshots[0]?.at <= now + 1e-9) {
      const snapshot = snapshots.shift()!; previous = current; current = snapshot.state; ack = snapshot.ack; receivedAt = now;
    }
    shown = prediction.render(previous, current, 'a', ack, command, fraction, 1 / 60, now - receivedAt).current;
    if (shown.player.x > start + 0.1 && firstMovement === Infinity) {
      firstMovement = now;
      expect(current.player.x).toBe(start);
    }
  }
  expect(firstMovement - 0.2).toBeLessThanOrEqual(1 / 30);
  expect(Math.abs(shown.player.x - current.player.x)).toBeLessThan(1);
});

it('freezes the correct per-owner acknowledgement at snapshot encoding time', () => {
  const { room } = scene(); room.join('b', 'b', 'paramecium-caudatum');
  room.input('a', 3, right); room.input('b', 9, idle); room.advance();
  const packet = new RoomBroadcast().prepare(room);
  room.input('a', 4, right); room.advance();
  expect(JSON.parse(packet('a', true)).appliedSequence).toBe(3);
  expect(JSON.parse(packet('b', true)).appliedSequence).toBe(9);
});
