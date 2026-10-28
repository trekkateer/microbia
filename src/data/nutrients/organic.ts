import type { NutrientDefinition } from '../schemas';

const sources = ['https://www.ncbi.nlm.nih.gov/books/NBK9831/'];
// Organic material delivered through digestion, not free molecules eaten from water.
// This source supports phagocytosis/digestion; numerical yields are game abstractions.
export const organicNutrients: Readonly<Record<string, NutrientDefinition>> = {
  carbohydrate: { id: 'carbohydrate', name: 'Carbohydrates', form: 'digestion-product', roles: ['energy', 'carbon'], uses: ['energy', 'biomass'], sources },
  peptides: { id: 'peptides', name: 'Peptides', form: 'digestion-product', roles: ['nitrogen', 'carbon'], uses: ['biomass', 'energy', 'reproduction'], sources },
  'fatty-acids': { id: 'fatty-acids', name: 'Fatty acids', form: 'digestion-product', roles: ['lipids', 'energy'], uses: ['energy', 'biomass'], sources },
  phospholipids: { id: 'phospholipids', name: 'Phospholipids', form: 'digestion-product', roles: ['lipids', 'phosphorus'], uses: ['biomass', 'energy', 'reproduction'], sources },
  nucleotides: { id: 'nucleotides', name: 'Nucleotides', form: 'digestion-product', roles: ['phosphorus', 'nitrogen'], uses: ['biomass', 'reproduction'], sources },
};

