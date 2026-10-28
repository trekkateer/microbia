import { test, expect } from '@playwright/test';

test('R divides into two controlled cells, conserves colony biomass and keeps steering both', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#reproduction-status')).toContainText('213.75 mass (95%)');
  await page.evaluate(async () => {
    const path = '/src/sim/systems/growth.ts'; const { updateGrowth } = await import(path);
    const w = window.__microbiaTest!.world; w.organisms = []; w.foodParticles = [];
    w.player.mass = 220; w.player.protectedUntil = 0; w.player.nutrients.silicate = 12;
    updateGrowth(w);
  });
  await expect(page.locator('#reproduction-status')).toHaveText('Ready · 1 cell');
  await page.locator('canvas').focus();
  await page.keyboard.press('r');
  await expect(page.locator('#cell-count')).toContainText('2 cells under your control');
  await expect(page.locator('#mass')).toHaveText('220');
  expect(await page.evaluate(() => {
    const w = window.__microbiaTest!.world, child = w.organisms[0];
    return { kind: child.kind, ai: child.ai, parentMass: w.player.mass, childMass: child.mass, parentStock: w.player.nutrients.silicate, childStock: child.nutrients.silicate };
  })).toEqual({ kind: 'player', ai: null, parentMass: 110, childMass: 110, parentStock: 6, childStock: 6 });
  await page.keyboard.press('r');
  expect(await page.evaluate(() => window.__microbiaTest!.world.organisms.length)).toBe(1);
  const start = await page.evaluate(() => { const w = window.__microbiaTest!.world; return [w.player, ...w.organisms].map(p => ({ id: p.id, x: p.x })); });
  await page.keyboard.down('d');
  try {
    await expect.poll(() => page.evaluate(points => { const w = window.__microbiaTest!.world; return [w.player, ...w.organisms].every(p => p.x > points.find(o => o.id === p.id)!.x + 20); }, start)).toBe(true);
  } finally { await page.keyboard.up('d'); }
  await page.screenshot({ path: testInfo.outputPath('controlled-daughters.png') });
  await page.setViewportSize({ width: 800, height: 700 });
  await page.locator('#reproduce').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('division-compact.png') });
  expect(errors).toEqual([]);
});

test('both controlled cells show their own absorption pulse', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const visualPath = '/src/client/rendering/absorption-pulses.ts';
    const { AbsorptionPulses } = await import(visualPath);
    const update = AbsorptionPulses.prototype.update;
    // Observe the pulse list actually consumed by the renderer, without replacing it.
    AbsorptionPulses.prototype.update = function (...args: unknown[]) {
      const visible = update.apply(this, args);
      document.querySelector('canvas')!.dataset.testPulses = [...visible.keys()].join(',');
      return visible;
    };
    const path = '/src/sim/world.ts'; const { createOrganism } = await import(path);
    const w = window.__microbiaTest!.world;
    w.foodParticles = []; w.player.protectedUntil = 0;
    const child = createOrganism(w.species, w.nutrition, 'feeding-child', w.player.x, w.player.y + 200);
    child.kind = 'player'; child.parentId = w.player.id; w.organisms = [child];
  });
  await expect(page.locator('#cell-count')).toContainText('2 cells');
  for (const id of ['feeding-child', 'local-player']) {
    await page.evaluate(actorId => {
      const w = window.__microbiaTest!.world;
      const actor = [w.player, ...w.organisms].find(cell => cell.id === actorId)!;
      w.foodParticles = [{ id: 0, foodId: 'detritus', x: actor.x, y: actor.y, availableAtTick: w.tick }];
    }, id);
    await expect(page.locator('canvas')).toHaveAttribute('data-test-pulses', id);
    await page.screenshot({ path: testInfo.outputPath(`${id}-absorption.png`) });
    await expect(page.locator('canvas')).toHaveAttribute('data-test-pulses', '');
  }
});

test('movement targeting launches only the closest forward-facing hunter', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const path = '/src/sim/world.ts'; const { createOrganism } = await import(path);
    const w = window.__microbiaTest!.world;
    w.organisms = []; w.foodParticles = []; w.player.protectedUntil = 0;
    w.player.x = 1370; w.player.y = 1200; w.player.motionPath = [{ x: 1370, y: 1200 }];
    const child = createOrganism(w.species, w.nutrition, 'controlled-child', 1670, 1200, 25);
    child.kind = 'player'; child.parentId = w.player.id;
    w.organisms.push(child, createOrganism(w.roster['paramecium-caudatum'], w.nutrition, 'intended-prey', 1735, 1200, 16), createOrganism(w.roster['paramecium-caudatum'], w.nutrition, 'decoy', 1280, 1200, 16));
  });
  await expect(page.locator('#cell-count')).toContainText('2 cells');
  const bounds = (await page.locator('canvas').boundingBox())!;
  // Center is (1520, 1200), with two starting-size cells and a settled growth zoom.
  // Aim well right of center: the right-hand prey is unambiguously closest to it.
  await page.mouse.move(bounds.x + bounds.width * 0.24, bounds.y + bounds.height / 2);
  await page.keyboard.press('d');
  await page.locator('canvas').focus(); await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__microbiaTest!.world.organisms.find(p => p.id === 'controlled-child')?.ability?.targetId)).toBe('intended-prey');
  expect(await page.evaluate(() => window.__microbiaTest!.world.player.cooldownUntil)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('closest-hunter.png') });
  await expect.poll(() => page.evaluate(() => window.__microbiaTest!.world.organisms.find(p => p.id === 'intended-prey')?.alive)).toBe(false);
  expect(await page.evaluate(() => window.__microbiaTest!.world.organisms.find(p => p.id === 'decoy')?.alive)).toBe(true);
});

test('the round continues after one daughter dies, then respawns as one cell after all are lost', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Paramecium', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const path = '/src/sim/world.ts'; const { createOrganism } = await import(path);
    const w = window.__microbiaTest!.world;
    const child = createOrganism(w.species, w.nutrition, 'survivor', 1600, 1400, 90);
    child.kind = 'player'; child.parentId = w.player.id; w.organisms = [child];
    const lifecycle = '/src/sim/systems/lifecycle.ts'; const { killOrganism } = await import(lifecycle);
    killOrganism(w, w.player, 'First cell lost', 30);
  });
  await expect.poll(() => page.evaluate(() => window.__microbiaTest!.world.player.id)).toBe('survivor');
  await expect(page.locator('#death-panel')).toBeHidden();
  await page.evaluate(async () => {
    const lifecycle = '/src/sim/systems/lifecycle.ts'; const { killOrganism } = await import(lifecycle);
    const w = window.__microbiaTest!.world; killOrganism(w, w.player, 'Last cell lost', 30);
  });
  await expect(page.locator('#death-panel')).toBeVisible();
  await expect(page.locator('#respawn')).toBeEnabled({ timeout: 6000 });
  await page.locator('#respawn').click();
  await expect(page.locator('#death-panel')).toBeHidden();
  await expect(page.locator('#cell-count')).toContainText('1 cell under your control');
  await expect(page.locator('#mass')).toHaveText('25');
});
