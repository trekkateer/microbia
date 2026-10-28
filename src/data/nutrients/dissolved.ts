import type { NutrientDefinition } from '../schemas';
const euglena = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5896972/';
const nitrogen = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6448558/';
const diatom = 'https://www.ccap.ac.uk/catalogue/strain-1050-12';
const medium = 'https://www.atcc.org/~/media/4368612a40a648c2ab230cb4c642202e.ashx';
export const dissolvedNutrients: Readonly<Record<string, NutrientDefinition>> = Object.fromEntries([
  { id: 'carbon-dioxide', name: 'Dissolved CO₂', roles: ['photosynthetic carbon fixation'], uses: ['biomass', 'energy'], sources: [euglena, diatom] },
  { id: 'ammonium', name: 'Ammonium', roles: ['nitrogen for cellular synthesis'], uses: ['biomass', 'reproduction'], sources: [nitrogen] },
  { id: 'nitrate', name: 'Nitrate', roles: ['nitrogen for cellular synthesis'], uses: ['biomass', 'reproduction'], sources: [diatom, medium] },
  { id: 'phosphate', name: 'Phosphate', roles: ['phosphorus for cellular synthesis'], uses: ['biomass', 'reproduction'], sources: [euglena, diatom, medium] },
  { id: 'silicate', name: 'Dissolved silicate', roles: ['silica frustule construction'], uses: ['biomass', 'reproduction'], sources: [diatom, medium] },
].map(n => [n.id, { ...n, form: 'dissolved' } as NutrientDefinition]));
