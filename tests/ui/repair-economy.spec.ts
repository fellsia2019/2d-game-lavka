import { test, expect, type Page } from "@playwright/test";
import { CHAPTER } from "../../src/content";
import { offlineChapterLevel } from "../../src/content-offline";
import { initial } from "../../src/engine";
import { SHOP_STEPS } from "../../src/campaign";
import { createOrderAppearance } from "../../src/order-supplies";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";
import { finishScenePurchase } from './scene-purchase';

const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function seed(page: Page, progress: Progress) {
  progress.settings.reducedMotion = true;
  await page.goto("/");
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload();
  await expect(page.locator(".world-hud")).toBeVisible();
}
async function play(page: Page) {
  if (await page.locator('.world-main-action[data-action="show-target"]').count()) await page.locator('.world-main-action[data-action="show-target"]').click();
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator("#order-heading")).toBeVisible();
}
async function auto(page: Page) {
  await page.locator('.game-topbar [data-action="debug-menu"]').click();
  await page.locator('.modal-debug [data-action="debug-auto"]').click();
  await expect(page.locator(".modal-result")).toBeVisible();
}
async function decodeGoods(page: Page, selector = ".good") {
  const images = page.locator(selector);
  expect(await images.count()).toBeGreaterThan(0);
  await images.evaluateAll(async nodes => {
    await Promise.all(nodes.map(async node => {
      const image = node as HTMLImageElement;
      await image.decode();
      if (!image.naturalWidth) throw new Error(`Undecoded image ${image.src}`);
    }));
  });
}
async function repairImages(page: Page, selector = ".good") {
  await decodeGoods(page, selector);
  for (const src of await page.locator(selector).evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src)))
    expect(src).toMatch(/\/material-[a-z]+\.webp$/);
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on("pageerror", error => list.push(error.message));
  page.on("response", response => { if (response.status() >= 400) list.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

test("first legal repair victory awards one kit and no star, exactly once", async ({ page }) => {
  await seed(page, freshProgress());
  await play(page);
  await expect(page.locator('[data-order-kind="repair"]')).toBeVisible();
  await repairImages(page);
  const before = await saved(page);
  await auto(page);
  const after = await saved(page);
  expect(after.attempt!.board.used).toBe(after.attempt!.definition.verifiedSolution.length);
  expect(after.attempt!.reward).toEqual({ coins: 60, stars: 0, repairKits: 1, fresh: true });
  expect(after.repairKits).toBe(before.repairKits + 1);
  expect(after.stars).toBe(before.stars);
  await expect(page.locator('.reward-repairKits strong')).toHaveText("+1");
  await page.reload();
  expect((await saved(page)).repairKits).toBe(after.repairKits);
  expect((await saved(page)).coins).toBe(after.coins);
});

test("stars cannot buy the floor; six repair kits buy it without spending stars", async ({ page }) => {
  const progress = freshProgress();
  progress.completed = CHAPTER.slice(0, 5).map(order => order.id);
  progress.repairKits = 5;
  progress.stars = 100;
  progress.coins = 300;
  await seed(page, progress);
  await expect(page.locator('.world-main-action[data-action="buy-task"]')).toHaveCount(0);
  await expect(page.locator('.world-mission-cost')).toHaveAttribute("aria-label", "5 из 6 ремкомплектов");
  await play(page);
  await auto(page);
  expect((await saved(page)).repairKits).toBe(6);
  await page.locator('.modal-result [data-action="buy-task"]').click();
  await finishScenePurchase(page);
  const after = await saved(page);
  expect(after.campaign.completedTasks).toEqual([SHOP_STEPS[0].id]);
  expect(after.repairKits).toBe(0);
  expect(after.stars).toBe(100);
  expect(after.coins).toBe(360);
});

test("food order 20 awards a star; replay awards only coins", async ({ page }) => {
  const progress = freshProgress();
  progress.completed = CHAPTER.slice(0, 19).map(order => order.id);
  progress.campaign.completedTasks = SHOP_STEPS.slice(0, 3).map(task => task.id);
  progress.coins = 1140;
  await seed(page, progress);
  await play(page);
  await expect(page.locator('[data-order-kind="food"]')).toBeVisible();
  await expect(page.locator('#order-heading')).toHaveText(CHAPTER[19].name);
  await decodeGoods(page);
  expect(await page.locator('.good[src*="material-"]').count()).toBe(0);
  await auto(page);
  let after = await saved(page);
  expect(after.attempt!.reward).toEqual({ coins: 60, stars: 1, repairKits: 0, fresh: true });
  expect(after.stars).toBe(1);
  expect(after.repairKits).toBe(0);
  await page.locator('.modal-result [data-action="home"]').click();
  await page.locator('.world-hud [data-action="levels"]').click();
  await page.locator('.level-entry[data-level="20"]').click();
  await auto(page);
  after = await saved(page);
  expect(after.attempt!.reward).toEqual({ coins: 10, stars: 0, repairKits: 0, fresh: false });
  expect(after.coins).toBe(1210);
  expect(after.stars).toBe(1);
  expect(after.repairKits).toBe(0);
});

test("pinned repair appearance survives undo, reserve drag, help, restart and reload", async ({ page }, info) => {
  const progress = freshProgress();
  progress.completed = CHAPTER.slice(0, 9).map(order => order.id);
  progress.campaign.completedTasks = [SHOP_STEPS[0].id];
  progress.repairKits = 3;
  progress.coins = 540;
  const definition = offlineChapterLevel(10);
  const appearance = { ...createOrderAppearance(definition), title: "Стены: закреплённый комплект" };
  progress.attempt = { id: "pinned-repair-ui", definition, appearance, board: initial(definition), undo: [],
    solution: structuredClone(definition.verifiedSolution), mixCount: 0, hints: {}, reward: null };
  await seed(page, progress);
  await play(page);
  await expect(page.locator('#order-heading')).toHaveText(appearance.title);
  await repairImages(page, '.orders .good, .slot .good, .rear-preview .good');
  expect(await page.locator('.rear-preview .good').count()).toBeGreaterThan(0);
  const [from, to] = definition.verifiedSolution[0];
  await page.locator(`[data-slot="${from.join(',')}"]`).click();
  await page.locator(`[data-slot="${to.join(',')}"]`).click();
  expect((await saved(page)).attempt!.board.used).toBe(1);
  await page.locator('[data-action="undo"]').click();
  expect((await saved(page)).attempt!.appearance).toEqual(appearance);
  expect((await saved(page)).attempt!.board.used).toBe(0);
  await page.locator('[data-action="help"]').click();
  await repairImages(page, '.modal-help .good');
  await expect(page.locator('.modal-help')).toContainText(appearance.line);
  await page.locator('.modal-help .primary[data-action="close"]').click();
  await page.locator('[data-action="reserve"]').click();
  const source = page.locator(`[data-slot="${from.join(',')}"]`);
  const destination = page.locator('.tray-tool .slot');
  const sourceBox = (await source.boundingBox())!, destinationBox = (await destination.boundingBox())!;
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 18, sourceBox.y + sourceBox.height / 2 - 10, { steps: 3 });
  await repairImages(page, '.drag-good .good');
  await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + destinationBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await repairImages(page, '.tray-tool .good');
  expect((await saved(page)).attempt!.appearance).toEqual(appearance);
  await page.locator('[data-action="restart"]').click();
  await page.locator('[data-action="confirm-restart"]').click();
  expect((await saved(page)).attempt!.appearance).toEqual(appearance);
  expect((await saved(page)).attempt!.definition).toEqual(definition);
  await page.reload();
  await play(page);
  expect((await saved(page)).attempt!.appearance).toEqual(appearance);
  await repairImages(page);
  // Documentation shows the ordinary authored briefing; the custom pinned text was verified above.
  progress.attempt!.appearance = createOrderAppearance(definition);
  await seed(page, progress);
  await play(page);
  await repairImages(page);
  await page.screenshot({ path: `docs/screenshots/repair-order-${info.project.name === 'desktop' ? 'desktop' : 'mobile'}.png`, fullPage: true });
});

test("three wallet chips and four navigation targets fit desktop, tablet and short 360px", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Viewport matrix runs once.");
  const progress = freshProgress();
  progress.stars = 421; progress.repairKits = 179; progress.coins = 1800;
  await seed(page, progress);
  for (const [width, height] of [[1280,900], [768,1024], [360,640], [360,400]]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => {
      const box = (node: Element) => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
      return { hud:box(document.querySelector('.world-hud')!),
        nav:[...document.querySelectorAll('.world-hud > button')].map(box),
        chips:[...document.querySelectorAll('.world-currency')].map(box),
        text:[...document.querySelectorAll('.world-currency b')].map(node => ({...box(node), scroll:node.scrollWidth, client:node.clientWidth})),
        items:[...document.querySelectorAll('.world-hud > *')].map(box) };
    });
    expect(geometry.nav).toHaveLength(4);
    expect(geometry.chips).toHaveLength(3);
    for (const button of geometry.nav) {
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }
    for (const box of [...geometry.items, ...geometry.chips]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(geometry.hud.y);
      expect(box.bottom).toBeLessThanOrEqual(geometry.hud.bottom);
    }
    for (let i=1;i<geometry.items.length;i++) expect(geometry.items[i].x).toBeGreaterThanOrEqual(geometry.items[i-1].right);
    for (const text of geometry.text) expect(text.scroll).toBeLessThanOrEqual(text.client + 1);
    if (width === 360) expect(geometry.hud.height).toBe(56);
    await expect(page.locator('.currency-coins')).toHaveAttribute('aria-label','1800 монет');
    await expect(page.locator('.currency-coins b')).toHaveText('1.8k');
    if (height === 640) await page.screenshot({path:'docs/screenshots/repair-wallet-mobile.png',fullPage:true});
  }
});
