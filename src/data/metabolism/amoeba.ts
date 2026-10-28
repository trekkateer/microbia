import type { MetabolismDefinition } from '../schemas';

// A small game model, not a measured A. proteus biochemical recipe.
export const amoebaMetabolism = {
  id: 'amoeba-heterotroph',
  reserves: {
    energy: { name: 'energy', capacity: 80, initial: 35 },
    carbon: { name: 'carbon', capacity: 30, initial: 0 },
    nitrogen: { name: 'nitrogen', capacity: 18, initial: 0 },
    phosphorus: { name: 'phosphorus', capacity: 12, initial: 0 },
    lipids: { name: 'lipids', capacity: 16, initial: 0 },
  },
  assimilation: {
    carbohydrate: { energy: 3, carbon: 1 },
    peptides: { energy: 0.5, carbon: 0.4, nitrogen: 1 },
    'fatty-acids': { energy: 3, carbon: 1, lipids: 1 },
    phospholipids: { energy: 0.5, carbon: 0.5, phosphorus: 0.5, lipids: 1 },
    nucleotides: { carbon: 0.3, nitrogen: 0.3, phosphorus: 1 },
  },
  maintenancePerSecond: { carbon: 0.025, nitrogen: 0.015, phosphorus: 0.006, lipids: 0.008 },
  efficiency: 0.8,
  energyReserveId: 'energy', upkeepPerSecond: 0.25, movementCostPerSecond: 0.2,
  growthCost: { energy: 2, carbon: 1, nitrogen: 0.6, phosphorus: 0.3, lipids: 0.25 },
  maxGrowthPerSecond: 1,
} as const satisfies MetabolismDefinition;
