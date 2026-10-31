import type { ArenaDefinition, SpeciesDefinition } from '../../data/schemas';
import { createSpeciesCard } from './species-card';
import { DEFAULT_ROOM, NAME_STORAGE_KEY, validateRoom } from '../../network/room-url';

export function chooseSpecies(root: HTMLElement, arena: ArenaDefinition, roster: Readonly<Record<string, SpeciesDefinition>>, initialRoom = DEFAULT_ROOM, initialName = ''): Promise<SpeciesDefinition> {
  root.innerHTML = `<header class="site-header"><a class="brand" href="/"><span class="brand-cell"></span>microbia</a><nav class="selection-nav" aria-label="Main navigation"><a href="/" aria-current="page">Play</a><a href="/species" >Species index</a></nav></header><main class="selection home-selection"><div class="eyebrow">FRESHWATER / POND WATER</div><h1>Small life. Different instincts.</h1><p class="selection-intro">Choose your organism. Let its biology shape how you play.</p><form class="join-form"><fieldset class="join-settings"><legend>Enter the pond</legend><div class="join-fields"><label class="join-field" for="room-name"><span>Room</span><input id="room-name" name="room" list="active-rooms" maxlength="24" required pattern="[a-zA-Z0-9-]+" autocomplete="off" spellcheck="false" aria-describedby="room-help"><small id="room-help">Choose an active room or enter a room name.</small></label><label class="join-field" for="player-name"><span>Your name <small>OPTIONAL</small></span><input id="player-name" name="nickname" maxlength="24" placeholder="Pond explorer" autocomplete="nickname" aria-describedby="name-help"><small id="name-help">Shown to other players on the leaderboard.</small></label></div><datalist id="active-rooms"></datalist><div class="room-lobby" aria-label="Active rooms"></div><p class="lobby-status" role="status"></p></fieldset><div class="roster roster-compact"></div></form><p class="selection-note selection-controls">Mouse or WASD to move <span aria-hidden="true">/</span> Space for your ability <span aria-hidden="true">/</span> R to divide</p></main>`;
  const selection = root.querySelector<HTMLElement>('.selection')!;
  const form = root.querySelector<HTMLFormElement>('.join-form')!;
  const roomInput = root.querySelector<HTMLInputElement>('#room-name')!;
  const nameInput = root.querySelector<HTMLInputElement>('#player-name')!;
  const lobby = root.querySelector<HTMLElement>('.room-lobby')!;
  const status = root.querySelector<HTMLElement>('.lobby-status')!;
  const options = root.querySelector<HTMLDataListElement>('#active-rooms')!;
  roomInput.value = validateRoom(initialRoom); nameInput.value = initialName;
  roomInput.setAttribute('aria-label', 'Room'); nameInput.setAttribute('aria-label', 'Your name');
  nameInput.addEventListener('input', () => { try { sessionStorage.setItem(NAME_STORAGE_KEY, nameInput.value); } catch { /* Optional storage. */ } });
  const syncRoom = () => {
    roomInput.setCustomValidity('');
    for (const chip of lobby.querySelectorAll<HTMLButtonElement>('button')) chip.setAttribute('aria-pressed', String(chip.dataset.room === roomInput.value));
    try {
      const query = '?' + new URLSearchParams({ room: validateRoom(roomInput.value) });
      root.querySelector<HTMLAnchorElement>('.selection-nav a[href^="/species"]')!.href = '/species' + query;
      root.querySelector<HTMLAnchorElement>('.selection-nav a:not([href^="/species"])')!.href = '/' + query;
    } catch { /* Validation is shown when joining, not while typing. */ }
  };
  roomInput.addEventListener('input', syncRoom);
  syncRoom();
  let polling = false, stopped = false, signature = '';
  const refresh = async () => {
    if (!selection.isConnected || polling || stopped) return;
    polling = true;
    try {
      const response = await fetch('/api/lobby', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error();
      const rooms: { id: string; players: number }[] = await response.json();
      if (stopped || !selection.isConnected) return;
      const valid = rooms.filter(room => { try { validateRoom(room.id); return Number.isFinite(room.players); } catch { return false; } });
      const nextSignature = JSON.stringify(valid);
      status.textContent = valid.length ? 'Select a room, then choose your organism.' : 'No active rooms. Choose a species to open one.';
      if (nextSignature !== signature) {
        signature = nextSignature; lobby.replaceChildren(); options.replaceChildren();
        for (const room of valid) {
          const option = document.createElement('option'); option.value = room.id; option.label = `${room.players}/20 players`; options.append(option);
          const chip = document.createElement('button'); chip.type = 'button'; chip.dataset.room = room.id;
          chip.textContent = `Room ${room.id} · ${room.players}/20`;
          chip.addEventListener('click', () => { roomInput.value = room.id; syncRoom(); });
          lobby.append(chip);
        }
        syncRoom();
      }
    } catch { if (!stopped) status.textContent = 'Cannot reach the pond server. Please try again shortly.'; }
    finally { polling = false; }
  };
  void refresh();
  const interval = setInterval(() => { if (!selection.isConnected) clearInterval(interval); else void refresh(); }, 5000);
  return new Promise(resolve => {
    for (const id of arena.roster) {
      const card = createSpeciesCard(roster[id]);
      root.querySelector('.roster')!.append(card);
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const button = (event as SubmitEvent).submitter as HTMLButtonElement | null;
      const organism = button?.dataset.species ? roster[button.dataset.species] : undefined;
      if (!organism || stopped) return;
      roomInput.value = roomInput.value.trim(); nameInput.value = nameInput.value.trim();
      try { validateRoom(roomInput.value); }
      catch (error) { roomInput.setCustomValidity(error instanceof Error ? error.message : 'Invalid room'); }
      if (!form.reportValidity()) return;
      stopped = true; clearInterval(interval);
      form.querySelectorAll('button').forEach(control => { control.disabled = true; });
      status.textContent = 'Joining the pond...'; resolve(organism);
    });
  });
}
