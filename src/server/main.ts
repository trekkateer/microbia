import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Room } from './room';
import { RoomBroadcast } from './broadcast';
import { WebSocketServer, WebSocket } from 'ws';
import { DEFAULT_ROOM, validateRoom } from '../network/room-url';

const rooms = new Map<string, Room>();
interface Stream { room: Room; id: string; needsFull: boolean; buffered: () => number; blocked: () => boolean; send: (packet: string) => void; close: () => void }
const streams = new Map<string, Stream>();
const timing = { tickMs: 0, tickHz: 30 };
const broadcasts = new WeakMap<Room, RoomBroadcast>();
const root = resolve('dist');
let shuttingDown = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  try {
    if (url.pathname === '/healthz' && req.method === 'GET') return json(shuttingDown ? 503 : 200, { status: shuttingDown ? 'stopping' : 'ok' });
    if (shuttingDown) return json(503, { error: 'Server restarting' });
    if (url.pathname === '/api/lobby' && req.method === 'GET') return json(200, [...rooms.values()].map(r => ({ id: r.id, players: r.clients.size, maximum: 20 })));
    if (url.pathname === '/api/join' && req.method === 'POST') {
      const body = await bodyOf(req);
      const name = validateRoom(typeof body.room === 'string' ? body.room : DEFAULT_ROOM);
      if (!rooms.has(name)) { if (rooms.size >= 16) throw new Error('Server room limit reached'); rooms.set(name, new Room(name)); }
      const room = rooms.get(name)!, id = randomUUID(), token = randomUUID();
      room.join(id, token, String(body.speciesId), typeof body.name === 'string' ? body.name : '');
      const timer = setTimeout(() => { if (!streams.has(token)) cleanup(room, id, false); }, 10000); timer.unref();
      return json(200, { id, token, room: name });
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const room = rooms.get(url.searchParams.get('room') ?? ''), id = url.searchParams.get('id') ?? '', token = url.searchParams.get('token') ?? '';
      if (!room || room.clients.get(id)?.token !== token || streams.has(token)) return json(403, { error: 'Invalid session' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(': connected\n\n'); streams.set(token, { room, id, needsFull: true, buffered: () => res.writableLength,
        blocked: () => res.writableNeedDrain, send: packet => { res.write(`data: ${packet}\n\n`); }, close: () => res.destroy() });
      res.on('close', () => { streams.delete(token); cleanup(room, id); }); return;
    }
    if (url.pathname === '/api/leave' && req.method === 'POST') {
      const body = await bodyOf(req), room = rooms.get(String(body.room)), id = String(body.id);
      if (!room || room.clients.get(id)?.token !== body.token) return json(403, { error: 'Invalid session' });
      const stream = streams.get(String(body.token));
      streams.delete(String(body.token)); cleanup(room, id); stream?.close();
      return json(200, { ok: true });
    }
    if (url.pathname === '/api/input' && req.method === 'POST') {
      const body = await bodyOf(req), room = rooms.get(String(body.room)), client = room?.clients.get(String(body.id));
      if (!client || client.token !== body.token) return json(403, { error: 'Invalid session' });
      room!.input(String(body.id), body.sequence, body.command);
      return json(200, { ok: true, sentAt: body.sentAt });
    }
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'Not found' });
    if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const play = url.pathname === '/play' || url.pathname === '/play/';
    if (play && !url.searchParams.has('room')) {
      url.searchParams.set('room', DEFAULT_ROOM);
      res.writeHead(302, { Location: '/play?' + url.searchParams, 'Cache-Control': 'no-store' }); res.end(); return;
    }
    const index = url.pathname === '/species' || url.pathname === '/species/';
    const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : play ? '/play/index.html' : index ? '/species/index.html' : url.pathname));
    if (!file.startsWith(root + sep)) return json(403, { error: 'Forbidden' });
    const data = await readFile(file);
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }); res.end(data);
  } catch (error) { json(400, { error: error instanceof Error ? error.message : 'Request failed' }); }
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const room = rooms.get(url.searchParams.get('room') ?? ''), id = url.searchParams.get('id') ?? '', token = url.searchParams.get('token') ?? '';
  if (shuttingDown || url.pathname !== '/api/socket' || !room || room.clients.get(id)?.token !== token || streams.has(token)) { socket.destroy(); return; }
  sockets.handleUpgrade(req, socket, head, ws => {
    req.socket.setNoDelay(true);
    streams.set(token, { room, id, needsFull: true, buffered: () => ws.bufferedAmount,
      blocked: () => ws.bufferedAmount > 64_000, send: packet => ws.send(packet), close: () => ws.terminate() });
    let alive = true;
    ws.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => { if (!alive) ws.terminate(); else { alive = false; ws.ping(); } }, 5000);
    heartbeat.unref();
    ws.on('message', (data, binary) => {
      try {
        if (binary) throw new Error('Expected JSON input');
        const body = JSON.parse(data.toString());
        room.input(id, body.sequence, body.command);
        if (Number.isFinite(body.sentAt) && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 64_000)
          ws.send(JSON.stringify({ kind: 'ack', sentAt: body.sentAt }));
      } catch { ws.close(1008, 'Invalid input'); }
    });
    ws.on('error', () => ws.terminate());
    ws.on('close', () => { clearInterval(heartbeat); streams.delete(token); cleanup(room, id); });
  });
});
async function bodyOf(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 2048) throw new Error('Request too large'); }
  return JSON.parse(data);
}
function cleanup(room: Room, id: string, takeover = true) { room.leave(id, takeover); if (!room.clients.size && rooms.get(room.id) === room) rooms.delete(room.id); }
let rateStarted = performance.now(), rateTicks = 0;
const simulationTimer = setInterval(() => {
  const started = performance.now();
  for (const room of rooms.values()) room.advance();
  timing.tickMs = Math.round((performance.now() - started) * 100) / 100;
  rateTicks++;
  if (started - rateStarted >= 1000) { timing.tickHz = Math.round(rateTicks * 10000 / (started - rateStarted)) / 10; rateTicks = 0; rateStarted = started; }
  const packets = new Map<Room, (id: string, full: boolean) => string>();
  for (const stream of streams.values()) {
    const { room, id } = stream;
    if (room.world.tick % 2) continue;
    if (stream.buffered() > 512_000) { stream.close(); continue; }
    // Never append more stale state behind an already congested stream.
    if (stream.blocked()) { stream.needsFull = true; continue; }
    let packet = packets.get(room);
    if (!packet) {
      let encoder = broadcasts.get(room);
      if (!encoder) { encoder = new RoomBroadcast(); broadcasts.set(room, encoder); }
      packet = encoder.prepare(room, timing); packets.set(room, packet);
    }
    stream.send(packet(id, stream.needsFull));
    stream.needsFull = false;
  }
}, 1000 / 30);
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(simulationTimer);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); process.exit(0); });
  for (const stream of streams.values()) stream.close();
  sockets.close();
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => {
  const address = server.address();
  console.log(`microbia multiplayer: http://localhost:${typeof address === 'object' && address ? address.port : process.env.PORT ?? 3000}`);
});
