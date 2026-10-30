import type { FoodParticle, PlayerState, WorldSnapshot } from '../sim/types';
import { createOrganism } from '../sim/world';
import { species } from '../data';
import { nutrition } from '../data/nutrition';

export function packActor(p: PlayerState) { return [p.id, p.speciesId, p.ownerId, p.kind, p.colonyId, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.radius * 100) / 100, Math.round(p.mass * 100) / 100, Math.round(p.heading * 10000) / 10000, Math.round(p.stretch * 10000) / 10000, p.velocity, Math.round(p.speed * 100) / 100, p.alive, p.generation, p.divisionCount, p.ability, p.protectedUntil, p.stunnedUntil, p.lastAbsorbedTick, p.lastFoodId, p.eaten, Math.round(p.satiety * 1000) / 1000, p.parentId] as const; }
function unpackActor(p: ReturnType<typeof packActor>) { return { id: p[0], speciesId: p[1], ownerId: p[2], kind: p[3], colonyId: p[4], x: p[5], y: p[6], radius: p[7], mass: p[8], heading: p[9], stretch: p[10], velocity: p[11], speed: p[12], alive: p[13], generation: p[14], divisionCount: p[15], ability: p[16], protectedUntil: p[17], stunnedUntil: p[18], lastAbsorbedTick: p[19], lastFoodId: p[20], eaten: p[21], satiety: p[22], parentId: p[23] ?? null }; }
export interface LeaderboardEntry { id: string; name?: string; speciesId?: string; mass: number; bot?: boolean }
export interface PondPacket {
  tick: number;
  actors: ReturnType<typeof packActor>[];
  own: PlayerState[];
  food: FoodParticle[];
  resetFood: boolean;
  dissolvedPatches: WorldSnapshot['dissolvedPatches'];
  players: number;
  leaderboard: LeaderboardEntry[];
}

// Reconstruct full presentation snapshots; private state is sent only for owned cells.
// Previous snapshots never share mutable patched food records.
export class PondDecoder {
  private food: FoodParticle[] = [];
  private templates = new Map<string, PlayerState>();
  private previous = new Map<string, Pick<PlayerState, 'x' | 'y' | 'generation' | 'divisionCount' | 'alive'>>();
  decode(packet: PondPacket): WorldSnapshot {
    if (packet.resetFood) this.food = packet.food;
    else {
      const changes = new Map(packet.food.map(p => [p.id, p]));
      if (changes.size) this.food = this.food.map(p => changes.get(p.id) ?? p);
    }
    const owned = new Map(packet.own.map(p => [p.id, p]));
    const actors = packet.actors.map(packed => {
      const p = unpackActor(packed);
      const own = owned.get(p.id); if (own) return own;
      let template = this.templates.get(p.speciesId);
      if (!template) { template = createOrganism(species[p.speciesId], nutrition, '', 0, 0); this.templates.set(p.speciesId, template); }
      return { ...template, ...p };
    });
    const prior = this.previous;
    this.previous = new Map();
    const interpolated = actors.map(p => {
      const old = prior.get(p.id);
      this.previous.set(p.id, { x: p.x, y: p.y, generation: p.generation, divisionCount: p.divisionCount, alive: p.alive });
      const continuous = old && old.generation === p.generation && old.divisionCount === p.divisionCount && old.alive === p.alive;
      return { ...p, motionPath: continuous ? [{ x: old.x, y: old.y }, { x: p.x, y: p.y }] : [{ x: p.x, y: p.y }] };
    });
    const ownIds = new Set(packet.own.map(p => p.id));
    const player = interpolated.find(p => ownIds.has(p.id) && p.alive) ?? interpolated.find(p => ownIds.has(p.id));
    if (!player) throw new Error('Missing owned player');
    return { tick: packet.tick, player, organisms: interpolated.filter(p => p.id !== player.id), foodParticles: this.food, dissolvedPatches: packet.dissolvedPatches };
  }
}

