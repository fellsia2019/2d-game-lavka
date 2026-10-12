import { expect, type Page } from '@playwright/test';
/** Effects finish automatically, then the next normal action becomes usable. */
export async function finishScenePurchase(page:Page, dismissAchievement = true) {
  await expect(page.locator('.world-scene [data-purchase-phase]')).toHaveCount(0);
  await expect(page.locator('.scene-reveal-notice')).toHaveCount(0);
  await expect(page.locator('.scene-reveal-effects')).toHaveCount(0);
  await expect(page.locator('.world-main-action')).toBeEnabled();
  // A completed room now has a one-time medal after its final purchase effect.
  if (dismissAchievement && await page.locator('.modal-achievement').count())
    await page.locator('.modal-achievement .modal-close').click();
}
