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
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  const arena = await fetch(base + '/play?room=1');
  assert.equal(arena.status, 200);
  const arenaHtml = await arena.text();
  assert.notEqual(homeHtml, arenaHtml, 'home and play must serve distinct page entries');
  const speciesIndex = await fetch(base + '/species?room=2');
  assert.equal(speciesIndex.status, 200);
  assert.match(await speciesIndex.text(), /Species index/);
  assert.equal((await fetch(base + '/species/')).status, 200);
  assert.match(arenaHtml, /Play microbia/);
  assert.equal((await fetch(base + '/play?room=2')).status, 200);
  const defaultArena = await fetch(base + '/play', { redirect: 'manual' });
  assert.equal(defaultArena.status, 302);
  assert.equal(defaultArena.headers.get('location'), '/play?room=1');
  assert.equal((await fetch(base + '/play/?room=2')).status, 200);
  const session = await join('socket-test');
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/socket?' + new URLSearchParams(session));
  t.after(() => ws.terminate());
  const frames = [], pending = [];
  ws.on('message', raw => { const data = JSON.parse(raw); frames.push(data); for (const notify of pending.splice(0)) notify(); });
  const until = async predicate => { while (!frames.some(predicate)) await new Promise(resolve => pending.push(resolve)); return frames.find(predicate); };
  await once(ws, 'open');
  const first = await until(p => p.resetFood === true);
  assert.equal(first.appliedSequence, -1);
  assert.ok(first.leaderboard.length <= 5);
  assert.ok(first.leaderboard.some(p => p.bot && p.name));
  assert.ok(first.leaderboard.every(p => p.speciesId && p.name));
  assert.ok(first.timing.tickHz > 0);
  const x = first.own[0].x;
  for (let sequence = 0; sequence < 5; sequence++) {
    ws.send(JSON.stringify({ sequence, sentAt: 123, command: { direction: { x: 1, y: 0 } } }));
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.ok((await until(p => p.kind === 'ack')).sentAt === 123);
  await until(p => p.own?.some(p => p.x > x + 5));
  await until(p => p.appliedSequence >= 0 && p.own?.some(p => p.x > x + 5));
  const rejected = await fetch(base + '/api/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...session, token: 'wrong', sequence: 9, command: { direction: { x: 0, y: 0 } } }) });
  assert.equal(rejected.status, 403);
  const leave = body => fetch(base + '/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await leave({ ...session, token: 'wrong' })).status, 403);
  const closed = once(ws, 'close');
  assert.equal((await leave(session)).status, 200);
  await closed;
  assert.equal((await fetch(base + '/api/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...session, sequence: 99, command: { direction: { x: 0, y: 0 }, respawn: true } }) })).status, 403);
  assert.equal((await fetch(base + '/api/events?' + new URLSearchParams(session))).status, 403);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(!(await (await fetch(base + '/api/lobby')).json()).some(r => r.id === 'socket-test'));
  const fallback = await join('sse-test');
  const abort = new AbortController(); t.after(() => abort.abort());
  const stream = await fetch(base + '/api/events?' + new URLSearchParams(fallback), { signal: abort.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const chunk = await reader.read(); assert.ok(chunk.value.length > 0);
  assert.equal((await leave(fallback)).status, 200);
  await reader.cancel().catch(() => {}); // Explicit resignation destroys the SSE stream.
  assert.equal((await fetch(base + '/api/events?' + new URLSearchParams(fallback))).status, 403);
});

test('both socket loss and explicit resignation hand existing cells to bots for other players', { timeout: 20000 }, async t => {
  const child = spawn(process.execPath, ['dist-server/main.js'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const base = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', data => { const match = data.toString().match(/localhost:(\d+)/); if (match) resolve('http://127.0.0.1:' + match[1]); });
    child.on('exit', code => reject(new Error('Server exited: ' + code)));
  });
  const join = async () => (await fetch(base + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: 'handoff', speciesId: 'paramecium-caudatum', name: 'River' }) })).json();
  const connect = session => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/socket?' + new URLSearchParams(session));
    t.after(() => ws.terminate()); return ws;
  };
  const observerSession = await join(), observer = connect(observerSession);
  const packets = []; observer.on('message', raw => packets.push(JSON.parse(raw)));
  await once(observer, 'open');
  for (const mode of ['socket-loss', 'resignation']) {
    const session = await join(), ws = connect(session);
    const firstMessage = once(ws, 'message'); await once(ws, 'open');
    const first = JSON.parse((await firstMessage)[0].toString());
    const id = first.own[0].id, colony = first.own[0].colonyId;
    const closed = once(ws, 'close');
    if (mode === 'socket-loss') ws.terminate();
    else assert.equal((await fetch(base + '/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session) })).status, 200);
    await closed;
    const deadline = performance.now() + 5000;
    let bot;
    while (!bot && performance.now() < deadline) {
      bot = packets.flatMap(p => p.actors ?? []).find(p => p[0] === id && p[3] === 'ai');
      if (!bot) await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.ok(bot, mode + ' must preserve the actor as a bot');
    assert.equal(bot[2], null); assert.equal(bot[4], colony); assert.equal(bot[13], true);
    assert.ok(packets.every(p => p.own?.every(p => p.ownerId === observerSession.id)));
    assert.equal((await fetch(base + '/api/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...session, sequence: 99, command: { direction: { x: 1, y: 0 } } }) })).status, 403);
  }
  const lobby = await (await fetch(base + '/api/lobby')).json();
  assert.equal(lobby.find(room => room.id === 'handoff').players, 1);
});
