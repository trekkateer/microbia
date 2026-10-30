import { test, expect } from '@playwright/test';
test('hunger bar warns of starvation and shows the death reason',async({page})=>{
  await page.goto('/tests/browser/fixtures/local.html');await page.getByRole('button',{name:'Play as Paramecium',exact:true}).click();
  const bar=page.getByRole('progressbar',{name:'Nourishment',exact:true});
  await expect(bar).toHaveAttribute('aria-valuenow','100');
  await page.evaluate(()=>{const w=window.__microbiaTest!.world;w.organisms=[];w.foodParticles=[];w.player.satiety=0;w.player.hungryTicks=0;w.player.protectedUntil=0;for(const id of Object.keys(w.player.reserves))w.player.reserves[id]=0;});
  await expect(page.locator('#hunger-status')).toContainText('Starving');await expect(bar).toHaveAttribute('aria-valuenow','0');
  await page.evaluate(()=>{window.__microbiaTest!.world.player.hungryTicks=899;});
  await expect(page.locator('#death-panel')).toBeVisible();await expect(page.locator('#death-reason')).toHaveText('Starvation');
});
