import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Room } from './room';
import { RoomBroadcast } from './broadcast';

const rooms = new Map<string, Room>();
const streams = new Map<string, { response: ServerResponse; room: Room; id: string; needsFull: boolean }>();
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
      const name = typeof body.room === 'string' ? body.room : 'pond';
      if (!/^[a-zA-Z0-9-]{1,24}$/.test(name)) throw new Error('Use 1–24 letters, numbers or hyphens for the room');
      if (!rooms.has(name)) { if (rooms.size >= 16) throw new Error('Server room limit reached'); rooms.set(name, new Room(name)); }
      const room = rooms.get(name)!, id = randomUUID(), token = randomUUID();
      room.join(id, token, String(body.speciesId));
      const timer = setTimeout(() => { if (!streams.has(token)) cleanup(room, id); }, 10000); timer.unref();
      return json(200, { id, token, room: name });
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const room = rooms.get(url.searchParams.get('room') ?? ''), id = url.searchParams.get('id') ?? '', token = url.searchParams.get('token') ?? '';
      if (!room || room.clients.get(id)?.token !== token || streams.has(token)) return json(403, { error: 'Invalid session' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(': connected\n\n'); streams.set(token, { response: res, room, id, needsFull: true });
      res.on('close', () => { streams.delete(token); cleanup(room, id); }); return;
    }
    if (url.pathname === '/api/input' && req.method === 'POST') {
      const body = await bodyOf(req), room = rooms.get(String(body.room)), client = room?.clients.get(String(body.id));
      if (!client || client.token !== body.token) return json(403, { error: 'Invalid session' });
      room!.input(String(body.id), body.sequence, body.command);
      return json(200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'Not found' });
    if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
    const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + sep)) return json(403, { error: 'Forbidden' });
    const data = await readFile(file);
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }); res.end(data);
  } catch (error) { json(400, { error: error instanceof Error ? error.message : 'Request failed' }); }
});
async function bodyOf(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 2048) throw new Error('Request too large'); }
  return JSON.parse(data);
}
function cleanup(room: Room, id: string) { room.leave(id); if (!room.clients.size) rooms.delete(room.id); }
const simulationTimer = setInterval(() => {
  for (const room of rooms.values()) room.advance();
  const packets = new Map<Room, (id: string, full: boolean) => string>();
  for (const stream of streams.values()) {
    const { response, room, id } = stream;
    if (room.world.tick % 2) continue;
    if (response.writableLength > 512_000) { response.destroy(); continue; }
    // Never append more stale state behind an already congested stream.
    if (response.writableNeedDrain) { stream.needsFull = true; continue; }
    let packet = packets.get(room);
    if (!packet) {
      let encoder = broadcasts.get(room);
      if (!encoder) { encoder = new RoomBroadcast(); broadcasts.set(room, encoder); }
      packet = encoder.prepare(room); packets.set(room, packet);
    }
    response.write(`data: ${packet(id, stream.needsFull)}\n\n`);
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
  for (const stream of streams.values()) stream.response.end();
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0', () => console.log(`microbia.gg multiplayer: http://localhost:${process.env.PORT ?? 3000}`));
