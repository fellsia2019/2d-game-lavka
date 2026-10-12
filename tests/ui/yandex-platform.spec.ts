import { test, expect, type Page } from '@playwright/test';
import { freshProgress, STORAGE_KEY } from '../../src/storage';

test.skip(process.env.TEST_YANDEX_GAMES !== '1', 'Run against build:yandex with TEST_YANDEX_GAMES=1.');
const sdkScript = `
  const events = {};
  const counts = {ready: 0, starts: 0, stops: 0, reads: 0};
  window.sdkFixture = {counts, emit: event => events[event]?.()};
  window.YaGames = {init: async () => ({
    on: (event, handler) => { events[event] = handler; },
    features: {
      LoadingAPI: {ready: () => {counts.ready++;}},
      GameplayAPI: {start: () => {counts.starts++;}, stop: () => {counts.stops++;}}
    },
    getPayments: async () => ({
      getCatalog: async () => [],
      getPurchases: async () => {counts.reads++; return [];},
      purchase: async () => {throw Error('No configured product');}
    })
  })};
`;
async function boot(page: Page) {
  const p = freshProgress(); p.settings.sound = false; p.settings.music = false;
  await page.addInitScript(({ key, p }) => localStorage.setItem(key, JSON.stringify(p)), { key: STORAGE_KEY, p });
  await page.goto('/');
  await expect(page.locator('.world-hud')).toBeVisible();
}
async function play(page: Page) {
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.game-topbar')).toBeVisible();
  await page.locator('[data-action="skip-lesson"]').click();
}

test('target build loads the archive SDK once, signals readiness, and resumes the exact order after platform pause', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let loads = 0;
  await page.route('**/sdk.js', route => { loads++; return route.fulfill({ contentType: 'text/javascript', body: sdkScript }); });
  await boot(page);
  await expect.poll(() => page.evaluate(() => (window as any).sdkFixture?.counts.ready)).toBe(1);
  expect(loads).toBe(1);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('[data-action="no-ads"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await play(page);
  const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await expect.poll(() => page.evaluate(() => (window as any).sdkFixture.counts.starts)).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).sdkFixture.emit('game_api_pause'));
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await page.locator('.slot.occupied').first().dispatchEvent('click');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  await page.evaluate(() => (window as any).sdkFixture.emit('game_api_resume'));
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  await expect.poll(() => page.evaluate(() => (window as any).sdkFixture.counts.starts)).toBeGreaterThan(1);
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  expect(errors).toEqual([]);
});

for (const failure of ['script', 'initialization'] as const) test(`SDK ${failure} failure leaves local gameplay usable without an offer`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/sdk.js', route => failure === 'script' ? route.abort('failed')
    : route.fulfill({ contentType: 'text/javascript', body: 'window.YaGames = {init: async () => {throw Error("Fixture initialization failed");}};' }));
  await boot(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('[data-action="no-ads"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await play(page);
  await page.locator('.slot.occupied').first().click();
  await expect(page.locator('.slot.selected')).toHaveCount(1);
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  expect(errors).toEqual([]);
});
