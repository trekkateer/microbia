import { step, FIXED_DT } from '../sim/step';
import type { World } from '../sim/types';

let world: World | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let nextTick = 0;
const idle = { direction: { x: 0, y: 0 } };

function advance() {
  if (!world) return;
  const now = performance.now();
  // Keep elapsed time when worker timers are delayed. Bound each batch so stop
  // messages can still be handled promptly in a crowded pond.
  for (let count = 0; nextTick <= now && count < 30; count++) {
    step(world, idle);
    nextTick += FIXED_DT * 1000;
  }
}

self.onmessage = (event: MessageEvent<{ type: 'start'; world: World } | { type: 'stop' }>) => {
  if (event.data.type === 'start') {
    clearInterval(timer);
    world = event.data.world;
    nextTick = performance.now() + FIXED_DT * 1000;
    timer = setInterval(advance, FIXED_DT * 1000);
  } else {
    clearInterval(timer);
    advance();
    self.postMessage({ world });
    world = undefined;
  }
};
