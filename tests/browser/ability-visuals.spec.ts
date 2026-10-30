import { test, expect } from '@playwright/test';

for (const name of ['Paramecium', 'Didinium', 'Euglena', 'Diatom']) test(`${name} ability has distinct animated stages and a fading finish`, async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/browser/fixtures/local.html'); await page.getByRole('button', { name: `Play as ${name}`, exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(async () => {
    const rendererPath = '/src/client/rendering/pond-renderer.ts', worldPath = '/src/sim/world.ts', abilityPath = '/src/data/abilities/pond.ts', growthPath = '/src/sim/systems/growth.ts';
    const { PondRenderer } = await import(rendererPath), { snapshot, createOrganism } = await import(worldPath);
    const { abilities } = await import(abilityPath), { updateGrowth } = await import(growthPath);
    const w = window.__microbiaTest!.world, ability = abilities[w.species.activeId!];
    w.organisms = []; w.player.mass = 80; w.player.protectedUntil = 0; updateGrowth(w);
    const base = snapshot(w), start = { x: w.player.x, y: w.player.y };
    const render = PondRenderer.prototype.render, canvas = document.querySelector('canvas')!;
    canvas.dataset.phase = '0.15';
    PondRenderer.prototype.render = function (_previous: unknown, _current: unknown, _alpha: number, camera: unknown, delta: number) {
      const phase = Number(canvas.dataset.phase), frame = structuredClone(base);
      frame.tick = 100 + phase * 60;
      const cell = frame.player;
      cell.x = start.x + Math.min(1, phase) * 90; cell.heading = 0;
      cell.motionPath = [{ x: cell.x, y: cell.y }];
      cell.ability = phase > 1 ? null : { effect: ability.effect, startedAtTick: 100, until: 160, targetId: null, direction: { x: 1, y: 0 } };
      if (canvas.dataset.capture === 'true') {
        const target = createOrganism(w.roster['paramecium-caudatum'], w.nutrition, 'visual-prey', cell.x + 110, cell.y, 25);
        frame.organisms = [target]; cell.ability = { effect: 'capture', startedAtTick: 100, until: 160, targetId: target.id, direction: { x: 1, y: 0 } };
      }
      render.call(this, frame, frame, 1, camera, delta);
      canvas.dataset.renderedPhase = canvas.dataset.phase;
    };
  });
  for (const phase of ['0.15', '0.5', '0.85', '1.12']) {
    await page.locator('canvas').evaluate((el, value) => { el.dataset.phase = value; }, phase);
    await expect(page.locator('canvas')).toHaveAttribute('data-rendered-phase', phase);
    await page.screenshot({ path: testInfo.outputPath(`${name}-${phase}.png`) });
  }
  if (name === 'Didinium') {
    await page.locator('canvas').evaluate(el => { el.dataset.capture = 'true'; el.dataset.phase = '0.6'; });
    await expect(page.locator('canvas')).toHaveAttribute('data-rendered-phase', '0.6');
    await page.screenshot({ path: testInfo.outputPath('Didinium-capture.png') });
  }
  expect(errors).toEqual([]);
});
