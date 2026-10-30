import type { NutritionDefinitions, SpeciesDefinition } from '../data/schemas';
import { membraneSweep, touchesMembraneSweep, type MembranePose } from '../sim/membrane';
import { SpatialGrid } from '../sim/spatial-grid';
import type { FoodParticle, WorldSnapshot } from '../sim/types';

// Hide food at visible membrane contact while waiting for the authoritative
// pickup. Never award nutrients, biomass or meals on the client.
export class FoodPrediction {
  private source?: WorldSnapshot;
  private grid = new SpatialGrid<FoodParticle>([]);
  private poses = new Map<string, MembranePose>();
  private contacts = new Map<number, { signature: string; age: number }>();
  private life = '';
  constructor(private roster: Readonly<Record<string, SpeciesDefinition>>, private nutrition: NutritionDefinitions) {}

  reset() { this.source = undefined; this.poses.clear(); this.contacts.clear(); this.life = ''; }

  update(authority: WorldSnapshot, visual: WorldSnapshot, owner: string, delta: number, stateAge: number): ReadonlySet<number> {
    const cells = [visual.player, ...visual.organisms].filter(p => p.ownerId === owner && p.alive);
    const life = cells.map(p => `${p.id}:${p.generation}:${p.divisionCount}`).join('|');
    if (life !== this.life) { this.reset(); this.life = life; }
    const signature = (food: FoodParticle) => `${food.x}:${food.y}:${food.availableAtTick}`;
    if (this.source !== authority) {
      this.source = authority;
      this.grid = new SpatialGrid(authority.foodParticles.filter(p => p.availableAtTick <= authority.tick));
      const foods = new Map(authority.foodParticles.map(p => [p.id, p]));
      for (const [id, contact] of this.contacts) {
        const food = foods.get(id);
        if (!food || signature(food) !== contact.signature || food.availableAtTick > authority.tick) this.contacts.delete(id);
      }
    }
    for (const contact of this.contacts.values()) contact.age += Math.max(0, delta);
    const maxFood = Math.max(0, ...Object.values(this.nutrition.foods).map(p => p.radius * 1.2));
    for (const cell of cells) {
      const definition = this.roster[cell.speciesId];
      const pose: MembranePose = { x: cell.x, y: cell.y, radius: cell.radius, heading: cell.heading, stretch: cell.stretch, shape: definition.visual.shape, time: visual.tick / 30 };
      const before = this.poses.get(cell.id) ?? pose;
      this.poses.set(cell.id, pose);
      if (stateAge > 0.5 || !definition.diet.length) continue;
      const reach = Math.max(before.radius, pose.radius) * 1.4 + maxFood + 1;
      let sweep: ReturnType<typeof membraneSweep> | undefined;
      for (const food of this.grid.query(Math.min(before.x, pose.x) - reach, Math.min(before.y, pose.y) - reach, Math.max(before.x, pose.x) + reach, Math.max(before.y, pose.y) + reach)) {
        if (this.contacts.has(food.id) || !definition.diet.includes(food.foodId)) continue;
        const nutrient = this.nutrition.foods[food.foodId];
        sweep ??= membraneSweep(before, pose);
        const radius = nutrient.radius * (nutrient.shape === 'capsule' || nutrient.shape === 'diamond' ? 1.2 : 1);
        if (touchesMembraneSweep(food, radius, sweep)) this.contacts.set(food.id, { signature: signature(food), age: 0 });
      }
    }
    // Retain expired records until the food changes so rejected contacts cannot
    // repeatedly hide the same particle. A stale connection restores all food.
    return new Set([...this.contacts].filter(([, contact]) => contact.age < 0.5 && stateAge <= 0.5).map(([id]) => id));
  }
}
