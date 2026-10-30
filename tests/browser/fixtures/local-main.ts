import { Application } from 'pixi.js';
import { arenas, species, organisms, validateDefinitions } from '../../../src/data';
import { createWorld, snapshot } from '../../../src/sim/world';
import { step } from '../../../src/sim/step';
import { FixedStepClock } from '../../../src/sim/fixed-step';
import { Camera } from '../../../src/client/camera/camera';
import { Input } from '../../../src/client/input/input';
import { PondRenderer } from '../../../src/client/rendering/pond-renderer';
import { createHud } from '../../../src/client/ui/hud';
import { nutrition } from '../../../src/data/nutrition';
import '../../../src/client/style.css';
import { connectPond } from '../../../src/network/client';
import { chooseSpecies } from './local-selection';

async function start(): Promise<void> {
  const arena = arenas['pond-water'];
  validateDefinitions(arena, organisms);
  const organism = await chooseSpecies(document.querySelector<HTMLElement>('#app')!, arena, species);
  const online = document.querySelector<HTMLInputElement>('#online-mode')?.checked;
  const room = document.querySelector<HTMLInputElement>('#room-name')?.value || 'pond';
  let network: Awaited<ReturnType<typeof connectPond>> | undefined;
  if (online) {
    try { network = await connectPond(organism.id, room); }
    catch (error) { const notice = document.createElement('p'); notice.textContent = String(error) + ' - reload to try again or choose local play.'; document.querySelector('#app')!.append(notice); return; }
  }
  const hud = createHud(document.querySelector<HTMLElement>('#app')!, arena, organism, nutrition);
  document.querySelectorAll<HTMLAnchorElement>('.sandbox-actions a, #death-panel a').forEach(link => { link.href = '/tests/browser/fixtures/local.html'; });
  const app = new Application();
  try {
    await app.init({ resizeTo: hud.host, background: arena.theme.background, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
  } catch (error) {
    hud.loading.textContent = 'The pond could not start. Enable hardware acceleration in your browser, then reload.';
    throw error;
  }
  app.canvas.tabIndex = 0;
  app.canvas.setAttribute('aria-label', 'Pond Water. Steer your cells with the mouse, WASD or arrow keys. Press Space for your species ability and R to divide when ready. The camera adjusts automatically.');
  hud.host.appendChild(app.canvas);
  const world = createWorld(arena, organism);
  if (import.meta.env.DEV && import.meta.env.VITE_TEST_HOOKS === '1') window.__microbiaTest = { world };
  let current = network?.state ?? snapshot(world);
  let previous = current;
  const camera = new Camera();
  const renderer = new PondRenderer(app, arena, organism, nutrition, current);
  const input = new Input(app.canvas);
  hud.activate.addEventListener('click', () => { input.activate(); app.canvas.focus(); });
  hud.reproduce.addEventListener('click', () => { input.reproduce(); app.canvas.focus(); });
  hud.respawn.addEventListener('click', () => { input.respawn(); app.canvas.focus(); });
  const clock = new FixedStepClock();
  let skipNextFrame = false;
  let backgroundWorker: Worker | undefined;
  const beginBackground = () => {
    if (network || backgroundWorker) return;
    const worker = new Worker(new URL('../../../src/client/background-simulation.worker.ts', import.meta.url), { type: 'module' });
    backgroundWorker = worker;
    worker.onmessage = event => {
      // Transfer authority back only after the worker has stopped. Keeping the
      // original world object preserves developer/test references.
      Object.assign(world, event.data.world);
      current = snapshot(world); previous = current;
      clock.reset(); skipNextFrame = true;
      worker.terminate(); backgroundWorker = undefined;
      if (document.hidden) beginBackground();
    };
    worker.onerror = () => {
      worker.terminate(); backgroundWorker = undefined;
      clock.reset(); skipNextFrame = true;
      console.error('Background pond simulation stopped unexpectedly');
    };
    worker.postMessage({ type: 'start', world });
  };
  document.addEventListener('visibilitychange', () => {
    input.reset(); clock.reset(); previous = current; skipNextFrame = true;
    if (network) {
      network.send({ direction: { x: 0, y: 0 } });
      current = network.state; previous = current; networkBlend = 0;
    } else if (document.hidden) beginBackground();
    else backgroundWorker?.postMessage({ type: 'stop' });
  });
  hud.loading.hidden = true;
  const status = document.createElement('div');
  if (network) { status.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:20;background:#102820;color:#e2efc8;padding:8px;pointer-events:none'; hud.host.append(status); }
  let networkBlend = 0;
  let lastHudTick = -1;
  if (document.hidden) beginBackground();
  app.ticker.add(ticker => {
    if (document.hidden || backgroundWorker) return;
    const delta = skipNextFrame ? 0 : Math.min(ticker.elapsedMS / 1000, 0.25);
    skipNextFrame = false;
    const alpha = clock.advance(delta, () => {
      if (!network) previous = current;
      const command = input.read(camera);
      if (network) { network.send(command); if (network.state.tick !== current.tick) { previous = current; current = network.state; networkBlend = 0; } }
      else { step(world, command); current = snapshot(world); }
      if (current.player.generation !== previous.player.generation || current.player.alive !== previous.player.alive) { previous = current; input.reset(); }
    });
    networkBlend += delta;
    renderer.render(previous, current, network ? Math.min(1, networkBlend / (2 / 30)) : alpha, camera, delta);
    if (network) { app.canvas.setAttribute('aria-description', network.status); status.textContent = network.status + ' | FPS ' + Math.round(ticker.FPS); }
    if (current.tick !== lastHudTick) {
      hud.update(current.player, current.tick, current.organisms);
      lastHudTick = current.tick;
    }
  });
}

start().catch(error => { console.error('Unable to start microbia', error); });
