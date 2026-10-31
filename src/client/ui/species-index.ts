import type { ArenaDefinition, SpeciesDefinition } from '../../data/schemas';
import { createSpeciesCard } from './species-card';

export function renderSpeciesIndex(root: HTMLElement, arena: ArenaDefinition, roster: Readonly<Record<string, SpeciesDefinition>>) {
  root.innerHTML = `<header class="site-header"><a class="brand" href="/"><span class="brand-cell" aria-hidden="true"></span>microbia</a><nav class="selection-nav" aria-label="Main navigation"><a href="/">Play</a><a href="/species" aria-current="page">Species index</a></nav></header><main class="selection species-reference"><div class="index-heading"><div class="eyebrow">FIELD NOTES / FRESHWATER</div><h1>Species index</h1><p class="selection-intro">Five organisms. Five ways to survive. Explore their biology, abilities, and weaknesses before entering the pond.</p></div><nav class="species-jump-links" aria-label="Browse species"></nav><div class="roster roster-full"></div><p class="index-play-link">Ready to explore? <a href="/">Choose an organism and play</a></p></main>`;
  const navigation = root.querySelector('.species-jump-links')!;
  const cards = root.querySelector('.roster')!;
  for (const id of arena.roster) {
    const species = roster[id];
    const link = document.createElement('a'); link.href = '#' + species.id; link.textContent = species.name;
    navigation.append(link); cards.append(createSpeciesCard(species, true));
  }
}
