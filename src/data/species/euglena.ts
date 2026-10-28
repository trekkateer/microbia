import type { SpeciesDefinition } from '../schemas';
export const euglena = {
  id: 'euglena-gracilis', name: 'Euglena', scientificName: 'Euglena gracilis',
  description: 'Follow the light and turn dissolved nutrients into new biomass.',
  visual: { body: 0x7bb64f, membrane: 0xc4df86, nucleus: 0x466d35, shape: 'flagellate' },
  growth: { startingMass: 18, maximumMass: 160, startingRadius: 25, startingSpeed: 145, minimumSpeed: 90 },
  diet: [], metabolismId: 'euglena-phototroph', passive: { name: 'Photosynthesis', description: 'Light and dissolved CO₂ supply energy and carbon. Ammonium and phosphate support growth.' },
  dissolvedUptake: { 'carbon-dioxide': { rate: 1.8, capacity: 18 }, ammonium: { rate: 0.5, capacity: 8 }, phosphate: { rate: 0.3, capacity: 6 } },
  photosynthesis: { input: 'carbon-dioxide', output: 'carbohydrate', rate: 1.6, capacity: 20, darkMassLoss: 0.35 },
  reproduction: { threshold: 0.3, offspringAi: 'drifter' },
  activeId: 'phototaxis', weakness: 'Vulnerable to predators; slowly loses mass in darkness.', turnRate: 8, prey: [], preyMassRatio: 0, contactCaptureSeconds: 0,
  bodyComposition: { carbohydrate: 0.7, peptides: 0.4, 'fatty-acids': 0.2, phospholipids: 0.2, nucleotides: 0.15 },
  starvation: { massPerSecond: 0, minimumMass: 4.5 }, factId: 'euglena-biology',
} as const satisfies SpeciesDefinition;
