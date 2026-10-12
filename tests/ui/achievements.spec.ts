import { test, expect, type Page } from '@playwright/test';
import { freshProgress, STORAGE_KEY, type Progress } from '../../src/storage';
import { projectOrders, projectTasks } from '../../src/campaign';
import { applyDebugSceneState } from '../../src/debug-scene';
import { FINAL_ACHIEVEMENT_ID } from '../../src/achievements';
import { offlineChapterLevel } from '../../src/content-offline';
import { applyMove, initial } from '../../src/engine';
import { createOrderAppearance } from '../../src/order-supplies';
import { settleHallFrame, enterMapBuilding } from './hall-frame';
import { finishScenePurchase } from './scene-purchase';

const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function seed(page: Page, p: Progress) {
  p.settings.sound = false;
  await page.goto('/');
  await page.evaluate(({ key, p }) => localStorage.setItem(key, JSON.stringify(p)), { key: STORAGE_KEY, p });
  await page.reload();
  await expect(page.locator('.world-hud')).toBeVisible();
}
function finalProgress(works = 26, orders = 80) {
  const p = freshProgress();
  expect(applyDebugSceneState(p, { projectId: 'restaurant-1', works, orders }).ok).toBe(true);
  return p;
}
function pinLastOrder(p: Progress) {
  const definition = offlineChapterLevel(840);
  let board = initial(definition);
  for (const move of definition.verifiedSolution.slice(0, -1)) board = applyMove(board, ...move)!;
  p.attempt = { id: 'final-real-order', definition, appearance: createOrderAppearance(definition), board, undo: [], solution: definition.verifiedSolution.slice(-1), mixCount: 0, hints: {}, reward: null };
  p.attempts['restaurant-1'] = p.attempt;
}
const gameplay = ({ achievementsSeen: _, ...p }: Progress) => p;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
  page.on('response', response => { if (response.status() >= 400) list.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('the map has achievements instead of a globe, and returning to a room restores navigation', async ({ page }, info) => {
  await seed(page, freshProgress());
  await page.locator('.world-scene-back').click();
  await expect(page.locator('.on-map .world-globe')).toHaveCount(0);
  const before = await saved(page);
  await page.getByRole('button', { name: 'Достижения', exact: true }).click();
  await expect(page.locator('.modal-achievements')).toBeVisible();
  await expect(page.locator('.achievement-card.is-earned')).toHaveCount(0);
  await expect(page.locator('.achievement-card.is-pending')).toHaveCount(9);
  expect(await saved(page)).toEqual(before);
  await page.screenshot({ path: `docs/screenshots/achievements-start-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('.world-achievements')).toBeFocused();
  await enterMapBuilding(page, 'shop');
  await expect(page.locator('.world-globe')).toBeVisible();
  await expect(page.locator('.world-achievements')).toHaveCount(0);
  await page.locator('.world-globe').click();
  await page.locator('.modal-navigation [data-action="achievements"]').click();
  await expect(page.locator('.modal-achievements')).toBeVisible();
});

test('old completed saves receive the finale once; totals, album, room inspection and replay remain available', async ({ page }, info) => {
  const p = finalProgress();
  delete p.achievementsSeen;
  await seed(page, p);
  const final = page.locator('.modal-achievement');
  await expect(final).toBeVisible();
  await expect(final.locator('h2')).toHaveText('Торговый двор ожил!');
  await expect(final.locator('.achievement-stats')).toContainText('840');
  await expect(final.locator('.achievement-stats')).toContainText('204');
  await expect(final).not.toContainText('6000');
  expect(gameplay(await saved(page))).toEqual(gameplay(p));
  await page.screenshot({ path: `docs/screenshots/achievements-finale-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.world-block-complete')).toBeVisible();
  await expect(final).toHaveCount(0);
  await expect(page.locator('.world-globe')).toHaveCount(0);
  await page.locator('.world-main-action').click();
  await expect(final).toBeVisible();
  await final.locator('[data-action="achievement-map"]').click();
  await expect(page.locator('.world-block-finale')).toContainText('840 заказов · 204 работ');
  await enterMapBuilding(page, 'bakery');
  await expect(page.locator('.world.in-shop')).toHaveAttribute('data-project', 'bakery-1');
  await expect(final).toHaveCount(0);
  await page.locator('.world-scene-back').click();
  const beforeAlbum = await saved(page);
  await page.locator('.world-achievements').click();
  await expect(page.locator('.achievement-card.is-earned')).toHaveCount(9);
  await expect(page.locator('.achievement-card.is-pending')).toHaveCount(0);
  expect(await saved(page)).toEqual(beforeAlbum);
  await page.screenshot({ path: `docs/screenshots/achievements-album-${info.project.name}.png` });
  await page.locator('.achievement-album-summary').click();
  await final.locator('[data-action="achievement-orders"]').click();
  await expect(page.locator('.modal-levels')).toBeVisible();
  await page.locator('.level-entry').first().click();
  await expect(page.locator('.game-topbar')).toBeVisible();
  const opened = await saved(page);
  expect(opened.completed).toEqual(p.completed);
  expect(opened.coins).toEqual(p.coins);
  expect(opened.stars).toEqual(p.stars);
  expect(opened.repairKits).toEqual(p.repairKits);
});

test('a room medal follows its final purchase animation, retaining the canvas and charging once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const p = freshProgress();
  p.completed = projectOrders('shop-1').map(order => order.id);
  const tasks = projectTasks('shop-1');
  p.campaign.completedTasks = tasks.slice(0, -1).map(task => task.id);
  p.stars = tasks.at(-1)!.cost;
  await seed(page, p);
  await settleHallFrame(page);
  await page.evaluate(() => { (window as any).achievementCanvas = document.querySelector('.world-scene canvas'); });
  await page.locator('.world-main-action').click();
  await expect(page.locator('[data-purchase-phase="preparing"]')).toBeVisible();
  await expect(page.locator('.modal-achievement')).toHaveCount(0);
  await expect(page.locator('[data-purchase-phase="revealing"]')).toBeVisible();
  await expect(page.locator('.modal-achievement')).toHaveCount(0);
  await finishScenePurchase(page, false);
  await expect(page.locator('.modal-achievement')).toBeVisible();
  await expect(page.locator('.modal-achievement h2')).toHaveText('Лавка открыта!');
  expect(await page.evaluate(() => document.querySelector('.world-scene canvas') === (window as any).achievementCanvas)).toBe(true);
  const after = await saved(page);
  expect(after.campaign.completedTasks).toEqual(tasks.map(task => task.id));
  expect(after.stars).toBe(0); expect(after.completed).toEqual(p.completed); expect(after.coins).toBe(p.coins);
  expect(after.achievementsSeen).toEqual(['project:shop-1']);
  await page.locator('.modal-achievement [data-action="continue-journey"]').click();
  await expect(page.locator('.world')).toHaveAttribute('data-project', 'warehouse-1');
  await expect(page.locator('.modal-achievement')).toHaveCount(0);
});

for (const remainingWork of [false, true]) test(`last real order ${remainingWork ? 'waits for the last paid work' : 'leads to the finale without extra rewards'}`, async ({ page }) => {
  const p = finalProgress(remainingWork ? 25 : 26, 79);
  pinLastOrder(p);
  if (remainingWork) p.stars = projectTasks('restaurant-1').at(-1)!.cost - 1;
  await seed(page, p);
  await page.locator('.world-main-action[data-action="play"]').click();
  await page.getByRole('button', { name: 'Дебаг', exact: true }).click();
  await page.getByRole('button', { name: 'Пройти уровень', exact: true }).click();
  await expect(page.locator('.modal-result h2')).toHaveText('Все заказы выполнены!');
  await expect(page.locator('.modal-achievement')).toHaveCount(0);
  const reward = await saved(page);
  expect(reward.coins).toBe(p.coins + 60);
  expect(reward.stars).toBe(p.stars + 1);
  expect(reward.completed).toHaveLength(840);
  await expect(page.locator('.modal-result .primary')).toHaveAttribute('data-action', remainingWork ? 'buy-task' : 'celebrate');
  await page.locator('.modal-result .primary').click();
  if (remainingWork) await finishScenePurchase(page, false);
  await expect(page.locator('.achievement-finale')).toBeVisible();
  const completed = await saved(page);
  expect(completed.campaign.completedTasks).toHaveLength(204);
  expect(completed.coins).toBe(reward.coins);
  expect(completed.stars).toBe(remainingWork ? 0 : reward.stars);
  expect(completed.attempt).toEqual(reward.attempt);
  expect(completed.achievementsSeen).toEqual(['project:restaurant-1', FINAL_ACHIEVEMENT_ID]);
  await page.locator('.modal-achievement [data-action="achievement-orders"]').click();
  await page.locator('.level-entry').last().click();
  await page.getByRole('button', { name: 'Дебаг', exact: true }).click();
  await page.getByRole('button', { name: 'Пройти уровень', exact: true }).click();
  await expect(page.locator('.modal-result')).toBeVisible();
  const replayed = await saved(page);
  expect(replayed.completed).toEqual(completed.completed);
  expect(replayed.stars).toBe(completed.stars);
  expect(replayed.repairKits).toBe(completed.repairKits);
  expect(replayed.coins).toBe(completed.coins + 10);
  await expect(page.locator('.modal-result .primary')).toHaveAttribute('data-action', 'achievement-map');
  await page.locator('.modal-result .primary').click();
  await expect(page.locator('.world-map')).toBeVisible();
  await expect(page.locator('.modal-achievement')).toHaveCount(0);
});

test('celebrations fit the viewport, trap keyboard focus and respect motion preferences', async ({ page }, info) => {
  await seed(page, finalProgress());
  const modal = page.locator('.modal-achievement');
  const geometry = await modal.evaluate(element => {
    const r = element.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scroll: document.documentElement.scrollWidth, viewport: innerWidth, internalWidth: element.scrollWidth, width: element.clientWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(info.project.use.viewport!.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(info.project.use.viewport!.height);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport); expect(geometry.internalWidth).toBeLessThanOrEqual(geometry.width);
  for (const button of await modal.locator('.achievement-actions button').all()) {
    const r = (await button.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(geometry.bottom - 5);
  }
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    expect(await modal.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  const piece = modal.locator('.achievement-confetti i').first();
  expect(await piece.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await piece.evaluate(element => getComputedStyle(element).animationName)).toBe('achievement-confetti-settle');
  const p = finalProgress(); p.settings.reducedMotion = true;
  await seed(page, p);
  expect(await piece.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});

test('finale and album remain usable on tablets and short screens, including the last medal', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Extra viewport matrix runs once.');
  for (const [width, height] of [[768, 1024], [1024, 768], [360, 400], [640, 360]]) {
    await page.setViewportSize({ width, height });
    await seed(page, finalProgress());
    const modal = page.locator('.modal-achievement');
    for (const button of await modal.locator('.achievement-actions button').all()) {
      await button.scrollIntoViewIfNeeded();
      const geometry = await button.evaluate(element => {
        const r = element.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
      expect(geometry.w).toBeGreaterThanOrEqual(44); expect(geometry.h).toBeGreaterThanOrEqual(44);
      expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(height);
      expect(geometry.hit).toBe(true);
    }
    await modal.locator('[data-action="achievements"]').click();
    const last = page.locator('.achievement-card.is-earned').last();
    await last.scrollIntoViewIfNeeded();
    await expect(page.locator('.modal-achievements .modal-close')).toBeVisible();
    await last.click();
    await expect(page.locator('.modal-achievement h2')).toHaveText('Ресторан открыт!');
    await page.keyboard.press('Escape');
    await expect(page.locator('.world-map')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
