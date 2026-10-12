import { test, expect, type Page } from '@playwright/test';
import { freshProgress, STORAGE_KEY } from '../../src/storage';

// This ledger belongs only to the fake platform in this test. Production keeps
// the entitlement in the platform account and never mirrors it into game saves.
const LEDGER = 'test-platform-no-ads-owned';
const currency = 'https://currency.example.test/small.png';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
  page.on('response', response => { if (response.status() >= 400) list.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function boot(page: Page, sdk = false, catalog = true, owned = false) {
  const p = freshProgress(); p.settings.sound = false; p.settings.music = false;
  await page.addInitScript(({ key, p }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(p));
  }, { key: STORAGE_KEY, p });
  if (sdk) {
    await page.route(currency, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="#ffd272" stroke="#8b651b" stroke-width="2"/><path d="M7 7h8M11 7v9" fill="none" stroke="#8b651b" stroke-width="2" stroke-linecap="round"/></svg>' }));
    await page.addInitScript(({ catalog, owned, ledger, currency }) => {
      if (owned) localStorage.setItem(ledger, 'true');
      const events: Record<string, () => void> = {};
      const counts = { purchases: 0, reads: 0, bannersHidden: 0, ads: 0, ready: 0, starts: 0, stops: 0 };
      let decision: ((result: 'approve' | 'cancel' | 'invalid' | 'lost') => void) | undefined;
      const fake = {
        counts,
        emit: (event: string) => events[event]?.(),
        decide: (result: 'approve' | 'cancel' | 'invalid' | 'lost') => decision?.(result),
        grant: () => localStorage.setItem(ledger, 'true'),
      };
      (window as any).paymentFixture = fake;
      window.YaGames = { init: async () => ({
        on: (event: string, handler: () => void) => { events[event] = handler; },
        features: {
          LoadingAPI: { ready: () => { counts.ready++; } },
          GameplayAPI: { start: () => { counts.starts++; }, stop: () => { counts.stops++; } },
        },
        adv: {
          hideBannerAdv: async () => { counts.bannersHidden++; },
          showFullscreenAdv: () => { counts.ads++; },
        },
        getPayments: async () => ({
          getCatalog: async () => catalog ? [{ id: 'disable_ads', title: 'No ads fixture', description: 'Fixture only', price: '199 TST', priceValue: '199', priceCurrencyCode: 'TST', getPriceCurrencyImage: () => currency }] : [],
          getPurchases: async () => { counts.reads++; return localStorage.getItem(ledger) ? [{ productID: 'disable_ads', purchaseToken: 'fixture-receipt' }] : []; },
          purchase: ({ id }: { id: string }) => {
            if (id !== 'disable_ads') throw Error('Wrong product');
            counts.purchases++;
            return new Promise((resolve, reject) => {
              decision = result => {
                decision = undefined;
                if (result === 'approve' || result === 'lost') localStorage.setItem(ledger, 'true');
                events.game_api_resume?.();
                if (result === 'cancel' || result === 'lost') reject(Error('Fixture cancelled/lost response'));
                else resolve({ productID: result === 'invalid' ? 'another-product' : 'disable_ads', purchaseToken: 'fixture-receipt' });
              };
            });
          },
        }),
      }) };
    }, { catalog, owned, ledger: LEDGER, currency });
  }
  await page.goto('/');
  await expect(page.locator('.world-hud')).toBeVisible();
  if (sdk) await expect.poll(() => page.evaluate(() => (window as any).paymentFixture.counts.ready)).toBe(1);
}
async function openOffer(page: Page) {
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('[data-action="no-ads"]').click();
  await expect(page.locator('.modal-no-ads')).toBeVisible();
}
const saved = (page: Page) => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
const counts = (page: Page) => page.evaluate(() => (window as any).paymentFixture.counts);
const decide = (page: Page, result: 'approve' | 'cancel' | 'invalid' | 'lost') => page.evaluate(result => (window as any).paymentFixture.decide(result), result);

test('local preview has one inactive purchase, no invented price or SDK request, and preserves the scene', async ({ page }, info) => {
  const requests: string[] = []; page.on('request', request => { if (request.url().endsWith('/sdk.js')) requests.push(request.url()); });
  await boot(page);
  const before = await saved(page);
  await page.evaluate(() => { (window as any).keptScene = document.querySelector('.world-scene canvas'); });
  await openOffer(page);
  await expect(page.locator('[data-action="no-ads-buy"]')).toBeDisabled();
  await expect(page.locator('[data-action="no-ads-restore"]')).toBeDisabled();
  await expect(page.locator('.no-ads-price')).toHaveCount(0);
  await expect(page.locator('.modal-no-ads')).toContainText('Покупка пока недоступна');
  await expect(page.locator('.no-ads-details')).toHaveText('Реклама при запуске на площадке не меняется.');
  const geometry = await page.locator('.modal-no-ads').evaluate(element => {
    const r = element.getBoundingClientRect();
    return { left: r.left, right: r.right, width: element.clientWidth, scroll: element.scrollWidth, document: document.documentElement.scrollWidth, viewport: innerWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  await page.screenshot({ path: `docs/screenshots/no-ads-local-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-no-ads')).toHaveCount(0);
  expect(await saved(page)).toBe(before);
  expect(await page.evaluate(() => document.querySelector('.world-scene canvas') === (window as any).keptScene)).toBe(true);
  expect(requests).toEqual([]);
});

test('one SDK purchase pauses input, cannot charge twice, restores after clearing game progress, and changes no reward', async ({ page }, info) => {
  await boot(page, true);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.game-topbar')).toBeVisible();
  // The first order deliberately locks settings during its guided transfer.
  await page.locator('[data-action="skip-lesson"]').click();
  await expect.poll(async () => (await counts(page)).starts).toBeGreaterThan(0);
  const before = await saved(page);
  await openOffer(page);
  await expect(page.locator('.no-ads-price')).toHaveText('199 TST');
  await expect(page.locator('.no-ads-currency')).toHaveAttribute('src', currency);
  const buy = page.locator('[data-action="no-ads-buy"]');
  expect((await buy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    expect(await page.locator('.modal-no-ads').evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.screenshot({ path: `docs/screenshots/no-ads-ready-${info.project.name}.png` });
  await buy.click();
  await expect(buy).toBeDisabled();
  await expect(page.locator('.modal-no-ads .modal-close')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-no-ads')).toBeVisible();
  // A dispatched second event must also be blocked by the controller.
  await buy.dispatchEvent('click');
  expect((await counts(page)).purchases).toBe(1);
  await page.evaluate(() => (window as any).paymentFixture.emit('game_api_pause'));
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await expect(page.locator('#overlay')).toHaveAttribute('inert', '');
  expect(await saved(page)).toBe(before);
  await decide(page, 'approve');
  await expect(page.locator('.no-ads-offer')).toHaveClass(/is-owned/);
  await expect(page.locator('#overlay')).not.toHaveAttribute('inert', '');
  await expect(page.locator('[data-action="no-ads-buy"]')).toHaveCount(0);
  expect((await counts(page)).bannersHidden).toBe(1); expect((await counts(page)).ads).toBe(0);
  expect(await saved(page)).toBe(before);
  await page.screenshot({ path: `docs/screenshots/no-ads-owned-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  await expect.poll(async () => (await counts(page)).starts).toBeGreaterThan(1);
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await expect.poll(async () => (await counts(page)).bannersHidden).toBe(1);
  await openOffer(page);
  await expect(page.locator('.no-ads-offer')).toHaveClass(/is-owned/);
  expect((await counts(page)).purchases).toBe(0);
  await expect(page.locator('.no-ads-price')).toHaveCount(0);
});

test('cancellation and invalid receipts grant nothing; a lost response recovers only from the platform ledger', async ({ page }) => {
  await boot(page, true); await openOffer(page);
  const before = await saved(page);
  for (const result of ['cancel', 'invalid'] as const) {
    await page.locator('[data-action="no-ads-buy"]').click();
    await decide(page, result);
    await expect(page.locator('.no-ads-message')).toHaveText('Покупка не завершена. Можно попробовать ещё раз.');
    await expect(page.locator('[data-action="no-ads-buy"]')).toBeEnabled();
    await expect(page.locator('.no-ads-offer')).not.toHaveClass(/is-owned/);
    await expect(page.locator('.modal-close')).toBeVisible();
    expect((await counts(page)).bannersHidden).toBe(0);
    expect(await saved(page)).toBe(before);
  }
  expect((await counts(page)).reads).toBe(3);
  await page.locator('[data-action="no-ads-buy"]').click();
  await decide(page, 'lost');
  await expect(page.locator('.no-ads-offer')).toHaveClass(/is-owned/);
  expect((await counts(page)).reads).toBe(4);
  expect((await counts(page)).bannersHidden).toBe(1);
  expect(await saved(page)).toBe(before);
});

test('restore checks account ownership; a console without the product hides its offer but keeps previous ownership', async ({ page }) => {
  await boot(page, true); await openOffer(page);
  const before = await saved(page);
  await page.locator('[data-action="no-ads-restore"]').click();
  await expect(page.locator('.no-ads-message')).toHaveText('Покупка для этого аккаунта не найдена.');
  await page.evaluate(() => (window as any).paymentFixture.grant());
  await page.locator('[data-action="no-ads-restore"]').click();
  await expect(page.locator('.no-ads-offer')).toHaveClass(/is-owned/);
  expect(await saved(page)).toBe(before);
  expect((await counts(page)).purchases).toBe(0);
});

for (const owned of [false, true]) test(`missing console product ${owned ? 'restores a previous purchase' : 'shows no offer'}`, async ({ page }) => {
  await boot(page, true, false, owned);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  if (owned) {
    await page.locator('[data-action="no-ads"]').click();
    await expect(page.locator('.no-ads-offer')).toHaveClass(/is-owned/);
    expect((await counts(page)).bannersHidden).toBe(1);
  } else await expect(page.locator('[data-action="no-ads"]')).toHaveCount(0);
  expect((await counts(page)).purchases).toBe(0);
});
