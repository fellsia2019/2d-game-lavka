import { test, expect, type Page } from "@playwright/test";
import { CHAPTER, chapterLevel } from "../../src/content";
import { orderCurrency, projectTasks, TASKS } from "../../src/campaign";
import { createOrderAppearance } from "../../src/order-supplies";
import { applyMove, initial } from "../../src/engine";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";

async function seedOrder(page: Page, number = 4) {
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, number - 1).map(order => order.id);
  p.coins = (number - 1) * 60;
  p.campaign.completedTasks = number > 19 ? projectTasks("shop-1").slice(0,3).map(task => task.id) : [];
  for (const currency of ["repairKits", "stars"] as const)
    p[currency] = p.completed.filter(id => orderCurrency(id) === currency).length - TASKS.filter(task => task.currency === currency && p.campaign.completedTasks.includes(task.id)).reduce((sum, task) => sum + task.cost, 0);
  const definition = chapterLevel(number);
  p.attempt = { id: "debug-ui-pinned", definition, appearance: createOrderAppearance(definition), board: initial(definition), undo: [],
    solution: structuredClone(definition.verifiedSolution), mixCount: 0, hints: {}, reward: null };
  await page.goto("/");
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: p });
  await page.reload();
  return p;
}
const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function openDebug(page: Page) {
  const direct=page.locator('.world-debug-control,.game-topbar [data-action="debug-menu"]');
  await direct.click();
  await expect(page.getByRole('dialog', {name: 'Дебаг', exact: true})).toBeVisible();
}
async function auto(page: Page) {
  await openDebug(page);
  await expect(page.getByRole("dialog", { name: "Дебаг", exact: true })).toBeVisible();
  await page.locator('[data-action="debug-auto"]').click();
}

