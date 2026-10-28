import type { MoveCommand } from '../sim/commands';
import type { WorldSnapshot } from '../sim/types';
import { PondDecoder } from './protocol';

export async function connectPond(speciesId: string, room: string) {
  const result = await fetch('/api/join', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId, room }) });
  const session = await result.json();
  if (!result.ok) throw new Error(session.error ?? 'Unable to join');
  const events = new EventSource(`/api/events?${new URLSearchParams(session)}`);
  let latest: WorldSnapshot | null = null, disconnected = false, players = 0;
  let leaderboard: { id: string; mass: number }[] = [];
  const decoder = new PondDecoder();
  const first = new Promise<void>((resolve, reject) => {
    events.onmessage = event => { const data = JSON.parse(event.data); latest = decoder.decode(data); players = data.players; leaderboard = data.leaderboard; resolve(); };
    events.onerror = () => { disconnected = true; events.close(); reject(new Error('Connection lost. Reload to rejoin.')); };
  });
  const timeout = setTimeout(() => events.close(), 10000);
  await Promise.race([first, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Server did not respond')), 10000))]);
  clearTimeout(timeout);
  let inFlight = 0, sequence = 0;
  let queued: MoveCommand = { direction: { x: 0, y: 0 } };
  return {
    get state() { return latest!; },
    get status() { return disconnected ? 'Disconnected — reload to rejoin' : `${room} · ${players}/20 players · Leaders: ${leaderboard.slice(0, 3).map(p => `${p.id === session.id ? 'You' : p.id.slice(0, 4)} ${Math.round(p.mass)}`).join(' / ')}`; },
    send(command: MoveCommand) {
      queued = { ...command, activate: command.activate || queued.activate, reproduce: command.reproduce || queued.reproduce, respawn: command.respawn || queued.respawn };
      if (inFlight >= 4 || disconnected) return;
      inFlight++;
      const outgoing = queued; queued = { direction: command.direction, target: command.target };
      void fetch('/api/input', { signal: AbortSignal.timeout(3000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...session, sequence: sequence++, command: outgoing }) }).then(r => { if (!r.ok) throw new Error('Input rejected'); }).catch(() => { disconnected = true; events.close(); }).finally(() => { inFlight--; });
    },
  };
}
