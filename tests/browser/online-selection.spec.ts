import { test, expect } from '@playwright/test';

test('selection always joins the shared pond and never starts a local game when the server is unavailable', async ({ page }) => {
  await page.route('**/api/lobby', route => route.fulfill({ json: [] }));
  let joined: { speciesId: string; room: string } | undefined;
  await page.route('**/api/join', route => {
    joined = route.request().postDataJSON();
    return route.fulfill({ status: 503, json: { error: 'Server unavailable' } });
  });
  await page.goto('/');
  await expect(page.locator('#online-mode')).toHaveCount(0);
  await expect(page.getByText('Join a shared pond with other players and bots.')).toBeVisible();
  await page.getByRole('button', { name: 'Play as Amoeba', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not join the pond');
  expect(joined).toEqual({ speciesId: 'amoeba-proteus', room: 'pond' });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});
