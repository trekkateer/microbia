import type { SpeciesDefinition } from '../schemas';
export const didinium = {
  id: 'didinium-nasutum', name: 'Didinium', scientificName: 'Didinium nasutum',
  description: 'A specialist predator. Strike Paramecium to feed.',
  visual: { body: 0xd7a27e, membrane: 0xf4c9a7, nucleus: 0x955c60, shape: 'barrel' },
  growth: { startingMass: 25, maximumMass: 200, startingRadius: 29, startingSpeed: 190, minimumSpeed: 120 },
  diet: [], metabolismId: 'didinium-carnivore',
  reproduction: { threshold: 0.95, offspringAi: 'hunter' },
  passive: { name: 'Specialist hunter', description: 'Feed on contact with Paramecium up to 150% of your mass; resist its trichocysts.' },
  activeId: 'toxicyst-strike', weakness: 'Cannot graze particles or hunt other pond species. Prey-dependent; shrinks when energy runs out.',
  turnRate: 7, prey: ['paramecium-caudatum'], preyMassRatio: 0.5, contactCaptureSeconds: 1.8,
  bodyComposition: { carbohydrate: 0.3, peptides: 0.7, 'fatty-acids': 0.2, phospholipids: 0.3, nucleotides: 0.2 },
  starvation: { massPerSecond: 0.5, minimumMass: 12.5, deathAfterSeconds: 30 }, factId: 'didinium-biology',
} as const satisfies SpeciesDefinition;
