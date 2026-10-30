import { afterEach, expect, it, vi } from 'vitest';
import { connectPond } from '../src/network/client';
import { Room } from '../src/server/room';
import { RoomBroadcast } from '../src/server/broadcast';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixture() {
  const room = new Room('test'); room.join('a', 'token', 'paramecium-caudatum');
  const packet = new RoomBroadcast().prepare(room, { tickMs: 4, tickHz: 30 })('a', true);
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'a', token: 'token', room: 'test' })));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('location', { protocol: 'https:', host: 'www.microbia.us' });
  return { packet, fetcher };
}

it('uses one WebSocket for movement and one-shot actions, measures acknowledgments, and reports disconnects', async () => {
  const { packet, fetcher } = fixture();
  let ws!: MockSocket;
  class MockSocket {
    static OPEN = 1;
    readyState = 1; bufferedAmount = 0;
    onopen?: () => void; onmessage?: (event: { data: string }) => void; onerror?: () => void; onclose?: () => void;
    sent: string[] = [];
    constructor(readonly url: string) { ws = this; queueMicrotask(() => { this.onopen?.(); this.onmessage?.({ data: packet }); }); }
    send(data: string) { this.sent.push(data); }
    close() { this.onclose?.(); }
  }
  vi.stubGlobal('WebSocket', MockSocket);
  const client = await connectPond('paramecium-caudatum', 'test');
  expect(ws.url).toContain('wss://www.microbia.us/api/socket?');
  client.send({ direction: { x: 1, y: 0 }, activate: true });
  expect(JSON.parse(ws.sent[0]).command.activate).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const sentAt = JSON.parse(ws.sent[0]).sentAt;
  ws.onmessage?.({ data: JSON.stringify({ kind: 'ack', sentAt }) });
  expect(client.status).toContain('WebSocket'); expect(client.status).toContain('30 Hz / 4.0 ms');
  ws.bufferedAmount = 9000;
  client.send({ direction: { x: 1, y: 0 }, reproduce: true });
  ws.bufferedAmount = 0;
  client.send({ direction: { x: 0, y: 1 } });
  expect(JSON.parse(ws.sent[1]).command.reproduce).toBe(true);
  client.send({ direction: { x: 0, y: 1 } });
  expect(JSON.parse(ws.sent[2]).command.reproduce).not.toBe(true);
  const resigned = vi.fn(); client.onResign(resigned);
  ws.close(); expect(client.status).toContain('Resigned');
  expect(resigned).toHaveBeenCalledTimes(1);
  expect(client.connected).toBe(false);
  const count = ws.sent.length;
  expect(client.send({ direction: { x: 1, y: 0 }, respawn: true })).toBeUndefined();
  expect(ws.sent).toHaveLength(count);
  expect(fetcher.mock.calls.some(call => (call as unknown[])[0] === '/api/leave')).toBe(true);
  const late = vi.fn(); client.onResign(late); expect(late).toHaveBeenCalledTimes(1);
  ws.onerror?.(); expect(resigned).toHaveBeenCalledTimes(1);
});

it('falls back to SSE with a fresh session when WebSocket upgrade fails', async () => {
  const { packet, fetcher } = fixture();
  class BlockedSocket {
    onerror?: () => void; onopen?: () => void; onmessage?: () => void; onclose?: () => void;
    constructor() { queueMicrotask(() => this.onerror?.()); }
    close() {}
  }
  let events!: Events;
  class Events {
    onmessage?: (event: { data: string }) => void; onerror?: () => void;
    constructor() { events = this; queueMicrotask(() => this.onmessage?.({ data: packet })); }
    close() {}
  }
  vi.stubGlobal('WebSocket', BlockedSocket); vi.stubGlobal('EventSource', Events);
  const client = await connectPond('paramecium-caudatum', 'test');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(client.status).toContain('HTTP fallback'); expect(client.state.player.id).toBe('a');
  const resigned = vi.fn(); client.onResign(resigned);
  events.onerror?.(); expect(client.connected).toBe(false);
  events.onmessage?.({ data: packet });
  expect(resigned).toHaveBeenCalledTimes(1);
  expect(client.connected).toBe(false);
});

it('keeps healthy background connections alive but forces resignation on offline events', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  const { packet } = fixture();
  const windowEvents = new EventTarget(); vi.stubGlobal('window', windowEvents);
  let ws!: HealthySocket;
  class HealthySocket {
    static OPEN = 1; readyState = 1; bufferedAmount = 0;
    onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void;
    constructor() { ws = this; queueMicrotask(() => { this.onopen?.(); this.onmessage?.({ data: packet }); }); }
    send() {} close() { this.onclose?.(); }
  }
  vi.stubGlobal('WebSocket', HealthySocket);
  const client = await connectPond('paramecium-caudatum', 'test');
  windowEvents.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(8000);
  ws.onmessage?.({ data: JSON.stringify({ ...JSON.parse(packet), tick: 30 }) });
  await vi.advanceTimersByTimeAsync(8000);
  expect(client.connected).toBe(true);
  const resigned = vi.fn(); client.onResign(resigned);
  windowEvents.dispatchEvent(new Event('offline'));
  expect(client.connected).toBe(false); expect(resigned).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('resigns a silent connection permanently, even if late state arrives', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  const { packet } = fixture();
  let ws!: SilentSocket;
  class SilentSocket {
    static OPEN = 1; readyState = 1; bufferedAmount = 0;
    onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void;
    constructor() { ws = this; queueMicrotask(() => { this.onopen?.(); this.onmessage?.({ data: packet }); }); }
    send() {} close() { this.onclose?.(); }
  }
  vi.stubGlobal('WebSocket', SilentSocket);
  const client = await connectPond('paramecium-caudatum', 'test');
  const resigned = vi.fn(); client.onResign(resigned);
  await vi.advanceTimersByTimeAsync(9000); expect(client.connected).toBe(true);
  await vi.advanceTimersByTimeAsync(2000); expect(client.connected).toBe(false);
  expect(resigned).toHaveBeenCalledTimes(1);
  ws.onmessage?.({ data: packet });
  expect(client.connected).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
