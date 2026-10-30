import type { ArenaDefinition, SpeciesDefinition } from '../data/schemas';
import type { MoveCommand } from '../sim/commands';
import type { PlayerState, Vec2, WorldSnapshot } from '../sim/types';
import { FIXED_DT } from '../sim/step';
import { movementDirection } from '../sim/movement';
import { playerCellCommand } from '../sim/systems/player-control';
import { environmentAt } from '../sim/systems/environment';
import { bodyHull, penetration } from '../sim/systems/collisions';
import { SpatialGrid } from '../sim/spatial-grid';

const MAX_SECONDS = 0.25;
const MAX_INPUTS = 8;
interface Pose { x: number; y: number; heading: number }

// Presentation only. Replay unacknowledged steering without simulating food,
// combat, growth, reproduction or moving another player's bodies.
export class MovementPrediction {
  private inputs: { sequence: number; command: MoveCommand }[] = [];
  private shown = new Map<string, Pose>();
  private correction = new Map<string, Vec2>();
  private source?: WorldSnapshot;
  private topology = '';
  private revision = 0;
  private cachedRevision = -1;
  private base = new Map<string, PlayerState>();
  private grid = new SpatialGrid<PlayerState>([]);
  private largest = 0;
  private hulls = new Map<string, Vec2[]>();

  constructor(private arena: ArenaDefinition, private roster: Readonly<Record<string, SpeciesDefinition>>) {}

  record(sequence: number | undefined, command: MoveCommand) {
    if (sequence === undefined) return;
    this.inputs.push({ sequence, command: { direction: { ...command.direction }, target: command.target ? { ...command.target } : undefined } });
    if (this.inputs.length > MAX_INPUTS) this.inputs.splice(0, this.inputs.length - MAX_INPUTS);
    this.revision++;
  }

  reset() {
    this.inputs = []; this.shown.clear(); this.correction.clear(); this.base.clear();
    this.source = undefined; this.topology = ''; this.revision++;
  }

  get pendingInputs() { return this.inputs.length; }

  private move(actor: PlayerState, command: MoveCommand, dt: number, tick: number) {
    if (dt <= 0) return;
    const oldHeading = actor.heading;
    const direction = movementDirection(actor, playerCellCommand(actor, command).direction, this.roster[actor.speciesId], tick, dt);
    if (Math.hypot(direction.x, direction.y) > 0.001) actor.heading = Math.atan2(direction.y, direction.x);
    const environment = environmentAt(this.arena, actor);
    const old = { x: actor.x, y: actor.y };
    actor.x += (direction.x * actor.speed * environment.speedMultiplier + environment.current.x) * dt;
    actor.y += (direction.y * actor.speed * environment.speedMultiplier + environment.current.y) * dt;
    const world = { tick, roster: this.roster };
    // Exact hull checks only near rivals; owned siblings remain one colony.
    const reach = (actor.radius + this.largest) * 1.4 + 2;
    let hull: Vec2[] | undefined;
    for (const other of this.grid.query(actor.x - reach, actor.y - reach, actor.x + reach, actor.y + reach)) {
      if ((actor.x - other.x) ** 2 + (actor.y - other.y) ** 2 > ((actor.radius + other.radius) * 1.4 + 2) ** 2) continue;
      let obstacle = this.hulls.get(other.id);
      if (!obstacle) { obstacle = bodyHull(world, other); this.hulls.set(other.id, obstacle); }
      hull ??= bodyHull(world, actor);
      if (penetration(hull, obstacle, 0)) { actor.x = old.x; actor.y = old.y; actor.heading = oldHeading; hull = undefined; break; }
    }
    const margin = actor.radius * 1.4 + 2;
    if (actor.x < margin || actor.y < margin || actor.x > this.arena.map.width - margin || actor.y > this.arena.map.height - margin) {
      hull = bodyHull(world, actor);
      actor.x += Math.max(0, 1 - Math.min(...hull.map(p => p.x))) - Math.max(0, Math.max(...hull.map(p => p.x)) - this.arena.map.width + 1);
      actor.y += Math.max(0, 1 - Math.min(...hull.map(p => p.y))) - Math.max(0, Math.max(...hull.map(p => p.y)) - this.arena.map.height + 1);
    }
    actor.velocity = { x: (actor.x - old.x) / dt, y: (actor.y - old.y) / dt };
  }

