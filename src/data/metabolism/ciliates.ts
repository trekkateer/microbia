import { amoebaMetabolism } from './amoeba';
import type { MetabolismDefinition } from '../schemas';
export const parameciumMetabolism: MetabolismDefinition = {
  ...amoebaMetabolism, id: 'paramecium-heterotroph',
  reserves: { ...amoebaMetabolism.reserves, nitrogen: { name: 'nitrogen', capacity: 18, initial: 1 } },
  upkeepPerSecond: 0.35, movementCostPerSecond: 0.3,
};
export const didiniumMetabolism: MetabolismDefinition = {
  ...amoebaMetabolism, id: 'didinium-carnivore', upkeepPerSecond: 0.65, movementCostPerSecond: 0.3,
  maxGrowthPerSecond: 1.4,
};
