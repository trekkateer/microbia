import type { FoodDefinition } from '../schemas';

export const pondFoods: Readonly<Record<string, FoodDefinition>> = {
  'carbon-flake': {
    id: 'carbon-flake', name: 'Carbohydrate flake', summary: 'Energy + carbon', kind: 'organic-particle',
    composition: { carbohydrate: 8, peptides: 0.6, phospholipids: 0.3, nucleotides: 0.3 },
    digestionSeconds: 1.2, radius: 4, color: 0xe9c889, shape: 'circle',
  },
  'protein-fragment': {
    id: 'protein-fragment', name: 'Protein fragment', summary: 'Nitrogen for growth', kind: 'organic-particle',
    composition: { peptides: 6, carbohydrate: 1, nucleotides: 0.4, 'fatty-acids': 0.5 },
    digestionSeconds: 2.2, radius: 4.5, color: 0xafa8ed, shape: 'diamond',
  },
  'lipid-droplet': {
    id: 'lipid-droplet', name: 'Lipid-rich fragment', summary: 'Membranes + energy', kind: 'organic-particle',
    composition: { 'fatty-acids': 4, phospholipids: 3, carbohydrate: 1, peptides: 0.3 },
    digestionSeconds: 3, radius: 4.5, color: 0xf1a38a, shape: 'capsule',
  },
  detritus: {
    id: 'detritus', name: 'Mixed detritus', summary: 'A balanced mixture', kind: 'organic-particle',
    composition: { carbohydrate: 3, peptides: 2, 'fatty-acids': 1, phospholipids: 1, nucleotides: 1.5 },
    digestionSeconds: 2.8, radius: 5, color: 0xa5d59b, shape: 'cluster',
  },
};
