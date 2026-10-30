import { test, expect } from '@playwright/test';

test('organism controls and live trackers share one panel without a food guide', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/local.html');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Your organism', exact: true });
  await expect(panel).toBeVisible();
  await expect(page.locator('.food-guide, #food-legend, .growth-card')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Health and growth' })).toBeVisible();
  await expect(panel.getByRole('progressbar', { name: 'Nourishment', exact: true })).toBeVisible();
  await expect(panel.locator('#mass')).toHaveText('25');
  await expect(panel.locator('#activate-ability')).toBeVisible();
  await expect(panel.locator('#reproduce')).toBeVisible();
  await page.setViewportSize({ width: 400, height: 700 });
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
