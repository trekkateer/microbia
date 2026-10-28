import { test, expect } from '@playwright/test';

test('body drawing is reused between ticks while swimming still interpolates', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const rendererPath = '/src/client/rendering/pond-renderer.ts', worldPath = '/src/sim/world.ts';
    const { PondRenderer } = await import(rendererPath), { snapshot, createOrganism } = await import(worldPath);
    const w = window.__microbiaTest!.world, frame = snapshot(w);
    const cell = createOrganism(w.roster['paramecium-caudatum'], w.nutrition, 'cache-probe', w.player.x + 100, w.player.y);
    cell.motionPath = [{ x: cell.x - 50, y: cell.y }, { x: cell.x, y: cell.y }];
    frame.organisms = [cell]; frame.tick = 1000;
    const render = PondRenderer.prototype.render, canvas = document.querySelector('canvas')!;
    PondRenderer.prototype.render = function (_a: unknown, _b: unknown, _alpha: number, camera: unknown, delta: number) {
      render.call(this, frame, frame, 0.2, camera, delta);
      const visual = this.targetGraphics.get(cell.id), instruction = visual.body.context.instructions[0], x = visual.cell.x;
      render.call(this, frame, frame, 0.8, camera, 0);
      const reused = instruction === visual.body.context.instructions[0], moved = visual.cell.x > x;
      frame.tick++;
      render.call(this, frame, frame, 0.8, camera, 0);
      const refreshed = instruction !== visual.body.context.instructions[0];
      canvas.dataset.bodyCache = JSON.stringify({ reused, moved, refreshed });
    };
  });
  await expect(page.locator('canvas')).toHaveAttribute('data-body-cache', JSON.stringify({ reused: true, moved: true, refreshed: true }));
});

test('off-screen cells skip drawing and shared organelles survive removal of a sibling', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const path = '/src/client/rendering/pond-renderer.ts', worldPath = '/src/sim/world.ts';
    const { PondRenderer } = await import(path), { createOrganism } = await import(worldPath);
    const w = window.__microbiaTest!.world;
    w.organisms = ['near-a', 'near-b', 'far'].map((id, i) => createOrganism(w.roster['paramecium-caudatum'], w.nutrition, id, i === 2 ? 200 : w.player.x - 100 + i * 150, i === 2 ? 200 : w.player.y - 100));
    const render = PondRenderer.prototype.render;
    PondRenderer.prototype.render = function (...args: unknown[]) {
      render.apply(this, args);
      const a = this.targetGraphics.get('near-a'), b = this.targetGraphics.get('near-b'), far = this.targetGraphics.get('far');
      document.querySelector('canvas')!.dataset.cacheState = JSON.stringify({
        a: !!a, b: !!b, farVisible: !!far?.cell.visible,
        shared: a && b ? a.interior.context === b.interior.context : false,
        interiorIntact: !!b?.interior.context.instructions.length,
      });
    };
  });
  await expect(page.locator('canvas')).toHaveAttribute('data-cache-state', JSON.stringify({ a: true, b: true, farVisible: false, shared: true, interiorIntact: true }));
  await page.evaluate(() => {
    const w = window.__microbiaTest!.world;
    w.organisms = w.organisms.filter(p => p.id !== 'near-a');
    const far = w.organisms.find(p => p.id === 'far')!; far.x = w.player.x + 100; far.y = w.player.y - 200; far.motionPath = [{ x: far.x, y: far.y }];
  });
  await expect(page.locator('canvas')).toHaveAttribute('data-cache-state', JSON.stringify({ a: false, b: true, farVisible: true, shared: false, interiorIntact: true }));
});

test('crowded pond performance sample with 32, 64 and 128 living cells', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  const profiler = process.env.POND_PROFILE ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
  const simulation = await page.evaluate(async () => {
    const worldPath = '/src/sim/world.ts', stepPath = '/src/sim/step.ts';
    const { createWorld, createOrganism } = await import(worldPath);
    const { step } = await import(stepPath);
    const original = window.__microbiaTest!.world;
    const samples = [];
    for (const count of [32, 64, 128]) {
      const w = createWorld({ ...original.arena, aiSpawns: [] }, original.species);
      w.player.protectedUntil = 100000;
      const species = Object.values(w.roster) as typeof original.species[];
      for (let i = 1; i < count; i++) {
        const s = species[i % species.length];
        const actor = createOrganism(s, w.nutrition, `stress-${i}`, w.player.x - 300 + (i % 8) * 78, w.player.y - 300 + Math.floor(i / 8) * 78);
        actor.kind = 'ai'; actor.protectedUntil = 100000;
        actor.ai = { profileId: s.reproduction!.offspringAi, mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0, wanderAngle: i, targetId: null };
        w.organisms.push(actor);
      }
      const times = [];
      for (let i = 0; i < 210; i++) {
        const start = performance.now(); step(w, { direction: { x: 0, y: 0 } });
        if (i >= 30) times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      samples.push({ cells: count, medianMs: times[90], p95Ms: times[171], maxMs: times[179] });
      if (count === 128) {
        original.organisms = w.organisms; original.player = w.player;
        original.foodParticles = w.foodParticles; original.tick = w.tick;
      }
    }
    return samples;
  });
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    const totals = new Map<string, number>();
    for (const node of profile.nodes) {
      const name = `${node.callFrame.functionName} (${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1})`;
      totals.set(name, (totals.get(name) ?? 0) + (node.hitCount ?? 0));
    }
    console.log('POND_CPU_SAMPLES', JSON.stringify([...totals].sort((a, b) => b[1] - a[1]).slice(0, 18)));
    await profiler.send('Profiler.start');
  }
  const rendering = await page.evaluate(async () => {
    const path = '/src/client/rendering/pond-renderer.ts';
    const { PondRenderer } = await import(path);
    const render = PondRenderer.prototype.render;
    const durations: number[] = [], intervals: number[] = [];
    let last = performance.now();
    await new Promise<void>(resolve => {
      PondRenderer.prototype.render = function (...args: unknown[]) {
        const start = performance.now();
        render.apply(this, args);
        durations.push(performance.now() - start); intervals.push(start - last); last = start;
        if (durations.length >= 120) { PondRenderer.prototype.render = render; resolve(); }
      };
    });
    durations.sort((a, b) => a - b); intervals.sort((a, b) => a - b);
    return { cells: 128, renderMedianMs: durations[60], renderP95Ms: durations[114], frameMedianMs: intervals[60], frameP95Ms: intervals[114] };
  });
  const metrics = { simulation, rendering };
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    const totals = new Map<string, number>();
    for (const node of profile.nodes) {
      const name = `${node.callFrame.functionName} (${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1})`;
      totals.set(name, (totals.get(name) ?? 0) + (node.hitCount ?? 0));
    }
    console.log('POND_LIVE_CPU_SAMPLES', JSON.stringify([...totals].sort((a, b) => b[1] - a[1]).slice(0, 22)));
    await profiler.detach();
  }
  console.log('POND_PERFORMANCE', JSON.stringify(metrics));
  await testInfo.attach('performance.json', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('crowded-pond.png') });
  expect(errors).toEqual([]);
  // Report timings rather than impose hardware-dependent wall-clock assertions.
  expect(simulation.every(sample => Number.isFinite(sample.p95Ms))).toBe(true);
  expect(await page.evaluate(() => window.__microbiaTest!.world.organisms.filter(p => p.alive).length)).toBe(127);
});
