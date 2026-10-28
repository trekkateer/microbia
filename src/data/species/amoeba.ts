import type { SpeciesDefinition } from '../schemas';

export const amoeba = {
  id: 'amoeba-proteus',
  name: 'Amoeba',
  scientificName: 'Amoeba proteus',
  description: 'Move, engulf, grow. Life at its smallest.',
  visual: { body: 0x91bb8c, membrane: 0xc5e6b1, nucleus: 0x406c63, shape: 'amoeboid' },
  growth: { startingMass: 25, maximumMass: 225, startingRadius: 34, startingSpeed: 135, minimumSpeed: 82 },
  diet: ['carbon-flake', 'protein-fragment', 'lipid-droplet', 'detritus'],
  metabolismId: 'amoeba-heterotroph',
  reproduction: { threshold: 0.95, offspringAi: 'opportunist' },
  passive: { name: 'Phagocytosis', description: 'Engulf prey with less than 70% of your mass, including other Amoebae. Your own cells are protected.' },
  activeId: 'pseudopod-engulf',
  weakness: 'Slowest swimmer. Prey can escape your reach during capture.',
  turnRate: 5, prey: ['amoeba-proteus', 'paramecium-caudatum', 'didinium-nasutum', 'euglena-gracilis', 'navicula-radiosa'], preyMassRatio: 0.7, preyMassRatioExclusive: true, contactCaptureSeconds: 0,
  bodyComposition: { carbohydrate: 0.3, peptides: 0.6, 'fatty-acids': 0.2, phospholipids: 0.3, nucleotides: 0.2 },
  starvation: { massPerSecond: 0, minimumMass: 6.25 }, factId: 'amoeba-biology',
} as const satisfies SpeciesDefinition;
