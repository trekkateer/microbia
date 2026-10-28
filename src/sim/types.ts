import type { AbilityDefinition, ArenaDefinition, NutritionDefinitions, SpeciesDefinition } from '../data/schemas';

export interface Vec2 { x: number; y: number }
export interface OrganismNutritionState {
  // Current stock, including material still digesting; decreases when metabolized.
  nutrients: Record<string, number>;
  reserves: Record<string, number>;
  digestion: DigestionState[];
}
export interface PlayerState extends Vec2, OrganismNutritionState {
  id: string;
  speciesId: string;
  ownerId?: string;
  mass: number;
  spawnMass: number;
  radius: number;
  speed: number;
  velocity: Vec2;
  eaten: number;
  heading: number;
  stretch: number;
  growthRate: number;
  lastFoodId: string | null;
  lastAbsorbedTick: number;
  alive: boolean;
  cooldownUntil: number;
  stunnedUntil: number;
  ability: { effect: AbilityDefinition['effect']; startedAtTick: number; until: number; targetId: string | null; direction: Vec2 } | null;
  abilityMessage: string;
  pendingMotion: Vec2;
  motionPath: Vec2[];
  kind: 'player' | 'ai' | 'npc' | 'fixture';
  generation: number;
  parentId: string | null;
  colonyId: string;
  divisionCount: number;
  reproductionMessage: string;
  respawnAtTick: number;
  protectedUntil: number;
  hungryTicks: number;
  satiety: number;
  deathReason: string;
  ai: { profileId: string; mode: 'wander' | 'flee' | 'hunt' | 'forage'; direction: Vec2; decisionAt: number; wanderAt: number; wanderAngle: number; targetId: string | null } | null;
}
export interface DigestionState {
  foodId: string;
  completesAtTick: number;
  composition: Record<string, number>;
}
export interface FoodParticle extends Vec2 {
  id: number;
  foodId: string;
  availableAtTick: number;
}
export interface World {
  tick: number;
  randomState: number;
  nextOrganismId: number;
  arena: ArenaDefinition;
  species: SpeciesDefinition;
  nutrition: NutritionDefinitions;
  player: PlayerState;
  foodParticles: FoodParticle[];
  organisms: PlayerState[];
  roster: Readonly<Record<string, SpeciesDefinition>>;
  contacts: Set<string>;
  dissolvedPatches: { id: string; resources: Record<string, number> }[];
}
export interface WorldSnapshot {
  dissolvedPatches: { id: string; resources: Record<string, number> }[];
  tick: number;
  player: PlayerState;
  foodParticles: FoodParticle[];
  organisms: PlayerState[];
}
