import { test, expect } from '@playwright/test';

test('dividing AI forms a moving colony whose daughters stay together', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  const start = await page.evaluate(async () => {
    const worldPath = '/src/sim/world.ts', reproductionPath = '/src/sim/systems/reproduction.ts';
    const { createOrganism } = await import(worldPath), { reproduce } = await import(reproductionPath);
    const w = window.__microbiaTest!.world;
    w.foodParticles = []; w.dissolvedPatches = []; w.arena = { ...w.arena, zones: [], dissolvedPatches: [] };
    const parent = createOrganism(w.roster['paramecium-caudatum'], w.nutrition, 'colony-founder', w.player.x - 200, w.player.y - 200, 180);
    parent.kind = 'ai'; parent.ai = { profileId: 'forager', mode: 'wander', direction: { x: 0.5, y: 0 }, decisionAt: w.tick + 10000, wanderAt: w.tick + 10000, wanderAngle: 0, targetId: null };
    w.organisms = [parent];
    reproduce(w, parent); reproduce(w, w.organisms[1]); reproduce(w, parent);
    return { colonyId: parent.colonyId, center: w.organisms.reduce((sum, p) => sum + p.x, 0) / 4 };
  });
  await expect.poll(() => page.evaluate(() => {
    const cells = window.__microbiaTest!.world.organisms;
    return cells.reduce((sum, p) => sum + p.x, 0) / cells.length;
  })).toBeGreaterThan(start.center + 100);
  const colony = await page.evaluate(() => window.__microbiaTest!.world.organisms.map(p => ({ x: p.x, y: p.y, colonyId: p.colonyId, alive: p.alive })));
  expect(colony).toHaveLength(4);
  expect(colony.every(p => p.alive && p.colonyId === start.colonyId)).toBe(true);
  for (const a of colony) for (const b of colony) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(300);
  await page.screenshot({ path: testInfo.outputPath('ai-colony.png') });
});

test('the pond renders only five single-celled species, with moving AI', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#population')).toContainText('Single-celled life');
  const before = await page.evaluate(() => window.__microbiaTest!.world.organisms.map(p => ({ x: p.x, y: p.y, speciesId: p.speciesId })));
  expect(new Set(before.map(p => p.speciesId)).size).toBe(5);
  expect(before).toHaveLength(22);
  await expect.poll(() => page.evaluate(start => window.__microbiaTest!.world.organisms.some((p, index) => Math.hypot(p.x - start[index].x, p.y - start[index].y) > 50), before)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('living-pond.png') });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.screenshot({ path: testInfo.outputPath('living-pond-compact.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('a Didinium kills the player and the respawn button returns a fresh, protected organism', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Paramecium', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/sim/world.ts';
    const { createOrganism } = await import(path);
    const world = window.__microbiaTest!.world;
    world.player.protectedUntil = 0;
    const hunter = createOrganism(world.roster['didinium-nasutum'], world.nutrition, 'test-predator', world.player.x + 170, world.player.y);
    hunter.kind = 'ai';
    hunter.ai = { profileId: 'hunter', mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0, wanderAngle: 0, targetId: null };
    world.organisms = [hunter];
  });
  await expect(page.getByRole('region', { name: 'Life ended' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#death-reason')).toHaveText('Eaten by Didinium');
  await expect(page.locator('#respawn')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('life-ended.png') });
  await expect(page.locator('#respawn')).toBeEnabled({ timeout: 6000 });
  await page.locator('#respawn').click();
  await expect(page.getByRole('region', { name: 'Life ended' })).toBeHidden();
  await expect(page.locator('#mass')).toHaveText('25');
  await expect(page.locator('#eaten')).toHaveText('0');
  await expect(page.locator('#ability-status')).toContainText('Settling in');
  expect(await page.evaluate(() => ({ generation: window.__microbiaTest!.world.player.generation, alive: window.__microbiaTest!.world.player.alive }))).toEqual({ generation: 1, alive: true });
  await page.screenshot({ path: testInfo.outputPath('respawned.png') });
  expect(errors).toEqual([]);
});
