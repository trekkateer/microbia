import type { ArenaDefinition } from '../schemas';

export const pond = {
  id: 'pond-water',
  name: 'Pond Water',
  subtitle: 'A world in a drop of water',
  roster: ['amoeba-proteus', 'paramecium-caudatum', 'didinium-nasutum', 'euglena-gracilis', 'navicula-radiosa'],
  aiSpawns: [
    { speciesId: 'amoeba-proteus', profileId: 'opportunist', count: 3, minMass: 25, maxMass: 55 },
    { speciesId: 'paramecium-caudatum', profileId: 'forager', count: 6, minMass: 18, maxMass: 38 },
    { speciesId: 'didinium-nasutum', profileId: 'hunter', count: 3, minMass: 22, maxMass: 32 },
    { speciesId: 'euglena-gracilis', profileId: 'drifter', count: 5, minMass: 14, maxMass: 25 },
    { speciesId: 'navicula-radiosa', profileId: 'drifter', count: 5, minMass: 12, maxMass: 24 },
  ],
  lifecycle: { playerRespawnSeconds: 3, aiRespawnSeconds: 7, protectionSeconds: 3, spawnClearance: 160 },
  map: { width: 4800, height: 3600 },
  spawn: { x: 2400, y: 1800 },
  maxPlayers: 20,
  npcTypes: [],
  ambientLight: 0.3,
  zones: [
    { id: 'sun-center', name: 'Sunlit clearing', effectId: 'light', x: 1600, y: 1200, radius: 350, light: 1 },
    { id: 'sun-west', name: 'Sunlit shallows', effectId: 'light', x: 650, y: 650, radius: 380, light: 1 },
    { id: 'sun-east', name: 'Sunlit shallows', effectId: 'light', x: 2600, y: 1700, radius: 420, light: 1 },
    { id: 'shade-north', name: 'Under the lily', effectId: 'light', x: 2050, y: 650, radius: 300, light: 0 },
    { id: 'shade-south', name: 'Deep shade', effectId: 'light', x: 1000, y: 1800, radius: 320, light: 0 },
    { id: 'cold-west', name: 'Cold current', effectId: 'current', x: 950, y: 1100, radius: 240, velocity: { x: 45, y: -25 }, speedMultiplier: 0.65 },
    { id: 'cold-east', name: 'Cold current', effectId: 'current', x: 2250, y: 1350, radius: 260, velocity: { x: -20, y: 50 }, speedMultiplier: 0.65 },
  ].map(zone => ({ ...zone, x: zone.x * 1.5, y: zone.y * 1.5, radius: zone.radius * 1.5 })) as ArenaDefinition['zones'],
  dissolvedPatches: [
    { id: 'pool-center', name: 'Dissolved nutrients', x: 1600, y: 1200, radius: 270 },
    { id: 'pool-west', name: 'Dissolved nutrients', x: 650, y: 650, radius: 300 },
    { id: 'pool-east', name: 'Dissolved nutrients', x: 2600, y: 1700, radius: 340 },
    { id: 'pool-shade', name: 'Dissolved nutrients', x: 1000, y: 1800, radius: 250 },
  ].map(patch => ({ ...patch, x: patch.x * 1.5, y: patch.y * 1.5, radius: patch.radius * 1.5, resources: {
    'carbon-dioxide': { capacity: 100, renewal: 4 }, ammonium: { capacity: 50, renewal: 1.5 },
    nitrate: { capacity: 50, renewal: 1.5 }, phosphate: { capacity: 40, renewal: 1 }, silicate: { capacity: 50, renewal: 1 },
  } })),
  hazards: [],
  foodSpawns: [
    { foodId: 'carbon-flake', count: 250, starterCount: 12, respawnSeconds: 9 },
    { foodId: 'protein-fragment', count: 240, starterCount: 12, respawnSeconds: 11 },
    { foodId: 'lipid-droplet', count: 220, starterCount: 12, respawnSeconds: 13 },
    { foodId: 'detritus', count: 240, starterCount: 12, respawnSeconds: 12 },
  ],
  foodPlacement: { starterRadius: 300 },
  theme: { background: 0x091e23, water: 0x113b3a, detail: 0x6e9d8e, nutrient: 0xe9c889, music: null },
} as const satisfies ArenaDefinition;
