import { test, expect } from '@playwright/test';

test('resignation blocks the old HUD and offers a fresh run in the same room', async ({ page }) => {
  await page.goto('/tests/browser/fixtures/local.html');
  await page.evaluate(async () => {
    const modulePath = '/src/client/ui/resignation.ts';
    const { showResignation } = await import(modulePath);
    const viewport = document.createElement('main');
    const controls = document.createElement('button'); controls.textContent = 'Respawn'; viewport.append(controls);
    document.querySelector('#app')!.replaceChildren(viewport);
    showResignation(viewport, '2', 'Connection lost. Your run has ended.');
  });
  const dialog = page.getByRole('alertdialog', { name: 'You left the pond.' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Connection lost. Your run has ended.');
  await expect(dialog).toContainText('A bot takes over any surviving cells');
  const restart = dialog.getByRole('link', { name: 'Start a new run' });
  await expect(restart).toHaveAttribute('href', '/?room=2');
  await expect(restart).toBeFocused();
  await expect(page.getByRole('button', { name: 'Respawn' })).toHaveCount(0);
});

