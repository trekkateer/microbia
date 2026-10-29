import { expect, it, vi } from 'vitest';
import { createWorld } from '../src/sim/world';
import { pond } from './fixtures';
import { paramecium } from '../src/data/species/paramecium';

it('background simulation advances feeding and starvation with idle controls and returns its state on stop', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const messages: { world: ReturnType<typeof createWorld> }[] = [];
  const worker = { onmessage: null as unknown as (event: { data: unknown }) => void, postMessage: (data: typeof messages[number]) => messages.push(data) };
  vi.stubGlobal('self', worker);
  try {
    await import('../src/client/background-simulation.worker');
    const world = createWorld({ ...pond, practiceTargets: [] }, paramecium);
    world.foodParticles = [];
    world.player.nutrients = {}; world.player.reserves = {};
    const initial = JSON.stringify(world);
    worker.onmessage({ data: { type: 'start', world: structuredClone(world) } });
    vi.advanceTimersByTime(2000);
    worker.onmessage({ data: { type: 'stop' } });
    expect(messages).toHaveLength(1);
    expect(messages[0].world.tick).toBeGreaterThanOrEqual(59);
    expect(messages[0].world.player.satiety).toBeLessThan(world.player.satiety);
    expect(messages[0].world.player.x).toBe(world.player.x);
    expect(JSON.stringify(world)).toBe(initial);
    vi.advanceTimersByTime(1000);
    expect(messages).toHaveLength(1);
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});
