import { expect, type Page } from '@playwright/test';
/** Effects finish automatically, then the next normal action becomes usable. */
export async function finishScenePurchase(page:Page) {
  await expect(page.locator('.world-scene [data-purchase-phase]')).toHaveCount(0);
  await expect(page.locator('.scene-reveal-notice')).toHaveCount(0);
  await expect(page.locator('.scene-reveal-effects')).toHaveCount(0);
  await expect(page.locator('.world-main-action')).toBeEnabled();
}
