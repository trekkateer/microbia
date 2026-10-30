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
  await expect(page).toHaveURL(/\/play\?room=1$/);
  await expect(page.getByRole('alert')).toContainText('Could not join the pond');
  expect(joined).toEqual({ speciesId: 'amoeba-proteus', room: '1' });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});

test('shared arena links preserve the room through species selection and refresh', async ({ page }) => {
  await page.route('**/api/lobby', route => route.fulfill({ json: [] }));
  const joins: { speciesId: string; room: string }[] = [];
  await page.route('**/api/join', route => {
    joins.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'Server unavailable' } });
  });
  await page.goto('/play?room=2');
  await expect(page).toHaveURL(/\/\?room=2$/);
  await expect(page.locator('#room-name')).toHaveValue('2');
  expect(joins).toHaveLength(0);
  await page.getByRole('button', { name: 'Play as Paramecium', exact: true }).click();
  await expect(page).toHaveURL(/\/play\?room=2$/);
  await expect(page.getByRole('alert')).toBeVisible();
  expect(joins[0]).toEqual({ speciesId: 'paramecium-caudatum', room: '2' });
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(joins).toHaveLength(2);
  expect(joins[1]).toEqual(joins[0]);
});
