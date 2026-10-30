import { Application } from 'pixi.js';
import { arenas, species, organisms, validateDefinitions } from '../data';
import { FixedStepClock } from '../sim/fixed-step';
import { Camera } from './camera/camera';
import { Input } from './input/input';
import { PondRenderer } from './rendering/pond-renderer';
import { createHud } from './ui/hud';
import { nutrition } from '../data/nutrition';
import './style.css';
import { connectPond } from '../network/client';
import { roomFromSearch, selectionHref, SPECIES_STORAGE_KEY, NAME_STORAGE_KEY } from '../network/room-url';
import { createLeaderboard } from './ui/leaderboard';
import { MovementPrediction } from './movement-prediction';
import { idleCommand } from '../sim/commands';

async function start(): Promise<void> {
  const arena = arenas['pond-water'];
  validateDefinitions(arena, organisms);
  const root = document.querySelector<HTMLElement>('#app')!;
  const room = roomFromSearch(location.search);
  let speciesId = new URLSearchParams(location.search).get('species');
  if (!speciesId) { try { speciesId = sessionStorage.getItem(SPECIES_STORAGE_KEY); } catch { /* The home page can pass species explicitly when storage is unavailable. */ } }
  if (!speciesId || !arena.roster.includes(speciesId) || !species[speciesId]) {
    location.replace(selectionHref(room));
    return;
  }
  const organism = species[speciesId];
  let name = new URLSearchParams(location.search).get('name') ?? '';
  if (!name) { try { name = sessionStorage.getItem(NAME_STORAGE_KEY) ?? ''; } catch { /* Anonymous name is assigned by the server. */ } }
  document.title = `Room ${room} · microbia`;
  root.innerHTML = '<header class="site-header"><a class="brand" href="/">microbia</a></header><main class="selection"><h1>Joining the pond...</h1><p role="status"></p></main>';
  root.querySelector('[role="status"]')!.textContent = `Room ${room} · ${organism.name}`;
  let network: Awaited<ReturnType<typeof connectPond>>;
  try { network = await connectPond(organism.id, room, name); }
  catch (error) {
    const notice = document.createElement('p');
    notice.setAttribute('role', 'alert');
    notice.textContent = `Could not join the pond. ${error instanceof Error ? error.message : 'Please try again.'}`;
    const retry = document.createElement('button');
    retry.textContent = 'Try again'; retry.addEventListener('click', () => location.reload());
    document.querySelector('.selection')!.append(notice, retry);
    return;
  }
  const hud = createHud(root, arena, organism, nutrition, room);
  const leaderboard = createLeaderboard(root.querySelector<HTMLElement>('.viewport')!);
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
  let current = network.state;
  let previous = current;
  const camera = new Camera();
  const renderer = new PondRenderer(app, arena, organism, nutrition, current);
  const input = new Input(app.canvas);
  hud.activate.addEventListener('click', () => { input.activate(); app.canvas.focus(); });
  hud.reproduce.addEventListener('click', () => { input.reproduce(); app.canvas.focus(); });
  hud.respawn.addEventListener('click', () => { input.respawn(); app.canvas.focus(); });
  const clock = new FixedStepClock();
  const prediction = new MovementPrediction(arena, organisms);
  let pendingCommand = idleCommand();
  let skipNextFrame = false;
  document.addEventListener('visibilitychange', () => {
    input.reset(); clock.reset(); prediction.reset(); pendingCommand = idleCommand(); previous = current; skipNextFrame = true;
    network.send({ direction: { x: 0, y: 0 } });
    current = network.state; previous = current; networkBlend = 0;
  });
  hud.loading.hidden = true;
  const status = document.createElement('div');
  status.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:20;background:#102820;color:#e2efc8;padding:8px;pointer-events:none'; hud.host.append(status);
  let networkBlend = 0;
  let lastHudTick = -1;
  let lastStatusAt = -Infinity;
  app.ticker.add(ticker => {
    if (document.hidden) return;
    const delta = skipNextFrame ? 0 : Math.min(ticker.elapsedMS / 1000, 0.25);
    skipNextFrame = false;
    const command = input.read(camera);
    pendingCommand = { ...command, activate: command.activate || pendingCommand.activate, reproduce: command.reproduce || pendingCommand.reproduce, respawn: command.respawn || pendingCommand.respawn };
    const fraction = clock.advance(delta, () => {
      prediction.record(network.send(pendingCommand), pendingCommand);
      pendingCommand = { ...pendingCommand, activate: false, reproduce: false, respawn: false };
    });
    if (network.state.tick !== current.tick) {
      previous = current; current = network.state; networkBlend = 0;
      if (current.player.generation !== previous.player.generation || current.player.alive !== previous.player.alive) { previous = current; input.reset(); }
    }
    networkBlend += delta;
    let presentation = { previous, current };
    if (network.connected && network.appliedSequence !== undefined) presentation = prediction.render(previous, current, network.playerId, network.appliedSequence, command, fraction, delta, network.stateAge);
    else prediction.reset();
    renderer.render(presentation.previous, presentation.current, Math.min(1, networkBlend / (2 / 30)), camera, delta);
    if (performance.now() - lastStatusAt >= 250) {
      app.canvas.setAttribute('aria-description', network.status); status.textContent = network.status + ' | FPS ' + Math.round(ticker.FPS);
      lastStatusAt = performance.now();
    }
    if (current.tick !== lastHudTick) {
      hud.update(current.player, current.tick, current.organisms);
      leaderboard.update(network.leaderboard, network.playerId);
      lastHudTick = current.tick;
    }
  });
}

start().catch(error => {
  console.error('Unable to start microbia', error);
  const notice = document.createElement('p'); notice.setAttribute('role', 'alert');
  notice.textContent = error instanceof Error ? error.message : 'Unable to open the pond.';
  const home = document.createElement('a'); home.href = '/'; home.textContent = 'Back to home';
  document.querySelector('#app')!.append(notice, home);
});
