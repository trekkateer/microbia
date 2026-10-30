import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/lobby', route => route.fulfill({ json: [{ id: '2', players: 3 }] }));
});

test('homepage uses compact cards and styled, responsive join fields', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.roster-compact .roster-card')).toHaveCount(5);
  await expect(page.locator('.roster-card dl')).toHaveCount(0);
  const card = (await page.locator('.roster-card').first().boundingBox())!;
  expect(card.height).toBeLessThan(340);
  const room = page.getByLabel('Room', { exact: true });
  const name = page.getByRole('textbox', { name: 'Your name', exact: true });
  await expect(room).toHaveCSS('background-color', 'rgb(6, 29, 32)');
  await expect(name).toHaveCSS('background-color', 'rgb(6, 29, 32)');
  await page.getByRole('button', { name: 'Room 2 · 3/20', exact: true }).click();
  await expect(room).toHaveValue('2');
  await expect(page.getByRole('link', { name: 'Species index', exact: true })).toHaveAttribute('href', '/species?room=2');
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = (await name.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('full species details live on the separate index and preserve room and name', async ({ page }) => {
  await page.goto('/?room=2');
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('River');
  await page.getByRole('link', { name: 'Species index', exact: true }).click();
  await expect(page).toHaveURL(/\/species\?room=2$/);
  await expect(page.locator('.roster-full .roster-card dl')).toHaveCount(5);
  await expect(page.getByLabel('Room', { exact: true })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: 'Your name', exact: true })).toHaveValue('River');
});

test('invalid rooms stay on the homepage and valid selections carry the typed name', async ({ page }) => {
  await page.route('**/api/join', route => route.fulfill({ status: 503, json: { error: 'Test server unavailable' } }));
  await page.goto('/');
  const room = page.getByLabel('Room', { exact: true });
  await room.fill('invalid room');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await room.evaluate(node => (node as HTMLInputElement).validity.valid)).toBe(false);
  await room.fill('friends');
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('River');
  const request = page.waitForRequest('**/api/join');
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ room: 'friends', name: 'River', speciesId: 'amoeba-proteus' });
});
