import { test, expect } from '@playwright/test';

for (const name of ['Euglena', 'Diatom']) {
  test(`${name} grows from dissolved resources and uses its new ability`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tests/browser/fixtures/local.html');
    await page.getByRole('button', { name: `Play as ${name}`, exact: true }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#loading')).toBeHidden();
    await page.evaluate(() => { window.__microbiaTest!.world.organisms = []; });
    await expect(page.locator('.food-guide')).toContainText('Dissolved CO₂');
    await expect(page.locator('.food-guide')).not.toContainText('Your diet: Paramecium');
    await expect(page.locator('#environment-status')).toContainText('Sunlit water');
    await expect.poll(() => page.evaluate(() => window.__microbiaTest!.world.player.mass)).toBeGreaterThan(name === 'Euglena' ? 18.5 : 16.5);
    await expect(page.locator('#ability-status')).toHaveText('Ready');
    await page.evaluate(() => {
      const w = window.__microbiaTest!.world;
      w.player.x = w.arena.spawn.x - 200; w.player.y = w.arena.spawn.y; w.player.heading = Math.PI;
      w.player.motionPath = [{ x: w.player.x, y: w.player.y }];
    });
    await page.locator('#activate-ability').click();
    await expect(page.locator('#ability-status')).toHaveText('Active');
    await expect.poll(() => page.evaluate(() => window.__microbiaTest!.world.player.x)).not.toBe(2200);
    await page.screenshot({ path: testInfo.outputPath(`${name.toLowerCase()}-ability.png`) });
    await page.locator('.nutrient-inventory summary').click();
    await expect(page.locator('#nutrient-inventory')).toContainText(name === 'Euglena' ? 'Ammonium' : 'Dissolved silicate');
    await page.setViewportSize({ width: 800, height: 700 });
    await page.screenshot({ path: testInfo.outputPath(`${name.toLowerCase()}-compact.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const guide = (await page.locator('.food-guide').boundingBox())!, stats = (await page.locator('.growth-card').boundingBox())!;
    expect(guide.y + guide.height).toBeLessThan(stats.y);
    const environment = (await page.locator('#environment-status').boundingBox())!, card = (await page.locator('.species-card').boundingBox())!;
    expect(environment.y + environment.height).toBeLessThan(card.y);
    expect(errors).toEqual([]);
  });
}

test('shade and cold currents give visible feedback with real simulation effects', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/fixtures/local.html');
  await page.getByRole('button', { name: 'Play as Euglena', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const w = window.__microbiaTest!.world;
    w.organisms = []; w.player.x = 3075; w.player.y = 975; w.player.mass = 22;
    w.player.motionPath = [{ x: 3075, y: 975 }];
  });
  await expect(page.locator('#nutrition-status')).toHaveText('Darkness · losing mass');
  await expect.poll(() => page.evaluate(() => window.__microbiaTest!.world.player.mass)).toBeLessThan(21.8);
  await page.screenshot({ path: testInfo.outputPath('deep-shade.png') });
  await page.evaluate(() => {
    const w = window.__microbiaTest!.world;
    w.player.x = 1425; w.player.y = 1650; w.player.motionPath = [{ x: 1425, y: 1650 }];
  });
  await expect(page.locator('#environment-status')).toContainText('Cold current');
  await expect.poll(() => page.evaluate(() => window.__microbiaTest!.world.player.x)).toBeGreaterThan(1445);
  await page.screenshot({ path: testInfo.outputPath('cold-current.png') });
});
