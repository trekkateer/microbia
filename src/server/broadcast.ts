import { packActor } from '../network/protocol';
import type { FoodParticle } from '../sim/types';
import type { Room } from './room';

// One shared actor/food encoding per room, not one deep snapshot per recipient.
export class RoomBroadcast {
  private food = new Map<number, FoodParticle>();
  prepare(room: Room, timing?: { tickMs: number; tickHz: number }): (id: string, full: boolean) => string {
    const changes = room.world.foodParticles.filter(p => {
      const old = this.food.get(p.id);
      return !old || old.x !== p.x || old.y !== p.y || old.availableAtTick !== p.availableAtTick;
    });
    for (const p of changes) this.food.set(p.id, { ...p });
    const actors = room.world.organisms.filter(p => p.alive || p.kind === 'player');
    const owned = new Map<string, typeof actors>();
    for (const p of actors) if (p.ownerId) {
      const list = owned.get(p.ownerId); if (list) list.push(p); else owned.set(p.ownerId, [p]);
    }
    const common = JSON.stringify({ tick: room.world.tick, timing, actors: actors.map(packActor), dissolvedPatches: room.world.dissolvedPatches, players: room.clients.size, leaderboard: room.leaderboard() }).slice(0, -1);
    const delta = JSON.stringify(changes);
    let fullFood: string | undefined;
    const ownJson = new Map<string, string>();
    return (id, full) => {
      let own = ownJson.get(id);
      if (!own) { own = JSON.stringify(owned.get(id) ?? []); ownJson.set(id, own); }
      if (full && !fullFood) fullFood = JSON.stringify(room.world.foodParticles);
      return `${common},"own":${own},"resetFood":${full},"food":${full ? fullFood : delta}}`;
    };
  }
}
