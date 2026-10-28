import type { ArenaDefinition, SpeciesDefinition } from '../../data/schemas';
import { abilities } from '../../data/abilities/pond';

export function chooseSpecies(root: HTMLElement, arena: ArenaDefinition, roster: Readonly<Record<string, SpeciesDefinition>>): Promise<SpeciesDefinition> {
  root.innerHTML = `<header class="site-header"><a class="brand" href="./"><span class="brand-cell"></span>microbia<span class="brand-suffix">.gg</span></a><div class="build-tag">LIVING POND <b>M4</b></div></header><main class="selection"><div class="eyebrow">FRESHWATER / POND WATER</div><h1>Small life. Different instincts.</h1><p class="selection-intro">Choose your organism. Let its biology shape how you play.</p><label class="selection-note"><input id="online-mode" type="checkbox"> Multiplayer prototype</label> <label>Room <input id="room-name" value="pond" maxlength="24" pattern="[a-zA-Z0-9-]+"></label><div class="roster"></div><p class="selection-note">Living pond · Five single-celled species · Mouse or WASD to move · Space for your ability</p></main>`;
  const online = root.querySelector<HTMLInputElement>('#online-mode')!;
  const lobby = document.createElement('p'); lobby.className = 'selection-note';
  root.querySelector('.selection')!.append(lobby);
  let polling = false;
  const refresh = async () => {
    if (!online.isConnected || !online.checked || polling) return;
    polling = true;
    try {
      const response = await fetch('/api/lobby', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error();
      const rooms: { id: string; players: number }[] = await response.json();
      lobby.textContent = rooms.length ? rooms.map(r => r.id + ': ' + r.players + '/20 players').join(' · ') : 'No active rooms. Choose a species to open one.';
    } catch { lobby.textContent = 'Multiplayer server unavailable. Start npm start, then reload.'; }
    finally { polling = false; }
  };
  online.addEventListener('change', () => { if (online.checked) void refresh(); else lobby.textContent = ''; });
  const interval = setInterval(() => { if (!online.isConnected) clearInterval(interval); else void refresh(); }, 5000);
  return new Promise(resolve => {
    arena.roster.forEach(id => {
      const s = roster[id], ability = abilities[s.activeId!];
      const card = document.createElement('article');
      card.className = 'roster-card';
      card.style.setProperty('--species-color', `#${s.visual.membrane.toString(16)}`);
      card.innerHTML = `<div class="roster-art ${s.visual.shape}" aria-hidden="true"><span></span></div><h2>${s.name}</h2><i class="scientific-name">${s.scientificName}</i><p>${s.description}</p><dl><dt>PASSIVE · ${s.passive.name}</dt><dd>${s.passive.description}</dd><dt>SPACE · ${ability.name}</dt><dd>${ability.description} ${ability.cooldown}s cooldown.</dd><dt>WEAKNESS</dt><dd>${s.weakness}</dd></dl><button type="button">Play as ${s.name}</button>`;
      card.querySelector('button')!.addEventListener('click', () => resolve(s), { once: true });
      if (s.reproduction) {
        const title = document.createElement('dt'), detail = document.createElement('dd');
        title.textContent = `R · DIVIDE AT ${Math.round(s.reproduction.threshold * 100)}% BIOMASS`;
        detail.textContent = `${Number((s.growth.maximumMass * s.reproduction.threshold).toFixed(2))} mass per cell. Both daughter cells stay under your control.`;
        card.querySelector('dl')!.append(title, detail);
      }
      root.querySelector('.roster')!.appendChild(card);
    });
  });
}



