import { test, expect } from '@playwright/test';
test('two browser players share a live pond, own separate cells, and disconnect cleanly', async ({ browser }) => {
  const a = await browser.newPage(), b = await browser.newPage();
  for (const page of [a,b]) { await page.goto('http://127.0.0.1:3000'); await page.locator('#online-mode').check(); await page.locator('#room-name').fill('browser-test'); }
  await a.getByRole('button', { name: 'Play as Didinium', exact: true }).click();
  await b.getByRole('button', { name: 'Play as Paramecium', exact: true }).click();
  await expect(a.locator('canvas')).toBeVisible(); await expect(b.locator('canvas')).toBeVisible();
  await expect(a.getByText(/browser-test.*2\/20 players/)).toBeVisible();
  await a.keyboard.down('d'); await a.waitForTimeout(500); await a.keyboard.up('d');
  await a.keyboard.press('Space');
  await expect(b.getByText(/browser-test.*2\/20 players/)).toBeVisible();
  await b.close();
  await expect(a.getByText(/browser-test.*1\/20 players/)).toBeVisible();
  await a.screenshot({path:'test-results/multiplayer-pond.png'}); await a.close();
});
