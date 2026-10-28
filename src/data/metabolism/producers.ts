import { amoebaMetabolism } from './amoeba';
import type { MetabolismDefinition } from '../schemas';
// Reduced game recipes: fixed carbon also supplies lipid synthesis. Trace minerals
// and vitamins are assumed available; they are not modeled as extra pickups.
export const euglenaMetabolism: MetabolismDefinition = {
  ...amoebaMetabolism, id: 'euglena-phototroph', efficiency: 1,
  assimilation: { carbohydrate: { energy: 3, carbon: 1, lipids: 0.3 }, ammonium: { nitrogen: 1 }, phosphate: { phosphorus: 1 } },
  upkeepPerSecond: 0.4, movementCostPerSecond: 0.2, maxGrowthPerSecond: 0.55,
};
export const diatomMetabolism: MetabolismDefinition = {
  ...euglenaMetabolism, id: 'diatom-phototroph',
  reserves: { ...euglenaMetabolism.reserves, silicon: { name: 'silicate', capacity: 12, initial: 0 } },
  assimilation: { carbohydrate: { energy: 3, carbon: 1, lipids: 0.3 }, nitrate: { nitrogen: 1 }, phosphate: { phosphorus: 1 }, silicate: { silicon: 1 } },
  growthCost: { ...euglenaMetabolism.growthCost, silicon: 0.4 },
  upkeepPerSecond: 0.25, movementCostPerSecond: 0.1, maxGrowthPerSecond: 0.4,
};
