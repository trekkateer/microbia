import type { SpeciesDefinition } from '../schemas';
export const diatom = {
  id: 'navicula-radiosa', name: 'Diatom', scientificName: 'Navicula radiosa',
  description: 'A sheltered producer that builds a silica shell and glides along the substrate.',
  visual: { body: 0xd3b453, membrane: 0xf0e0a8, nucleus: 0x8b7735, shape: 'diatom' },
  growth: { startingMass: 16, maximumMass: 160, startingRadius: 27, startingSpeed: 35, minimumSpeed: 20 },
  diet: [], metabolismId: 'diatom-phototroph', passive: { name: 'Silica frustule', description: 'Harder to engulf and slower to capture. Growth needs light, CO₂, nitrate, phosphate and silicate.' },
  dissolvedUptake: { 'carbon-dioxide': { rate: 1.4, capacity: 18 }, nitrate: { rate: 0.4, capacity: 8 }, phosphate: { rate: 0.25, capacity: 6 }, silicate: { rate: 0.35, capacity: 8 } },
  photosynthesis: { input: 'carbon-dioxide', output: 'carbohydrate', rate: 1.2, capacity: 20, darkMassLoss: 0 },
  defense: { preyRatio: 0.65, captureDuration: 2.5, stun: 0.5, push: 0.5 },
  reproduction: { threshold: 0.3, offspringAi: 'drifter' },
  activeId: 'substrate-glide', weakness: 'Very slow; cannot chase prey. Needs silicate to grow.', turnRate: 3, prey: [], preyMassRatio: 0, contactCaptureSeconds: 0,
  bodyComposition: { carbohydrate: 0.5, peptides: 0.3, 'fatty-acids': 0.3, phospholipids: 0.2, nucleotides: 0.15 },
  starvation: { massPerSecond: 0, minimumMass: 4 }, factId: 'diatom-biology',
} as const satisfies SpeciesDefinition;
