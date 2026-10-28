import type { MoveCommand } from '../sim/commands';
import type { WorldSnapshot } from '../sim/types';
import { PondDecoder } from './protocol';

export async function connectPond(speciesId: string, room: string) {
  const result = await fetch('/api/join', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId, room }) });
  const session = await result.json();
  if (!result.ok) throw new Error(session.error ?? 'Unable to join');
  const query = new URLSearchParams(session);
  let latest: WorldSnapshot | null = null, disconnected = false, players = 0;
  let leaderboard: { id: string; mass: number }[] = [];
  let rtt = 0, lastPing = -Infinity, tickHz = 30, tickMs = 0;
  let socket: WebSocket | undefined, events: EventSource | undefined;
  const decoder = new PondDecoder();
  let ready!: () => void, failed!: (error: Error) => void;
  const first = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  void first.catch(() => {});
  const lost = () => { disconnected = true; events?.close(); failed(new Error('Connection lost. Reload to rejoin.')); };
  const receive = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.kind === 'ack') { rtt = Math.max(0, performance.now() - data.sentAt); return; }
      latest = decoder.decode(data); players = data.players; leaderboard = data.leaderboard;
      if (data.timing) { tickHz = data.timing.tickHz; tickMs = data.timing.tickMs; }
      ready();
    } catch { lost(); socket?.close(); }
  };
  // Fall back only if the upgrade fails, not after closing an established session.
  const upgraded = await new Promise<boolean>(resolve => {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/socket?' + query);
    const abandon = () => {
      clearTimeout(timeout); ws.onopen = null; ws.onmessage = null; ws.onclose = null; ws.onerror = () => {};
      ws.close(); resolve(false);
    };
    const timeout = setTimeout(abandon, 2500);
    ws.onmessage = receive;
    ws.onopen = () => { clearTimeout(timeout); socket = ws; ws.onclose = lost; resolve(true); };
    ws.onerror = () => { if (socket === ws) lost(); else abandon(); };
    ws.onclose = () => { clearTimeout(timeout); resolve(false); };
  });
  if (!upgraded) {
    // The server may have accepted a handshake whose reply was delayed. Use a
    // fresh session so closing that attempt cannot delete the fallback colony.
    const retry = await fetch('/api/join', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId, room }) });
    const replacement = await retry.json();
    if (!retry.ok) throw new Error(replacement.error ?? 'Unable to join');
    Object.assign(session, replacement);
    events = new EventSource('/api/events?' + new URLSearchParams(session));
    events.onmessage = receive; events.onerror = lost;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([first, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Server did not respond')), 10000); })]);
  } catch (error) { events?.close(); socket?.close(); throw error; }
  finally { clearTimeout(timeout); }
  let inFlight = 0, sequence = 0;
  let queued: MoveCommand = { direction: { x: 0, y: 0 } };
  return {
    get state() { return latest!; },
    get status() {
      if (disconnected) return 'Disconnected - reload to rejoin';
      const health = (socket ? 'WebSocket' : 'HTTP fallback') + ' | RTT ' + (rtt ? Math.round(rtt) + ' ms' : 'measuring') + ' | Server ' + tickHz.toFixed(0) + ' Hz / ' + tickMs.toFixed(1) + ' ms';
      return room + ' | ' + players + '/20 players | ' + health + ' | Leaders: ' + leaderboard.slice(0, 3).map(p => (p.id === session.id ? 'You' : p.id.slice(0, 4)) + ' ' + Math.round(p.mass)).join(' / ');
    },
    send(command: MoveCommand) {
      queued = { ...command, activate: command.activate || queued.activate, reproduce: command.reproduce || queued.reproduce, respawn: command.respawn || queued.respawn };
      if (disconnected || (socket ? socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 8192 : inFlight >= 4)) return;
      const outgoing = queued; queued = { direction: command.direction, target: command.target };
      const now = performance.now(), sentAt = now - lastPing >= 1000 ? now : undefined;
      if (sentAt !== undefined) lastPing = now;
      const body = JSON.stringify({ ...session, sequence: sequence++, command: outgoing, sentAt });
      if (socket) { socket.send(body); return; }
      inFlight++;
      void fetch('/api/input', { signal: AbortSignal.timeout(5000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .then(async response => { if (!response.ok) throw new Error('Input rejected'); const ack = await response.json(); if (Number.isFinite(ack.sentAt)) rtt = Math.max(0, performance.now() - ack.sentAt); })
        .catch(lost).finally(() => { inFlight--; });
    },
  };
}