test("Debug menu and stop control fit the viewport with usable touch targets", async ({ page }, info) => {
  await seedOrder(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  const launch = page.getByRole('button', {name:'Дебаг', exact:true});
  await expect(launch).toBeEnabled();
  const launchBounds = await launch.boundingBox();
  expect(launchBounds!.width).toBeGreaterThanOrEqual(44);
  expect(launchBounds!.height).toBeGreaterThanOrEqual(44);
  expect(launchBounds!.x + launchBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await openDebug(page);
  const dialog = page.getByRole("dialog", { name: "Дебаг", exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  // The scene-review form intentionally scrolls on short screens. Every action
  // must fit after scrolling, with the original bounds and touch-size checks.
  const targets = dialog.locator(".debug-menu button");
  for (let index = 0; index < await targets.count(); index++) {
    const button = targets.nth(index);
    await button.scrollIntoViewIfNeeded();
    const target = await button.evaluate(element => {
      const r = element.getBoundingClientRect();
      return { height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.left).toBeGreaterThanOrEqual(0);
    expect(target.right).toBeLessThanOrEqual(bounds.width);
    expect(target.top).toBeGreaterThanOrEqual(0);
    expect(target.bottom).toBeLessThanOrEqual(bounds.height);
  }
  await page.locator('[data-action="debug-auto"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("debug-menu.png"), fullPage: true });
  await page.locator('[data-action="debug-auto"]').click();
  const stop = page.locator(".debug-run-control");
  await expect(stop).toBeVisible();
  const stopBounds = await stop.boundingBox();
  expect(stopBounds!.height).toBeGreaterThanOrEqual(44);
  expect(stopBounds!.x).toBeGreaterThanOrEqual(0);
  expect(stopBounds!.x + stopBounds!.width).toBeLessThanOrEqual(bounds.width);
  expect(stopBounds!.y + stopBounds!.height).toBeLessThanOrEqual(bounds.height);
  await page.screenshot({ path: info.outputPath("debug-running.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(stop).toBeHidden();
  const paused = await saved(page);
  await page.waitForTimeout(600);
  expect((await saved(page)).attempt).toEqual(paused.attempt);
});

test("Explicit debug autoplay uses moves and the normal one-time reward without changing inventory or Definition", async ({ page }, info) => {
  for (const number of [1, 4, 20]) {
  const original = await seedOrder(page, number);
  await page.locator('.world-main-action[data-action="play"]').click();
  await auto(page);
  await expect(page.getByRole("dialog", { name: "Заказ готов", exact: true })).toBeVisible();
  let p = await saved(page);
  expect(p.attempt!.board.used).toBe(original.attempt!.definition.verifiedSolution.length);
  const repair = number <= 19;
  expect(p.attempt!.reward).toEqual({ coins: 60, stars: repair ? 0 : 1, repairKits: repair ? 1 : 0, fresh: true });
  expect(p.coins).toBe(original.coins + 60);
  expect(p.stars).toBe(original.stars + (repair ? 0 : 1));
  expect(p.repairKits).toBe(original.repairKits + (repair ? 1 : 0));
  expect(p.inventory).toEqual(original.inventory);
  expect(p.attempt!.definition).toEqual(original.attempt!.definition);
  expect(p.attempt!.hints).toEqual({});
  expect(p.attempt!.appearance).toEqual(original.attempt!.appearance);
  await page.screenshot({ path: info.outputPath(`debug-victory-${number}.png`), fullPage: true });
  await page.reload();
  p = await saved(page);
  expect(p.coins).toBe(original.coins + 60);
  expect(p.stars).toBe(original.stars + (repair ? 0 : 1));
  expect(p.repairKits).toBe(original.repairKits + (repair ? 1 : 0));
  expect(p.completed.filter(id => id === original.attempt!.definition.id)).toHaveLength(1);
  }
});
test("Undo and exit cancel pending automatic moves; reload preserves the paused exact attempt", async ({ page }) => {
  const original = await seedOrder(page);
  await auto(page);
  await expect.poll(async () => (await saved(page)).attempt!.board.used).toBeGreaterThan(0);
  await page.locator('[data-action="undo"]').click();
  const paused = await saved(page);
  await page.waitForTimeout(600);
  expect((await saved(page)).attempt).toEqual(paused.attempt);
  expect(paused.attempt!.reward).toBeNull();
  await auto(page);
  await expect.poll(async () => (await saved(page)).attempt!.board.used).toBeGreaterThan(paused.attempt!.board.used);
  await page.locator('.game-topbar [data-action="home"]').click();
  const left = await saved(page);
  await page.waitForTimeout(600);
  expect((await saved(page)).attempt).toEqual(left.attempt);
  await page.reload();
  await page.waitForTimeout(600);
  expect((await saved(page)).attempt).toEqual(left.attempt);
  expect((await saved(page)).stars).toBe(original.stars);
  expect((await saved(page)).repairKits).toBe(original.repairKits);
  await expect(page.locator(".debug-run-control")).toBeHidden();
});
test("Stopping an altered board is free, and restarting still uses the exact pinned Definition", async ({ page }) => {
  const original = await seedOrder(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  const [from, to] = original.attempt!.definition.verifiedSolution[0];
  await page.locator(`[data-slot="${from.join(",")}"]`).click();
  await page.locator(`[data-slot="${to.join(",")}"]`).click();
  const before = await saved(page);
  await auto(page);
  await page.locator(".debug-run-control").click();
  const stopped = await saved(page);
  await page.waitForTimeout(600);
  expect((await saved(page)).attempt).toEqual(stopped.attempt);
  expect(stopped.inventory).toEqual(before.inventory);
  expect(stopped.coins).toBe(before.coins);
  expect(stopped.stars).toBe(before.stars);
  expect(stopped.repairKits).toBe(before.repairKits);
  await page.locator('[data-action="restart"]').click();
  await page.locator('[data-action="confirm-restart"]').click();
  await auto(page);
  await expect(page.getByRole("dialog", { name: "Заказ готов", exact: true })).toBeVisible();
  expect((await saved(page)).attempt!.definition).toEqual(original.attempt!.definition);
  expect((await saved(page)).inventory).toEqual(original.inventory);
});
test("Debug restart and project orders are available without query parameters and preserve the pinned task", async ({page}) => {
  const original = await seedOrder(page);
  expect(new URL(page.url()).search).toBe('');
  await page.locator('.world-main-action[data-action="play"]').click();
  const [from,to] = original.attempt!.definition.verifiedSolution[0];
  await page.locator(`[data-slot="${from.join(',')}"]`).click();
  await page.locator(`[data-slot="${to.join(',')}"]`).click();
  const changed = await saved(page);
  expect(changed.attempt!.board.used).toBe(1);
  await openDebug(page);
  expect(await saved(page)).toEqual(changed);
  await page.getByRole('button',{name:'Заново этот уровень',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const restarted = await saved(page);
  expect(restarted.attempt!.board).toEqual(initial(original.attempt!.definition));
  expect(restarted.attempt!.definition).toEqual(original.attempt!.definition);
  expect(restarted.attempt!.undo).toEqual([]);
  expect(restarted.coins).toBe(changed.coins);
  expect(restarted.stars).toBe(changed.stars);
  expect(restarted.repairKits).toBe(changed.repairKits);
  expect(restarted.attempt!.appearance).toEqual(changed.attempt!.appearance);
  expect(restarted.inventory).toEqual(changed.inventory);
  await openDebug(page);
  await page.getByRole('button',{name:'Заказы здания',exact:true}).click();
  await expect(page.locator('.modal-levels')).toBeVisible();
  expect(await saved(page)).toEqual(restarted);
  await expect(page.locator('.level-entry[data-level="5"]')).toBeDisabled();
  await page.locator('.modal-levels [data-action="close"]').click();
  await expect(page.getByRole('button',{name:'Дебаг',exact:true})).toBeFocused();
});

test("The first tutorial keeps the direct debug button accessible by keyboard", async ({page}) => {
  await seedOrder(page,1);
  await page.locator('.world-main-action[data-action="play"]').click();
  const debug = page.getByRole('button',{name:'Дебаг',exact:true});
  await expect(debug).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.locator('.coach-skip')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(debug).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Дебаг',exact:true})).toBeVisible();
  await page.locator('.modal-debug .modal-close').click();
  await expect(debug).toBeFocused();
  await debug.click();
  await page.getByRole('button',{name:'Пройти уровень',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Заказ готов',exact:true})).toBeVisible();
});

test("A manual transfer stops autoplay before the next scheduled move", async ({ page }) => {
  const original = await seedOrder(page);
  await auto(page);
  await expect.poll(async () => (await saved(page)).attempt!.board.used).toBeGreaterThan(0);
  const move = await page.evaluate(key => {
    const before = JSON.parse(localStorage.getItem(key)!).attempt;
    const [from, to] = before.solution[0];
    const source = document.querySelector<HTMLButtonElement>(`[data-slot="${from.join(",")}"]`)!;
    const destination = document.querySelector<HTMLButtonElement>(`[data-slot="${to.join(",")}"]`)!;
    source.click(); destination.click();
    return { before: before.board.used, after: JSON.parse(localStorage.getItem(key)!).attempt.board.used };
  }, STORAGE_KEY);
  expect(move.after).toBe(move.before + 1);
  await expect(page.locator(".debug-run-control")).toBeHidden();
  const paused = await saved(page);
  await page.waitForTimeout(600);
  expect((await saved(page)).attempt).toEqual(paused.attempt);
  expect(paused.stars).toBe(original.stars);
  expect(paused.repairKits).toBe(original.repairKits);
});
test("Leaving during a pending worker check never resumes autoplay when its answer arrives", async ({ page, context }) => {
  const original = await seedOrder(page);
  original.attempt!.board = applyMove(original.attempt!.board, ...original.attempt!.solution![0])!;
  original.attempt!.solution = original.attempt!.solution!.slice(1);
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data: original });
  await page.reload();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await context.route(/(?:worker\.ts|\/worker-[^/]+\.js)(?:\?|$)/, async route => { await blocked; await route.continue(); });
  try {
    await auto(page);
    await expect(page.getByRole("button", { name: "Остановить проверку", exact: true })).toBeVisible();
    await page.locator('.game-topbar [data-action="home"]').click();
    const left = await saved(page);
    release();
    await page.waitForTimeout(1200);
    expect((await saved(page)).attempt).toEqual(left.attempt);
    expect((await saved(page)).stars).toBe(original.stars);
  expect((await saved(page)).repairKits).toBe(original.repairKits);
    expect((await saved(page)).inventory).toEqual(original.inventory);
    await expect(page.locator(".debug-run-control")).toBeHidden();
  } finally { release(); }
});
