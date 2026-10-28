import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

test('live WebSocket transport authenticates, streams state, applies input and cleans up; SSE remains compatible', { timeout: 20000 }, async t => {
  const child = spawn(process.execPath, ['dist-server/main.js'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const base = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error('Server exited: ' + code)));
    child.stdout.on('data', data => { const match = data.toString().match(/localhost:(\d+)/); if (match) resolve('http://127.0.0.1:' + match[1]); });
    child.stderr.on('data', data => process.stderr.write(data));
  });
  const join = async room => {
    const response = await fetch(base + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, speciesId: 'paramecium-caudatum' }) });
    assert.equal(response.status, 200); return response.json();
  };
  const session = await join('socket-test');
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/socket?' + new URLSearchParams(session));
  t.after(() => ws.terminate());
  const frames = [], pending = [];
  ws.on('message', raw => { const data = JSON.parse(raw); frames.push(data); for (const notify of pending.splice(0)) notify(); });
  const until = async predicate => { while (!frames.some(predicate)) await new Promise(resolve => pending.push(resolve)); return frames.find(predicate); };
  await once(ws, 'open');
  const first = await until(p => p.resetFood === true);
  assert.ok(first.timing.tickHz > 0);
  const x = first.own[0].x;
  for (let sequence = 0; sequence < 5; sequence++) {
    ws.send(JSON.stringify({ sequence, sentAt: 123, command: { direction: { x: 1, y: 0 } } }));
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.ok((await until(p => p.kind === 'ack')).sentAt === 123);
  await until(p => p.own?.some(p => p.x > x + 5));
  const rejected = await fetch(base + '/api/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...session, token: 'wrong', sequence: 9, command: { direction: { x: 0, y: 0 } } }) });
  assert.equal(rejected.status, 403);
  ws.close(); await once(ws, 'close');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(!(await (await fetch(base + '/api/lobby')).json()).some(r => r.id === 'socket-test'));
  const fallback = await join('sse-test');
  const abort = new AbortController(); t.after(() => abort.abort());
  const stream = await fetch(base + '/api/events?' + new URLSearchParams(fallback), { signal: abort.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const chunk = await reader.read(); assert.ok(chunk.value.length > 0);
  await reader.cancel();
});
