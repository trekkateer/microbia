import type { SpeciesDefinition } from '../schemas';
export const paramecium = {
  id: 'paramecium-caudatum', name: 'Paramecium', scientificName: 'Paramecium caudatum',
  description: 'Sweep up particles. Turn quickly. Reverse out of danger.',
  visual: { body: 0x91c6d5, membrane: 0xc1e9f0, nucleus: 0x456eaa, shape: 'slipper' },
  growth: { startingMass: 25, maximumMass: 200, startingRadius: 30, startingSpeed: 205, minimumSpeed: 130 },
  diet: ['carbon-flake', 'protein-fragment', 'lipid-droplet', 'detritus'], metabolismId: 'paramecium-heterotroph',
  passive: { name: 'Cilia', description: 'Fast particle feeding with the tightest turns in the pond.' },
  activeId: 'avoidance-reaction', weakness: 'Didinium resists your defensive discharge and specializes in hunting you.',
  turnRate: 18, prey: [], preyMassRatio: 0, contactCaptureSeconds: 0,
  reproduction: { threshold: 0.3, offspringAi: 'forager' },
  bodyComposition: { carbohydrate: 0.4, peptides: 0.7, 'fatty-acids': 0.25, phospholipids: 0.3, nucleotides: 0.25 },
  starvation: { massPerSecond: 0, minimumMass: 6.25 }, factId: 'paramecium-biology',
} as const satisfies SpeciesDefinition;
