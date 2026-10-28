import { test, expect } from '@playwright/test';

test('selection explains all five fixed kits and works with keyboard', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.roster-card')).toHaveCount(5);
  await expect(page.locator('.roster')).toContainText('Phagocytosis');
  await expect(page.locator('.roster')).toContainText('Specialist hunter');
  await expect(page.locator('.roster')).toContainText('WEAKNESS');
  await page.screenshot({ path: testInfo.outputPath('species-selection.png') });
  const button = page.getByRole('button', { name: 'Play as Paramecium', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Paramecium caudatum', exact: true })).toBeVisible();
  await expect(page.locator('#ability-status')).toHaveText('Ready');
});

for (const name of ['Amoeba', 'Paramecium', 'Didinium']) {
  test(`${name} can use its kit against a controlled target with solid collisions`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: `Play as ${name}`, exact: true }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#loading')).toBeHidden();
    // Deterministic contact setup for kit regression; live population is tested separately.
    await page.evaluate(async () => {
      const modulePath = '/src/sim/world.ts';
      const { createOrganism } = await import(modulePath);
      const world = window.__microbiaTest!.world;
      world.player.protectedUntil = 0;
      world.organisms = [createOrganism(world.roster['paramecium-caudatum'], world.nutrition, 'test-prey', world.player.x + (world.species.id === 'amoeba-proteus' ? 65 : 90), world.player.y, 16)];
    });
    const bounds = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.keyboard.press('Space');
    await expect(page.locator('#ability-status')).toHaveText(/Active|\d+\.\d+s/);
    if (name !== 'Paramecium') {
      await expect(page.locator('#ability-message')).toHaveText('Prey captured · digesting', { timeout: 7000 });
      await expect(page.locator('#digestion-status')).toContainText('Digesting');
    }
    await page.locator('.nutrient-inventory summary').click();
    await expect(page.locator('#nutrient-inventory')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${name.toLowerCase()}-ability.png`) });
    await page.getByRole('link', { name: 'Change species' }).click();
    await expect(page.locator('.roster-card')).toHaveCount(5);
    expect(errors).toEqual([]);
  });
}