  render(previous: WorldSnapshot, current: WorldSnapshot, ownerId: string, appliedSequence: number, command: MoveCommand, fraction: number, delta: number, stateAge: number) {
    const actors = [current.player, ...current.organisms];
    const owned = actors.filter(p => p.kind === 'player' && p.ownerId === ownerId);
    const topology = owned.map(p => `${p.id}:${p.generation}:${p.divisionCount}:${p.alive}:${p.stunnedUntil}:${p.ability?.effect ?? ''}`).join('|');
    const changed = this.topology !== '' && this.topology !== topology;
    if (changed) { this.inputs = []; this.shown.clear(); this.correction.clear(); this.revision++; }
    this.topology = topology;
    const fresh = this.source !== current;
    if (fresh) {
      this.inputs = this.inputs.filter(input => input.sequence > appliedSequence);
      this.source = current;
      const obstacles = actors.filter(p => p.alive && !(p.kind === 'player' && p.ownerId === ownerId));
      this.grid = new SpatialGrid(obstacles);
      this.largest = obstacles.reduce((n, p) => Math.max(n, p.radius), 0);
      this.hulls.clear();
    }
    if (fresh || this.cachedRevision !== this.revision) {
      this.base.clear();
      for (const actor of owned) {
        if (!actor.alive || actor.stunnedUntil > current.tick || (actor.ability && actor.ability.effect !== 'discharge')) continue;
        const pose = { ...actor, velocity: { ...actor.velocity } };
        let remaining = MAX_SECONDS;
        for (const input of this.inputs) {
          const dt = Math.min(FIXED_DT, remaining); if (dt <= 0) break;
          this.move(pose, input.command, dt, current.tick); remaining -= dt;
        }
        this.base.set(actor.id, pose);
      }
      this.cachedRevision = this.revision;
    }
    const visuals = new Map<string, PlayerState>();
    for (const actor of owned) {
      const base = this.base.get(actor.id);
      if (!base) { this.shown.delete(actor.id); this.correction.delete(actor.id); continue; }
      const target = { ...base, velocity: { ...base.velocity } };
      const remaining = Math.max(0, MAX_SECONDS - this.inputs.length * FIXED_DT);
      this.move(target, command, Math.min(Math.max(0, fraction) * FIXED_DT, remaining), current.tick);
      const shown = this.shown.get(actor.id);
      if (stateAge > 0.5 && shown) { target.x = shown.x; target.y = shown.y; target.heading = shown.heading; }
      else {
        if (fresh && shown) {
          const x = shown.x - target.x, y = shown.y - target.y;
          this.correction.set(actor.id, Math.hypot(x, y) < Math.max(80, actor.radius * 2) ? { x, y } : { x: 0, y: 0 });
        }
        const error = this.correction.get(actor.id);
        if (error) { const decay = Math.exp(-Math.max(0, delta) / 0.08); error.x *= decay; error.y *= decay; target.x += error.x; target.y += error.y; }
      }
      this.shown.set(actor.id, { x: target.x, y: target.y, heading: target.heading });
      visuals.set(actor.id, { ...actor, x: target.x, y: target.y, heading: target.heading, motionPath: [{ x: target.x, y: target.y }] });
    }
    const pose = (actor: PlayerState) => {
      const visual = visuals.get(actor.id);
      return visual ? { ...actor, x: visual.x, y: visual.y, heading: visual.heading, motionPath: visual.motionPath } : actor;
    };
    const apply = (world: WorldSnapshot): WorldSnapshot => ({ ...world, player: pose(world.player), organisms: world.organisms.map(pose) });
    return { previous: apply(previous), current: apply(current) };
  }
}
