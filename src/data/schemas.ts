export interface SpeciesDefinition {
  readonly id: string;
  readonly name: string;
  readonly scientificName: string;
  readonly description: string;
  readonly visual: { readonly body: number; readonly membrane: number; readonly nucleus: number; readonly shape: 'amoeboid' | 'slipper' | 'barrel' | 'flagellate' | 'diatom' };
  readonly growth: {
    readonly startingMass: number;
    readonly maximumMass: number;
    readonly startingRadius: number;
    readonly startingSpeed: number;
    readonly minimumSpeed: number;
  };
  readonly diet: readonly string[];
  readonly metabolismId: string;
  readonly reproduction?: { readonly threshold: number; readonly offspringAi: string };
  readonly dissolvedUptake?: Readonly<Record<string, { readonly rate: number; readonly capacity: number }>>;
  readonly photosynthesis?: { readonly input: string; readonly output: string; readonly rate: number; readonly capacity: number; readonly darkMassLoss: number };
  readonly defense?: { readonly preyRatio: number; readonly captureDuration: number; readonly stun: number; readonly push: number };
  readonly passive: { readonly name: string; readonly description: string };
  readonly activeId: string | null;
  readonly npc?: boolean;
  readonly weakness: string;
  readonly turnRate: number;
  readonly prey: readonly string[];
  readonly preyMassRatio: number;
  readonly preyMassRatioExclusive?: boolean;
  readonly contactCaptureSeconds: number;
  readonly bodyComposition: ResourceAmounts;
  readonly starvation: { readonly massPerSecond: number; readonly minimumMass: number; readonly deathAfterSeconds?: number };
  readonly factId: string;
}

export interface AbilityDefinition {
  readonly visual?: 'pseudopods' | 'trichocysts' | 'toxicysts' | 'eyespot' | 'raphe';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly effect: 'capture' | 'reverse' | 'strike' | 'phototaxis' | 'glide';
  readonly cooldown: number;
  readonly costs: ResourceAmounts;
  readonly duration: number;
  readonly range: number;
  readonly activationGap?: number;
  readonly speed: number;
  readonly stun: number;
  readonly push: number;
  readonly digestionSeconds: number;
  readonly transferFraction: number;
}
export interface CounterDefinition { readonly attacker: string; readonly target: string; readonly preyRatioMultiplier: number; readonly pushMultiplier: number }
export interface FactDefinition { readonly id: string; readonly title: string; readonly biology: string; readonly gameNote: string; readonly sources: readonly string[] }
export interface AiDefinition {
  readonly id: string;
  readonly vision: number;
  readonly fleeDistance: number;
  readonly decisionSeconds: number;
  readonly wanderSeconds: number;
  readonly cruise: number;
  readonly hunt: boolean;
  readonly forage: boolean;
}

export interface ArenaDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly roster: readonly string[];
  readonly map: { readonly width: number; readonly height: number };
  readonly spawn: { readonly x: number; readonly y: number };
  readonly maxPlayers: number;
  readonly practiceTargets?: readonly { readonly speciesId: string; readonly mass: number; readonly dx: number; readonly dy: number }[];
  readonly npcTypes: readonly string[];
  readonly aiSpawns?: readonly { readonly speciesId: string; readonly profileId: string; readonly count: number; readonly minMass: number; readonly maxMass: number }[];
  readonly lifecycle?: { readonly playerRespawnSeconds: number; readonly aiRespawnSeconds: number; readonly protectionSeconds: number; readonly spawnClearance: number };
  readonly ambientLight?: number;
  readonly zones: readonly ZoneDefinition[];
  readonly dissolvedPatches?: readonly DissolvedPatchDefinition[];
  readonly hazards: readonly { id: string; effectId: string; intervalSeconds: number }[];
  readonly foodSpawns: readonly {
    readonly foodId: string;
    readonly count: number;
    readonly respawnSeconds: number;
    readonly starterCount: number;
  }[];
  readonly foodPlacement: {
    readonly starterRadius: number;
  };
  readonly theme: {
    readonly background: number;
    readonly water: number;
    readonly detail: number;
    readonly nutrient: number;
    readonly music: string | null;
  };
}

export type ZoneDefinition = { readonly id: string; readonly name: string; readonly x: number; readonly y: number; readonly radius: number } & (
  { readonly effectId: 'light'; readonly light: number } |
  { readonly effectId: 'current'; readonly velocity: { readonly x: number; readonly y: number }; readonly speedMultiplier: number }
);
export interface DissolvedPatchDefinition {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly resources: Readonly<Record<string, { readonly capacity: number; readonly renewal: number }>>;
}

// Normalized game units, not laboratory concentrations.
export type ResourceAmounts = Readonly<Record<string, number>>;
export interface NutrientDefinition {
  readonly id: string;
  readonly name: string;
  readonly form: 'digestion-product' | 'dissolved';
  readonly roles: readonly string[];
  readonly uses: readonly ('biomass' | 'energy' | 'reproduction')[];
  readonly sources: readonly string[];
}
export interface FoodDefinition {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly kind: 'organic-particle';
  readonly composition: ResourceAmounts;
  readonly digestionSeconds: number;
  readonly radius: number;
  readonly color: number;
  readonly shape: 'circle' | 'diamond' | 'capsule' | 'cluster';
}
export interface MetabolismDefinition {
  readonly id: string;
  readonly reserves: Readonly<Record<string, { readonly name: string; readonly capacity: number; readonly initial: number }>>;
  readonly assimilation: Readonly<Record<string, ResourceAmounts>>;
  readonly efficiency: number;
  readonly energyReserveId: string;
  readonly upkeepPerSecond: number;
  readonly movementCostPerSecond: number;
  readonly maintenancePerSecond?: ResourceAmounts;
  readonly growthCost: ResourceAmounts;
  readonly maxGrowthPerSecond: number;
}
export interface NutritionDefinitions {
  readonly nutrients: Readonly<Record<string, NutrientDefinition>>;
  readonly foods: Readonly<Record<string, FoodDefinition>>;
  readonly metabolism: Readonly<Record<string, MetabolismDefinition>>;
}
