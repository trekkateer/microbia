import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { MovementPrediction } from '../src/client/movement-prediction';
import { Room } from '../src/server/room';
import { createOrganism } from '../src/sim/world';
import { species } from '../src/data';

it('bounds prediction work and preserves authority across large owned colonies in a 512-cell scene', () => {
  const results: { owned: number; medianMs: number; p95Ms: number }[] = [];
  for (const owned of [1, 32, 128]) {
    const room = new Room('cost'); room.join('a', 'a', 'paramecium-caudatum');
    room.world.arena = { ...room.world.arena, zones: [] };
    room.world.organisms = Array.from({ length: 512 }, (_, i) => {
      const actor = createOrganism(species['paramecium-caudatum'], room.world.nutrition, `cell-${i}`, 150 + i % 32 * 140, 150 + Math.floor(i / 32) * 140);
      actor.kind = i < owned ? 'player' : 'ai'; actor.ownerId = i < owned ? 'a' : undefined;
      return actor;
    });
    const predictor = new MovementPrediction(room.world.arena, species);
    let state = room.state('a'), previous = state;
    const samples: number[] = [], command = { direction: { x: 1, y: 0 } };
    for (let frame = 0; frame < 120; frame++) {
      if (frame % 4 === 0) { previous = state; state = room.state('a'); }
      if (frame % 2 === 0) predictor.record(frame / 2, command);
      const start = performance.now();
      const visual = predictor.render(previous, state, 'a', -1, command, frame % 2 / 2, 1 / 60, 0.1);
      samples.push(performance.now() - start);
      expect(predictor.pendingInputs).toBeLessThanOrEqual(8);
      expect(visual.current.player.x - state.player.x).toBeLessThanOrEqual(state.player.speed * 0.25 + 0.01);
    }
    expect(state.player.x).toBe(150); expect(state.player.mass).toBe(25);
    const ordered = samples.slice(20).sort((a, b) => a - b);
    results.push({ owned, medianMs: ordered[Math.floor(ordered.length / 2)], p95Ms: ordered[Math.floor(ordered.length * 0.95)] });
  }
  mkdirSync('.test-temp', { recursive: true });
  writeFileSync('.test-temp/prediction-cost.json', JSON.stringify(results, null, 2));
}, 15000);
