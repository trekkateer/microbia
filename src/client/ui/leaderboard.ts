import { species } from '../../data';
import type { LeaderboardEntry } from '../../network/protocol';

export function createLeaderboard(viewport: HTMLElement) {
  const sidebar = document.createElement('aside'); sidebar.className = 'arena-sidebar overlay';
  sidebar.setAttribute('aria-label', 'Room standings and food guide');
  const panel = document.createElement('section'); panel.className = 'leaderboard';
  panel.setAttribute('aria-label', 'Top ten players by biomass');
  const heading = document.createElement('h2'); heading.textContent = 'Top 10';
  const caption = document.createElement('p'); caption.textContent = 'BIOMASS · THIS ROOM';
  const list = document.createElement('ol');
  const legend = document.createElement('div'); legend.className = 'leaderboard-legend';
  for (const definition of Object.values(species)) {
    const label = document.createElement('span'); label.textContent = definition.name;
    label.style.color = '#' + definition.visual.membrane.toString(16).padStart(6, '0');
    legend.append(label);
  }
  panel.append(heading, caption, list, legend); sidebar.append(panel);
  const food = viewport.querySelector('.food-guide'); if (food) sidebar.append(food);
  viewport.append(sidebar);
  let previous = '';
  return {
    update(entries: readonly LeaderboardEntry[], playerId: string) {
      const top = entries.slice(0, 10);
      const signature = JSON.stringify([playerId, top.map(p => [p.id, p.name, p.speciesId, p.mass.toFixed(1)])]);
      if (signature === previous) return;
      previous = signature;
      const rows = top.map((entry, index) => {
        const definition = entry.speciesId ? species[entry.speciesId] : undefined;
        const own = entry.id === playerId;
        const name = entry.name || `Player ${entry.id.slice(0, 6)}`;
        const row = document.createElement('li'); row.dataset.self = String(own);
        const rank = document.createElement('span'); rank.className = 'leaderboard-rank'; rank.textContent = String(index + 1);
        const label = document.createElement('span'); label.className = 'leaderboard-name';
        label.textContent = name + (own ? ' (you)' : '');
        label.style.color = '#' + (definition?.visual.membrane ?? 0xdbe6d4).toString(16).padStart(6, '0');
        label.title = definition?.scientificName ?? 'Unknown species';
        const mass = document.createElement('span'); mass.className = 'leaderboard-mass'; mass.textContent = entry.mass.toFixed(1);
        row.setAttribute('aria-label', `${index + 1}. ${name}${own ? ', you' : ''}, ${definition?.name ?? 'unknown species'}, ${mass.textContent} biomass`);
        row.append(rank, label, mass); return row;
      });
      list.replaceChildren(...rows);
    },
  };
}
