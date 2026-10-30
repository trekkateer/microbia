import { test, expect } from '@playwright/test';

test('top five standings show species-colored safe names, biomass and your own row', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/local.html');
  await page.evaluate(async () => {
    const modulePath = '/src/client/ui/leaderboard.ts';
    const { createLeaderboard } = await import(modulePath);
    const viewport = document.createElement('main'); viewport.className = 'viewport';
    viewport.style.cssText = 'height:800px;position:relative';
    document.querySelector('#app')!.replaceChildren(viewport);
    const board = createLeaderboard(viewport);
    board.update(Array.from({ length: 12 }, (_, i) => ({ id: `player-${i}`, name: i === 0 ? '<b>Hunter</b>' : `Player ${i}`, mass: 200 - i, speciesId: i % 2 ? 'paramecium-caudatum' : 'didinium-nasutum' })), 'player-1');
  });
  const board = page.getByRole('region', { name: 'Top five players and bots by biomass' });
  await expect(board.locator('ol li')).toHaveCount(5);
  await expect(board.locator('.leaderboard-name').first()).toHaveText('<b>Hunter</b>');
  await expect(board.locator('.leaderboard-name b')).toHaveCount(0);
  await expect(board.locator('[data-self="true"]')).toContainText('Player 1 (you)');
  await expect(board.locator('.leaderboard-name').first()).toHaveCSS('color', 'rgb(244, 201, 167)');
  await expect(board.locator('.leaderboard-name').nth(1)).toHaveCSS('color', 'rgb(193, 233, 240)');
  await expect(board.locator('.leaderboard-mass').first()).toHaveText('200.0');
  await expect(board.locator('ol .species-icon')).toHaveCount(5);
  await expect(board.locator('ol .species-icon').first()).toHaveAttribute('data-shape', 'barrel');
  await expect(board.locator('ol .species-icon').nth(1)).toHaveAttribute('data-shape', 'slipper');
});

test('each species has a distinct small icon and bot entries are marked', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/local.html');
  await page.evaluate(async () => {
    const modulePath = '/src/client/ui/leaderboard.ts';
    const { createLeaderboard } = await import(modulePath);
    const viewport = document.createElement('main'); viewport.className = 'viewport';
    document.querySelector('#app')!.replaceChildren(viewport);
    createLeaderboard(viewport).update(['amoeba-proteus', 'paramecium-caudatum', 'didinium-nasutum', 'euglena-gracilis', 'navicula-radiosa'].map((speciesId, i) => ({ id: `bot-${i}`, name: `Bot ${i}`, speciesId, mass: 100 - i, bot: true })), 'human');
  });
  const icons = page.locator('ol .species-icon');
  expect(await icons.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-shape')))).toEqual(['amoeboid', 'slipper', 'barrel', 'flagellate', 'diatom']);
  await expect(page.locator('.leaderboard-name').first()).toHaveText('Bot 0 · bot');
});
