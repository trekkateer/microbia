import type { SpeciesDefinition } from '../../data/schemas';
import { abilities } from '../../data/abilities/pond';

export function createSpeciesCard(species: SpeciesDefinition, reference = false): HTMLElement {
  const card = document.createElement('article'); card.className = 'roster-card';
  card.style.setProperty('--species-color', `#${species.visual.membrane.toString(16).padStart(6, '0')}`);
  card.innerHTML = `<div class="roster-art ${species.visual.shape}" aria-hidden="true"><span></span></div><h2>${species.name}</h2><i class="scientific-name">${species.scientificName}</i><p>${species.description}</p>`;
  if (reference) {
    card.id = species.id; card.setAttribute('aria-labelledby', `${species.id}-title`);
    card.querySelector('h2')!.id = `${species.id}-title`;
    const ability = abilities[species.activeId!];
    const details = document.createElement('dl');
    const entry = (label: string, description: string) => {
      const term = document.createElement('dt'); term.textContent = label;
      const definition = document.createElement('dd'); definition.textContent = description;
      details.append(term, definition);
    };
    entry(`PASSIVE · ${species.passive.name}`, species.passive.description);
    entry(`SPACE · ${ability.name}`, `${ability.description} ${ability.cooldown}s cooldown.`);
    entry('WEAKNESS', species.weakness);
    if (species.reproduction) entry(`R · DIVIDE AT ${Math.round(species.reproduction.threshold * 100)}% BIOMASS`, `${Number((species.growth.maximumMass * species.reproduction.threshold).toFixed(2))} mass per cell. Both daughter cells stay under your control.`);
    card.append(details);
  } else {
    const play = document.createElement('button'); play.type = 'submit'; play.dataset.species = species.id;
    play.textContent = `Play as ${species.name}`; card.append(play);
  }
  return card;
}
