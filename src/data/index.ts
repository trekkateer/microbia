import { pond } from './arenas/pond';
import { amoeba } from './species/amoeba';
import { paramecium } from './species/paramecium';
import { didinium } from './species/didinium';
import { euglena } from './species/euglena';
import { diatom } from './species/diatom';
import type { ArenaDefinition, SpeciesDefinition } from './schemas';

export const species: Readonly<Record<string, SpeciesDefinition>> = Object.fromEntries([amoeba, paramecium, didinium, euglena, diatom].map(s => [s.id, s]));
export const organisms: Readonly<Record<string, SpeciesDefinition>> = { ...species };
export const arenas: Readonly<Record<string, ArenaDefinition>> = { [pond.id]: pond };
export { validateDefinitions } from './validate';
