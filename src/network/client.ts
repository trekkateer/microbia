import type { MoveCommand } from '../sim/commands';
import type { WorldSnapshot } from '../sim/types';
import { PondDecoder, type LeaderboardEntry } from './protocol';

export async function connectPond(speciesId: string, room: string, name = '') {
  const result = await fetch('/api/join', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId, room, name }) });
  const session = await result.json();
  if (!result.ok) throw new Error(session.error ?? 'Unable to join');
  const query = new URLSearchParams(session);
  let latest: WorldSnapshot | null = null, disconnected = false, players = 0;
  let leaderboard: LeaderboardEntry[] = [];
  let rtt = 0, lastPing = -Infinity, tickHz = 30, tickMs = 0;
  let lastStateAt = performance.now(), appliedSequence: number | undefined;
  let socket: WebSocket | undefined, events: EventSource | undefined;
  const decoder = new PondDecoder();
  let ready!: () => void, failed!: (error: Error) => void;
  const first = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  void first.catch(() => {});
  const listeners = new Set<(reason: string) => void>();
  let resignationReason = 'Connection lost. Your run has ended.';
  let watchdog: ReturnType<typeof setInterval> | undefined;
  const offline = () => lost('You went offline. Your run has ended.');
  const leaving = () => lost('You left the arena. Your run has ended.');
  const lost = (reason = 'Connection lost. Your run has ended.') => {
    if (disconnected) return;
    disconnected = true; resignationReason = reason;
    clearInterval(watchdog);
    if (typeof window !== 'undefined') { window.removeEventListener('offline', offline); window.removeEventListener('pagehide', leaving); }
    events?.close(); socket?.close();
    // Best effort for HTTP failures/offline transitions. A broken transport is
    // also removed server-side on close or heartbeat expiry.
    void fetch('/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session), keepalive: true, signal: AbortSignal.timeout(5000) }).catch(() => {});
    failed(new Error(reason));
    for (const listener of listeners) listener(reason);
    listeners.clear();
  };
  const receive = (event: MessageEvent) => {
    if (disconnected) return;
    try {
      const data = JSON.parse(event.data);
      if (data.kind === 'ack') { rtt = Math.max(0, performance.now() - data.sentAt); return; }
      if (latest && data.tick <= latest.tick) return;
      latest = decoder.decode(data); players = data.players; leaderboard = data.leaderboard;
      lastStateAt = performance.now();
      appliedSequence = Number.isSafeInteger(data.appliedSequence) ? data.appliedSequence : undefined;
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
    ws.onopen = () => { clearTimeout(timeout); socket = ws; ws.onclose = () => lost(); resolve(true); };
    ws.onerror = () => { if (socket === ws) lost(); else abandon(); };
    ws.onclose = () => { clearTimeout(timeout); resolve(false); };
  });
  if (!upgraded) {
    // The server may have accepted a handshake whose reply was delayed. Use a
    // fresh session so closing that attempt cannot delete the fallback colony.
    const retry = await fetch('/api/join', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speciesId, room, name }) });
    const replacement = await retry.json();
    if (!retry.ok) throw new Error(replacement.error ?? 'Unable to join');
    Object.assign(session, replacement);
    events = new EventSource('/api/events?' + new URLSearchParams(session));
    events.onmessage = receive; events.onerror = () => lost();
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([first, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Server did not respond')), 10000); })]);
  } catch (error) { lost(); throw error; }
  finally { clearTimeout(timeout); }
  if (!disconnected) {
    // Do not tie liveness to inputs: changing tabs must not resign a live player.
    watchdog = setInterval(() => { if (performance.now() - lastStateAt > 10000) lost('The server stopped responding. Your run has ended.'); }, 1000);
    if (typeof window !== 'undefined') { window.addEventListener('offline', offline); window.addEventListener('pagehide', leaving); }
  }
  let inFlight = 0, sequence = 0;
  let queued: MoveCommand = { direction: { x: 0, y: 0 } };
  return {
    get state() { return latest!; },
    get leaderboard() { return leaderboard; },
    get playerId() { return session.id as string; },
    get appliedSequence() { return appliedSequence; },
    get stateAge() { return (performance.now() - lastStateAt) / 1000; },
    get connected() { return !disconnected; },
    onResign(listener: (reason: string) => void) {
      if (disconnected) listener(resignationReason); else listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resign: () => lost('You resigned. Your run has ended.'),
    get status() {
      if (disconnected) return 'Resigned - connection ended';
      const age = performance.now() - lastStateAt;
      const health = (socket ? 'WebSocket' : 'HTTP fallback') + ' | RTT ' + (rtt ? Math.round(rtt) + ' ms' : 'measuring') + ' | State ' + Math.round(age) + ' ms' + (age > 500 ? ' (waiting for server)' : '') + ' | Server ' + tickHz.toFixed(0) + ' Hz / ' + tickMs.toFixed(1) + ' ms';
      return room + ' | ' + players + '/20 players | ' + health;
    },
    send(command: MoveCommand) {
      queued = { ...command, activate: command.activate || queued.activate, reproduce: command.reproduce || queued.reproduce, respawn: command.respawn || queued.respawn };
      if (disconnected || (socket ? socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 8192 : inFlight >= 4)) return;
      const outgoing = queued; queued = { direction: command.direction, target: command.target };
      const now = performance.now(), sentAt = now - lastPing >= 1000 ? now : undefined;
      if (sentAt !== undefined) lastPing = now;
      const outgoingSequence = sequence++;
      const input = { sequence: outgoingSequence, command: outgoing, sentAt };
      const body = JSON.stringify(socket ? input : { ...session, ...input });
      if (socket) { socket.send(body); return outgoingSequence; }
      inFlight++;
      void fetch('/api/input', { signal: AbortSignal.timeout(5000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .then(async response => { if (!response.ok) throw new Error('Input rejected'); const ack = await response.json(); if (Number.isFinite(ack.sentAt)) rtt = Math.max(0, performance.now() - ack.sentAt); })
        .catch(() => lost()).finally(() => { inFlight--; });
      return outgoingSequence;
    },
  };
}
