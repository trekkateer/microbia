import { organicNutrients } from './nutrients/organic';
import { pondFoods } from './foods/pond';
import { amoebaMetabolism } from './metabolism/amoeba';
import { parameciumMetabolism, didiniumMetabolism } from './metabolism/ciliates';
import { euglenaMetabolism, diatomMetabolism } from './metabolism/producers';
import { dissolvedNutrients } from './nutrients/dissolved';
import type { NutritionDefinitions } from './schemas';

export const nutrition: NutritionDefinitions = {
  nutrients: { ...organicNutrients, ...dissolvedNutrients }, foods: pondFoods,
  metabolism: Object.fromEntries([amoebaMetabolism, parameciumMetabolism, didiniumMetabolism, euglenaMetabolism, diatomMetabolism].map(profile => [profile.id, profile])),
};
