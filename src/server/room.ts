import { arenas, species } from '../data';
import { createWorld, createOrganism, safeOrganismPosition, snapshot } from '../sim/world';
import { step } from '../sim/step';
import type { MoveCommand } from '../sim/commands';
import type { WorldSnapshot } from '../sim/types';

export class Room {
  readonly world = createWorld(arenas['pond-water'], species['amoeba-proteus']);
  readonly clients = new Map<string, { token: string; name: string; command: MoveCommand; lastInput: number; lastSequence: number; seenInputs: Set<number> }>();
  constructor(readonly id: string) { this.world.player.alive = false; this.world.player.kind = 'fixture'; }
  join(id: string, token: string, speciesId: string, name = ''): void {
    if (this.clients.size >= 20) throw new Error('Room full (20 players)');
    const definition = species[speciesId];
    if (!definition || !this.world.arena.roster.includes(speciesId)) throw new Error('Unknown species');
    const actor = createOrganism(definition, this.world.nutrition, id, 0, 0);
    actor.kind = 'player'; actor.ownerId = id;
    if (!safeOrganismPosition(this.world, actor, 160)) throw new Error('No clear spawn');
    actor.protectedUntil = this.world.tick + 90;
    this.world.organisms.push(actor);
    const displayName = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || `Player ${id.slice(0, 6)}`;
    this.clients.set(id, { token, name: displayName, command: { direction: { x: 0, y: 0 } }, lastInput: this.world.tick, lastSequence: -1, seenInputs: new Set() });
  }
  input(id: string, sequence: unknown, value: unknown): void {
    const client = this.clients.get(id);
    if (!client) throw new Error('Player not joined');
    if (!Number.isSafeInteger(sequence) || (sequence as number) < 0) throw new Error('Invalid input sequence');
    const seq = sequence as number;
    if (client.seenInputs.has(seq) || seq < client.lastSequence - 128) return;
    const command = parseCommand(value);
    client.seenInputs.add(seq);
    const latest = seq > client.lastSequence;
    if (latest) client.lastSequence = seq;
    for (const old of client.seenInputs) if (old < client.lastSequence - 128) client.seenInputs.delete(old);
    // Out-of-order movement cannot rewind steering, but unseen button presses
    // must still execute once even if their HTTP request arrives late.
    client.command = { ...(latest ? command : client.command), activate: command.activate || client.command.activate, reproduce: command.reproduce || client.command.reproduce, respawn: command.respawn || client.command.respawn };
    client.lastInput = this.world.tick;
  }
  leave(id: string): void {
    this.clients.delete(id);
    const removed = new Set(this.world.organisms.filter(p => p.ownerId === id).map(p => p.id));
    this.world.organisms = this.world.organisms.filter(p => p.ownerId !== id);
    for (const p of this.world.organisms) if (p.ability?.targetId && removed.has(p.ability.targetId)) p.ability = null;
  }
  advance(): void {
    // Retain one death record per eliminated owner, not every dead descendant.
    const living = new Set(this.world.organisms.filter(p => p.alive && p.ownerId).map(p => p.ownerId));
    const retained = new Set<string>();
    this.world.organisms = this.world.organisms.filter(p => {
      if (p.kind !== 'player' || !p.ownerId || p.alive) return true;
      if (living.has(p.ownerId) || retained.has(p.ownerId)) return false;
      retained.add(p.ownerId); return true;
    });
    const commands = new Map([...this.clients].map(([id, c]) => [id, this.world.tick - c.lastInput > 15 ? { direction: { x: 0, y: 0 } } : c.command]));
    step(this.world, { direction: { x: 0, y: 0 } }, commands);
    for (const c of this.clients.values()) c.command = { ...c.command, activate: false, reproduce: false, respawn: false };
  }
  state(id: string): WorldSnapshot {
    const state = snapshot(this.world);
    const own = state.organisms.filter(p => p.ownerId === id);
    const player = own.find(p => p.alive) ?? own[0];
    if (!player) throw new Error('Player not joined');
    return { ...state, player, organisms: state.organisms.filter(p => p !== player) };
  }
  leaderboard() {
    return [...this.clients].map(([id, client]) => ({ id, name: client.name, speciesId: this.world.organisms.find(p => p.ownerId === id)?.speciesId, mass: this.world.organisms.filter(p => p.ownerId === id && p.alive).reduce((sum, p) => sum + p.mass, 0) })).sort((a, b) => b.mass - a.mass || a.id.localeCompare(b.id)).slice(0, 10);
  }
}

export function parseCommand(value: unknown): MoveCommand {
  if (!value || typeof value !== 'object') throw new Error('Invalid command');
  const v = value as Record<string, unknown>;
  const vector = (value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid vector');
    const p = value as { x: number; y: number };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000) throw new Error('Invalid coordinates');
    return { x: p.x, y: p.y };
  };
  const direction = vector(v.direction), length = Math.max(1, Math.hypot(direction.x, direction.y));
  return { direction: { x: direction.x / length, y: direction.y / length }, target: v.target === undefined ? undefined : vector(v.target), activate: v.activate === true, reproduce: v.reproduce === true, respawn: v.respawn === true };
}
