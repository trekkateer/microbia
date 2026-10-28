import { test, expect } from '@playwright/test';

test('Space rejects distant engulfing, and only the first nearby hunter can attack', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const path = '/src/sim/world.ts'; const { createOrganism } = await import(path);
    const w = window.__microbiaTest!.world;
    w.player.protectedUntil = 0; w.foodParticles = [];
    w.organisms = [createOrganism(w.roster['paramecium-caudatum'], w.nutrition, 'claimed-prey', w.player.x + 110, w.player.y, 16)];
  });
  await page.locator('canvas').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#ability-message')).toHaveText('Move closer to begin engulfing');
  expect(await page.evaluate(() => window.__microbiaTest!.world.player.cooldownUntil)).toBe(0);
  await page.evaluate(async () => {
    const path = '/src/sim/world.ts'; const { createOrganism } = await import(path);
    const w = window.__microbiaTest!.world, prey = w.organisms[0];
    prey.x = w.player.x + 60; prey.y = w.player.y;
    const rival = createOrganism(w.species, w.nutrition, 'second-hunter', prey.x + 60, prey.y);
    rival.heading = Math.PI;
    rival.kind = 'player'; rival.parentId = w.player.id; w.organisms.push(rival);
  });
  const bounds = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => {
    const w = window.__microbiaTest!.world;
    return [w.player, ...w.organisms].filter(p => p.ability?.targetId === 'claimed-prey').length;
  })).toBe(1);
  const firstId = await page.evaluate(() => {
    const w = window.__microbiaTest!.world;
    return [w.player, ...w.organisms].find(p => p.ability?.targetId === 'claimed-prey')!.id;
  });
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(ownerId => {
    const w = window.__microbiaTest!.world, rival = [w.player, ...w.organisms].find(p => p.kind === 'player' && p.id !== ownerId)!;
    return { attacking: [w.player, ...w.organisms].filter(p => p.ability?.targetId === 'claimed-prey').length, rivalCooldown: rival.cooldownUntil, message: rival.abilityMessage };
  }, firstId)).toEqual({ attacking: 1, rivalCooldown: 0, message: 'Prey already under attack' });
  await page.screenshot({ path: testInfo.outputPath('exclusive-engulf.png') });
  await expect.poll(() => page.evaluate(() => { const w = window.__microbiaTest!.world; return [w.player, ...w.organisms].reduce((sum, p) => sum + p.eaten, 0); })).toBe(1);
});

test('engulf silhouette reaches, wraps, seals, swallows and retracts without hiding organelles', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const worldPath = '/src/sim/world.ts', rendererPath = '/src/client/rendering/pond-renderer.ts', growthPath = '/src/sim/systems/growth.ts';
    const { createOrganism, snapshot } = await import(worldPath);
    const { PondRenderer } = await import(rendererPath);
    const { updateGrowth } = await import(growthPath);
    const w = window.__microbiaTest!.world;
    w.organisms = []; w.foodParticles = []; w.player.mass = 100; w.player.protectedUntil = 0;
    w.player.x = 1600; w.player.y = 1200; w.player.motionPath = [{ x: 1600, y: 1200 }]; updateGrowth(w);
    const prey = createOrganism(w.roster['paramecium-caudatum'], w.nutrition, 'visual-prey', 1718, 1200, 45);
    prey.heading = 0.5; w.organisms = [prey];
    const frozen = snapshot(w);
    frozen.player.ability = { effect: 'capture', startedAtTick: 30, until: 57, targetId: prey.id, direction: { x: 1, y: 0 } };
    const render = PondRenderer.prototype.render;
    PondRenderer.prototype.render = function (_previous: unknown, _current: unknown, _alpha: unknown, camera: unknown, delta: number) {
      const canvas = document.querySelector('canvas')!;
      const phase = Number(canvas.dataset.engulfProgress ?? 0.1);
      const angle = Number(canvas.dataset.engulfAngle ?? 0);
      const target = frozen.organisms[0];
      target.x = frozen.player.x + Math.cos(angle) * 118; target.y = frozen.player.y + Math.sin(angle) * 118;
      target.motionPath = [{ x: target.x, y: target.y }];
      frozen.tick = 30 + phase * 27;
      if (canvas.dataset.engulfEnd === 'swallow') {
        target.alive = false; frozen.player.ability = null;
        frozen.player.lastFoodId = `prey:${target.speciesId}`; frozen.player.lastAbsorbedTick = frozen.tick;
      } else if (canvas.dataset.engulfEnd === 'retract') {
        frozen.player.ability = null; target.alive = true;
        target.x += 250; target.motionPath = [{ x: target.x, y: target.y }];
      } else {
        target.alive = true;
        frozen.player.ability = { effect: 'capture', startedAtTick: 30, until: 57, targetId: target.id, direction: { x: 1, y: 0 } };
      }
      render.call(this, frozen, frozen, 1, camera, delta);
      canvas.dataset.engulfRendered = `${phase}:${angle}:${canvas.dataset.engulfEnd ?? ''}`;
    };
  });
  const canvas = page.locator('canvas');
  for (const [name, progress] of [['reaching', 0.22], ['wrapping', 0.60], ['closing', 0.91], ['sealed', 0.99]] as const) {
    await canvas.evaluate((el, p) => { el.dataset.engulfProgress = String(p); }, progress);
    await expect(canvas).toHaveAttribute('data-engulf-rendered', `${progress}:0:`);
    await page.screenshot({ path: testInfo.outputPath(`engulf-${name}.png`) });
  }
  await canvas.evaluate(el => { el.dataset.engulfProgress = '0.7'; el.dataset.engulfAngle = '-1.8'; });
  await expect(canvas).toHaveAttribute('data-engulf-rendered', '0.7:-1.8:');
  await page.screenshot({ path: testInfo.outputPath('engulf-rotated.png') });
  await canvas.evaluate(el => { el.dataset.engulfEnd = 'swallow'; });
  await expect(canvas).toHaveAttribute('data-engulf-rendered', '0.7:-1.8:swallow');
  await page.screenshot({ path: testInfo.outputPath('engulf-swallow.png') });
  await canvas.evaluate(el => { el.dataset.engulfEnd = ''; el.dataset.engulfAngle = '0'; });
  await expect(canvas).toHaveAttribute('data-engulf-rendered', '0.7:0:');
  await canvas.evaluate(el => { el.dataset.engulfEnd = 'retract'; });
  await expect(canvas).toHaveAttribute('data-engulf-rendered', '0.7:0:retract');
  await page.screenshot({ path: testInfo.outputPath('engulf-escape.png') });
  expect(errors).toEqual([]);
});
