import { test, expect } from '@playwright/test';
import { createWorld } from '../../src/sim/world';
import { pond } from '../../src/data/arenas/pond';
import { amoeba } from '../../src/data/species/amoeba';

test('pond renders and mouse steering eats food', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/browser/fixtures/local.html');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Pond Water', exact: true })).toBeVisible();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#mass')).toHaveText('25');
  await expect(page.locator('#food-legend li')).toHaveCount(4);
  await expect(page.locator('#nutrition-status')).toContainText('Low');
  await expect(page.locator('#energy')).toHaveText(/\d+%/);
  await page.screenshot({ path: testInfo.outputPath('pond-initial.png') });
  const bounds = (await canvas.boundingBox())!;
  const world = createWorld(pond, amoeba);
  const food = [...world.foodParticles].sort((a, b) => Math.hypot(a.x - pond.spawn.x, a.y - pond.spawn.y) - Math.hypot(b.x - pond.spawn.x, b.y - pond.spawn.y))[0];
  const distance = Math.hypot(food.x - pond.spawn.x, food.y - pond.spawn.y);
  await page.mouse.move(bounds.x + bounds.width / 2 + (food.x - pond.spawn.x) / distance * 200, bounds.y + bounds.height / 2 + (food.y - pond.spawn.y) / distance * 200);
  await expect.poll(async () => Number(await page.locator('#eaten').textContent())).toBeGreaterThan(0);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator('#digestion-status')).toContainText('Digesting');
  await page.locator('.nutrient-inventory summary').click();
  await expect(page.getByRole('list', { name: 'Current absorbed nutrients' })).toBeVisible();
  await expect(page.locator('#nutrient-inventory li:not([hidden])')).toHaveCount(5);
  await expect(page.locator('#nutrient-inventory')).toContainText('Reproduction');
  await expect(page.locator('#nutrient-inventory')).not.toContainText('(later)');
  await expect.poll(async () => {
    const values = await page.locator('#nutrient-inventory output').allTextContents();
    return values.some(value => value !== '0');
  }).toBe(true);
  await expect.poll(async () => Number(await page.locator('#mass').textContent())).toBeGreaterThan(25);
  await page.screenshot({ path: testInfo.outputPath('pond-playing.png') });
  expect(errors).toEqual([]);
});

test('keyboard feeding and viewport resize work', async ({ page }, testInfo) => {
  await page.goto('/tests/browser/fixtures/local.html');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  const bounds = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => Number(await page.locator('#eaten').textContent()), { timeout: 12000 }).toBeGreaterThan(0);
  } finally {
    await page.keyboard.up('d');
  }
  await page.setViewportSize({ width: 800, height: 700 });
  await page.locator('.nutrient-inventory summary').click();
  await expect.poll(async () => (await page.locator('canvas').boundingBox())?.width).toBe(752);
  await page.screenshot({ path: testInfo.outputPath('pond-compact.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const guide = (await page.getByRole('region', { name: 'Food guide', exact: true }).boundingBox())!;
  const stats = (await page.getByRole('region', { name: 'Growth stats', exact: true }).boundingBox())!;
  expect(guide.y + guide.height).toBeLessThan(stats.y);
});
