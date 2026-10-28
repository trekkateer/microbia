import { pond as livingPond } from '../src/data/arenas/pond';
import type { ArenaDefinition } from '../src/data/schemas';

// Controlled scenes for focused regression tests; the shipped pond uses live AI.
export const pond: ArenaDefinition = {
  ...livingPond, aiSpawns: [], lifecycle: undefined, npcTypes: [], zones: [], dissolvedPatches: [],
  map: { width: 3200, height: 2400 }, spawn: { x: 1600, y: 1200 },
  practiceTargets: [
    { speciesId: 'paramecium-caudatum', mass: 18, dx: 150, dy: 0 },
    { speciesId: 'didinium-nasutum', mass: 14, dx: 0, dy: 180 },
    { speciesId: 'amoeba-proteus', mass: 20, dx: -190, dy: 0 },
    { speciesId: 'paramecium-caudatum', mass: 32, dx: 180, dy: -160 },
    { speciesId: 'paramecium-caudatum', mass: 18, dx: 350, dy: 140 },
  ],
};
