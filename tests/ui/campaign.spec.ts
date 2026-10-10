import { finishScenePurchase } from './scene-purchase';
import { test, expect, type Page } from "@playwright/test";
import { chooseWorldView, enterMapBuilding } from "./hall-frame";
import { createOrderAppearance, orderSummary } from "../../src/order-supplies";
import { CHAPTER, chapterLevel } from "../../src/content";
import { offlineChapterLevel } from "../../src/content-offline";
import { LEGACY_SHOP_STEPS, SHOP_STEPS, orderCurrency, projectTasks } from "../../src/campaign";
import { initial, applyMove, type Move } from "../../src/engine";
import { cachedHint, freshProgress, rememberHint, STORAGE_KEY, type Progress } from "../../src/storage";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
  page.on("console", message => { if (message.type() === "error") messages.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) messages.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function viewCamera(page: Page, id: string) { await chooseWorldView(page, id); }

const shopTasks = projectTasks("shop-1");
const shopWins = (step: number) => shopTasks.slice(0, step).reduce((sum, task) => sum + task.cost, 0);
function shopProgress(wins: number, step = 0) {
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, wins).map(order => order.id);
  p.campaign.completedTasks = shopTasks.slice(0, step).map(task => task.id);
  p.coins = wins * 60;
  for (const currency of ["repairKits", "stars"] as const)
    p[currency] = p.completed.filter(id => orderCurrency(id) === currency).length - shopTasks
      .filter(task => task.currency === currency && p.campaign.completedTasks.includes(task.id))
      .reduce((sum, task) => sum + task.cost, 0);
  return p;
}
const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function seed(page: Page, data: unknown) {
  await page.goto("/");
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: STORAGE_KEY, data });
  await page.reload();
}
async function transfer(page: Page, move: Move, used: number, afterSelect?: () => Promise<void>) {
  await page.locator(`[data-slot="${move[0].join(",")}"]`).click();
  if (afterSelect) await afterSelect();
  await page.locator(`[data-slot="${move[1].join(",")}"]`).click();
  await expect.poll(async () => (await saved(page)).attempt!.board.used).toBe(used);
}
async function solveOrder(page: Page, number: number) {
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[number - 1].id).title);
  const def = chapterLevel(number);
  for (const [index, move] of def.verifiedSolution.entries()) await transfer(page, move, index + 1);
  await expect(page.getByRole("dialog", { name: "Заказ готов", exact: true })).toBeVisible();
}
async function settleImages(page: Page) {
  await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); await document.fonts.ready; });
  for (const scene of await page.locator('.hall-composition').all()) await expect(scene).toHaveAttribute('data-scene-ready','true');
}
async function frontGoodsGeometry(page: Page) {
  await settleImages(page);
  return page.locator(".shelf .slot.occupied > img").evaluateAll(elements => elements.map(el => {
    const image = el as HTMLImageElement;
    // object-fit: contain preserves the bitmap ratio. Compare the visible
    // bitmap, not the potentially taller img element.
    const scale = Math.min(image.clientWidth / image.naturalWidth, image.clientHeight / image.naturalHeight);
    return { src: image.getAttribute("src")!, width: image.naturalWidth * scale, height: image.naturalHeight * scale };
  }));
}
async function assertGoodsSeating(page: Page) {
  const shelves = await page.locator(".shelf:has(.slots)").evaluateAll(elements => elements.map(shelf => {
    const tray = shelf.querySelector(".shelf-tray")!.getBoundingClientRect();
    return { top: tray.top, height: tray.height, left: tray.left, width: tray.width,
      slots: [...shelf.querySelectorAll(".slot")].map(slot => { const r = slot.getBoundingClientRect(); const image = slot.querySelector("img"); return { center: (r.left + r.right) / 2, bottom: r.bottom, imageBottom: image?.getBoundingClientRect().bottom }; }) };
  }));
  // The approved shelf bitmap's three wells end at y=68%. An item standing
  // on the outer rim instead would pass the equal-size check, but fail here.
  for (const shelf of shelves) for (const [index, slot] of shelf.slots.entries()) {
    const wellCenter = [0.2133, 0.5, 0.7867][index];
    expect(Math.abs(slot.center - (shelf.left + shelf.width * wellCenter))).toBeLessThanOrEqual(1);
    expect(Math.abs(slot.bottom - (shelf.top + shelf.height * .68))).toBeLessThanOrEqual(1);
    if (slot.imageBottom !== undefined) expect(Math.abs(slot.imageBottom - slot.bottom)).toBeLessThanOrEqual(1);
  }
}
async function assertStockFooter(page: Page) {
  const shelves = await page.locator(".shelf").evaluateAll(elements => elements.map(shelf => {
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const footer = shelf.querySelector(".shelf-footer")!;
    const stock = footer.querySelector(".rear-preview");
    return { shelf: rect(shelf), tray: rect(shelf.querySelector(".shelf-tray")!), footer: rect(footer),
      overflow: footer.scrollWidth - footer.clientWidth,
      stockDisplay: stock ? getComputedStyle(stock).display : null,
      items: [...footer.querySelectorAll(".rear-stock,.rear-badge")].map(rect) };
  }));
  for (const { shelf, tray, footer, overflow, stockDisplay, items } of shelves) {
    if (stockDisplay !== null) expect(stockDisplay).not.toBe("none");
    expect(footer.top).toBeGreaterThanOrEqual(tray.bottom - 1);
    expect(footer.bottom).toBeLessThanOrEqual(shelf.bottom + 1);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const item of items) {
      expect(item.left).toBeGreaterThanOrEqual(footer.left - 1);
      expect(item.right).toBeLessThanOrEqual(footer.right + 1);
      expect(item.top).toBeGreaterThanOrEqual(footer.top - 1);
      expect(item.bottom).toBeLessThanOrEqual(footer.bottom + 1);
    }
  }
}

test("Visible restoration goal starts the tutorial, preserves its pinned task and buys the floor after six real rewards", async ({ page }, info) => {
  await page.goto("/");
  // The scene heading remains accessible; the visible mission carries the goal.
  await expect(page.getByRole("heading", { name: "Восстанавливаем лавку", exact: true })).toHaveCount(1);
  await expect(page.locator(".world-mission")).toContainText("Пол лавки");
  await expect(page.locator('.world-scene [data-layer-id="restored-floor"].scene-planned')).toHaveCount(1);
  await expect(page.locator(".world-target")).toBeVisible();
  await expect(page.locator(".campaign-tasks,.campaign-goal,.modal-task")).toHaveCount(0);
  await settleImages(page);
  await page.screenshot({ path: info.outputPath("empty.png"), fullPage: true });
  await page.locator('[data-action="show-map"]').first().click();
  await expect(page.locator(".world-pin")).toHaveCount(6);
  await enterMapBuilding(page,'warehouse');
  await expect(page.locator(".world-mission")).toContainText("Скоро");
  await expect(page.locator('[data-action="buy-task"]')).toHaveCount(0);
  await settleImages(page);
  await page.screenshot({ path: info.outputPath("map.png"), fullPage: true });
  await enterMapBuilding(page,'shop');
  await page.locator(".world-target").click();
  const def = chapterLevel(1), move = def.verifiedSolution[0];
  await expect(page.locator(".coach-spotlight")).toBeVisible();
  await expect(page.locator('[data-action="home"]')).toBeDisabled();
  await page.locator(`[data-slot="${move[0].join(",")}"]`).press("Enter");
  await expect(page.locator(`[data-slot="${move[1].join(",")}"]`)).toBeFocused();
  await page.keyboard.press("Enter");
  const pinned = await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  expect((await saved(page)).attempt).toEqual(pinned.attempt);
  await expect(page.locator(`[data-slot="${def.verifiedSolution[1][0].join(",")}"]`)).toBeFocused();
  for (const [i, step] of def.verifiedSolution.slice(1).entries()) await transfer(page, step, i + 2);
  await expect(page.getByRole("dialog", { name: "Заказ готов", exact: true })).toBeVisible();
  expect((await saved(page)).attempt!.reward).toEqual({ coins: 60, stars: 0, repairKits: 1, fresh: true });
  await page.locator('.modal-result [data-action="home"]').click();
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(1);
  await expect(page.locator('.world-main-action[data-action="buy-task"]')).toHaveCount(0);
  await expect(page.locator(".world-target.ready")).toHaveCount(0);
  // Six material orders really pay the six-kit floor; the tutorial receipt stays pinned.
  for (let number = 2; number <= 6; number++) {
    await page.locator('.world-main-action[data-action="play"]').click();
    await solveOrder(page, number);
    const p = await saved(page);
    expect(p.completed).toHaveLength(number);
    expect(p.coins).toBe(number * 60);
    expect(p.stars).toBe(0);
    expect(p.repairKits).toBe(number);
    expect(p.attempt!.reward).toEqual({ coins: 60, stars: 0, repairKits: 1, fresh: true });
    expect(p.campaign.completedTasks).toEqual([]);
    await page.locator('.modal-result [data-action="home"]').click();
  }
  await expect(page.locator(".world-target.ready")).toBeVisible();
  await expect(page.locator('.world-main-action[data-action="buy-task"]')).toBeVisible();
  await settleImages(page);
  await page.screenshot({ path: info.outputPath("ready.png"), fullPage: true });
  await page.locator(".world-target.ready").click();
  await finishScenePurchase(page);
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(0);
  expect((await saved(page)).campaign.completedTasks).toEqual(["shop-s1-r01"]);
  await expect(page.locator('.world-scene [data-layer-id="restored-floor"]:not(.scene-planned)')).toHaveCount(1);
  await expect(page.locator('.world-scene [data-layer-id="restored-walls"].scene-planned')).toHaveCount(1);
  const purchased = await saved(page);
  for (const angle of ["hall-prep", "hall"]) {
    await viewCamera(page, angle);
    await expect(page.locator(`.world-scene [data-scene-view="${angle}"]`)).toBeVisible();
    await expect(page.locator('.world-scene [data-scene-task="shop-s1-r01"][data-layer-kind="architecture"]:not(.scene-planned)')).not.toHaveCount(0);
    expect(await saved(page)).toEqual(purchased);
    expect((await saved(page)).campaign.completedTasks.filter(id => id === "shop-s1-r01")).toHaveLength(1);
  }
  await page.reload();
  await expect(page.locator('.world-scene [data-layer-id="restored-floor"]:not(.scene-planned)')).toHaveCount(1);
  expect(await saved(page)).toEqual(purchased);
});

test("Thirty real orders fund the first five restoration jobs without opening the warehouse", async ({ page }, info) => {
  await page.goto("/");
  await page.locator('.world-main-action[data-action="play"]').click();
  const thresholds = SHOP_STEPS.map((_, index) => shopWins(index + 1));
  for (let number = 1; number <= 30; number++) {
    await solveOrder(page, number);
    const p = await saved(page);
    expect(p.completed).toHaveLength(number);
    expect(p.coins).toBe(number * 60);
    expect(p.attempt!.reward).toEqual({ coins: 60, stars: number <= 19 ? 0 : 1, repairKits: number <= 19 ? 1 : 0, fresh: true });
    const paid = shopTasks.filter(task => p.campaign.completedTasks.includes(task.id));
    expect(p.repairKits).toBe(Math.min(number, 19) - paid.filter(task => task.currency === "repairKits").reduce((sum, task) => sum + task.cost, 0));
    expect(p.stars).toBe(Math.max(0, number - 19) - paid.filter(task => task.currency === "stars").reduce((sum, task) => sum + task.cost, 0));
    if (thresholds.includes(number)) {
      const index = thresholds.indexOf(number);
      await page.locator('.modal-result [data-action="buy-task"]').click();
      await finishScenePurchase(page);
      expect((await saved(page)).campaign.completedTasks).toEqual(SHOP_STEPS.slice(0, index + 1).map(task => task.id));
      expect((await saved(page)).stars).toBe(0);
      expect((await saved(page)).repairKits).toBe(0);
      if (number === 19) {
        await expect(page.locator('.world-scene [data-layer-id="restored-entrance"]:not(.scene-planned)')).toHaveCount(1);
        await page.reload();
        expect((await saved(page)).completed).toHaveLength(19);
      }
      if (number === 30) {
        await expect(page.locator('.world-scene [data-layer-id="window-lemons"]:not(.scene-planned)')).toHaveCount(1);
        await expect(page.locator('.world-scene [data-layer-id="window-pears"]:not(.scene-planned)')).toHaveCount(1);
      }
      if (number < 30) await page.locator('.world-main-action[data-action="play"]').click();
    } else await page.locator('.modal-result [data-action="next"]').click();
  }
  await expect(page.locator(".world-mission")).toContainText("Основной стеллаж");
  await expect(page.locator(".world-progress")).toContainText("Заказы 30 / 80");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "5");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "14");
  await expect(page.locator(".world-victory")).toHaveCount(0);
  await expect(page.locator('[data-action="appearance"]')).toHaveCount(0);
  await expect(page.locator('.world-scene [data-layer-id="north-cabinet"].scene-planned')).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".world-mission")).toContainText("Основной стеллаж");
  await settleImages(page);
  await page.screenshot({ path: info.outputPath("shop-restored-after-30.png"), fullPage: true });
  await page.locator('[data-action="show-map"]').first().click();
  await enterMapBuilding(page,'warehouse');
  await expect(page.locator(".world-map-status")).toContainText("Завершите все 80 заказов и 14 работ");
  await expect(page.locator('.world-pin[data-area="warehouse"]')).toHaveClass(/locked/);
  await page.locator('[data-action="home"]').first().click();
  await page.locator('.world-hud [data-action="levels"]').click();
  await page.locator('[data-level="1"]').click();
  await expect(page.locator(".coach-spotlight")).toHaveCount(0);
  await solveOrder(page, 1);
  expect((await saved(page)).coins).toBe(30 * 60 + 10);
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(0);
  expect((await saved(page)).attempt!.reward).toEqual({ coins: 10, stars: 0, repairKits: 0, fresh: false });
  expect((await saved(page)).completed).toHaveLength(30);
});

test("The shared main cabinet, stock and bread are purchased once and represented in both registered views", async ({ page }) => {
  for (const step of [5, 6, 7]) {
    const task = shopTasks[step];
    const wins = shopWins(step) + task.cost;
    const p = shopProgress(wins, step);
    const definition = offlineChapterLevel(wins + 1);
    p.attempt = { id: `shared-${task.id}`, definition, appearance: createOrderAppearance(definition), board: initial(definition), undo: [],
      solution: definition.verifiedSolution, hints: {}, mixCount: 0, reward: null };
    p.attempts["shop-1"] = p.attempt;
    await seed(page, p);
    await expect(page.locator(`.world-scene .hall-registered-layer[data-scene-task="${task.id}"].scene-planned`)).not.toHaveCount(0);
    await expect(page.locator(`.world-scene .hall-registered-layer[data-scene-task="${task.id}"]:not(.scene-planned)`)).toHaveCount(0);
    const before = await saved(page);
    await page.locator('.world-main-action[data-action="buy-task"]').click();
    await finishScenePurchase(page);
    const purchased = await saved(page);
    expect(purchased.campaign.completedTasks).toEqual([...before.campaign.completedTasks, task.id]);
    expect(purchased.stars).toBe(0);
    expect(purchased.repairKits).toBe(before.repairKits);
    expect(purchased.coins).toBe(before.coins);
    expect(purchased.attempt).toEqual(before.attempt);
    expect(purchased.attempts).toEqual(before.attempts);
    for (const angle of ["hall-prep", "hall"]) {
      await viewCamera(page, angle);
      await expect(page.locator(`.world-scene .hall-registered-layer[data-scene-task="${task.id}"][data-scene-object="${task.sceneObjectId}"]:not(.scene-planned)`)).not.toHaveCount(0);
      expect((await saved(page)).campaign.completedTasks.filter(id => id === task.id)).toHaveLength(1);
      expect(await saved(page)).toEqual(purchased);
    }
    await page.reload();
    expect(await saved(page)).toEqual(purchased);
  }
});

test("Only the owned counter offers painting, while legacy sign and window preferences remain untouched", async ({ page }) => {
  const p = shopProgress(shopWins(9), 9);
  p.renovations = { counter: "sea", sign: "honey", window: "sea" };
  p.renovation = "honey";
  const definition = offlineChapterLevel(55);
  p.attempt = { id: "cosmetic-pinned", definition, appearance: createOrderAppearance(definition), board: initial(definition), undo: [],
    solution: definition.verifiedSolution, hints: {}, mixCount: 0, reward: null };
  p.attempts["shop-1"] = p.attempt;
  await seed(page, p);
  await page.locator('[data-action="show-map"]').first().click();
  await enterMapBuilding(page,'shop');
  await viewCamera(page, "hall");
  const before = await saved(page);
  await page.locator('[data-action="appearance"]').click();
  await expect(page.getByRole("tab", { name: "Прилавок", exact: true })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Вывеска", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Зелёный уголок", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Коралловый закат", exact: true }).check();
  await page.getByRole("button", { name: "Применить цвет", exact: true }).click();
  await expect(page.locator('.world-scene [data-layer-kind="counter"].hall-color-coral')).toHaveCount(1);
  let after = await saved(page);
  expect(after.renovations).toEqual({ counter: "coral", sign: "honey", window: "sea" });
  for (const key of ["coins", "stars", "repairKits", "inventory", "completed", "campaign", "attempt", "attempts"] as const)
    expect(after[key]).toEqual(before[key]);
  await page.reload();
  await viewCamera(page, "hall");
  await expect(page.locator('.world-scene [data-layer-kind="counter"].hall-color-coral')).toHaveCount(1);
  const complete = after;
  complete.completed = CHAPTER.slice(0, 80).map(order => order.id);
  complete.coins = 4800;
  complete.campaign.completedTasks = shopTasks.map(task => task.id);
  await seed(page, complete);
  await page.locator('[data-action="show-map"]').first().click();
  await enterMapBuilding(page,'shop');
  await viewCamera(page, "hall");
  const funded = await saved(page);
  await page.locator('[data-action="appearance"]').click();
  await expect(page.getByRole("tab", { name: "Вывеска", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Прилавок", exact: true })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Зелёный уголок", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Морская бирюза", exact: true }).check();
  await page.getByRole("button", { name: "Применить цвет", exact: true }).click();
  after = await saved(page);
  expect(after.renovations).toEqual({ counter: "sea", sign: "honey", window: "sea" });
  expect(after.renovation).toBe("honey");
  await expect(page.locator('.world-scene [data-layer-kind="counter"].hall-color-sea')).toHaveCount(1);
  for (const key of ["coins", "stars", "repairKits", "inventory", "completed", "campaign", "attempt", "attempts"] as const)
    expect(after[key]).toEqual(funded[key]);
  await page.reload();
  expect(await saved(page)).toEqual(after);
});

test("Two direct room views preserve the attempt and leave every map entrance clickable", async ({ page }, info) => {
  // Both hall angles are furnished, while the final lighting job keeps the
  // next local project's preview outside this single-room grouping check.
  const p = shopProgress(shopWins(13), 13);
  p.renovations = { sign: "coral", counter: "honey" }; p.renovation = "coral";
  await seed(page, p);
  await page.locator('[data-action="levels"]').click();
  await page.locator('[data-level="4"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[3].id).title);
  await transfer(page, chapterLevel(4).verifiedSolution[0], 1);
  await page.locator('[data-action="home"]').click();
  const pinned = await saved(page);
  await expect(page.locator(".world select")).toHaveCount(0);
  await viewCamera(page, "hall-prep");
  expect(await saved(page)).toEqual(pinned);
  await expect(page.locator(".world-room-switch")).toHaveCount(0);
  await expect(page.locator('.world-hall-view')).toHaveCount(0);
  await chooseWorldView(page, "hall", true);
  await expect(page.locator('.world-scene [data-scene-view="hall"]')).toBeVisible();
  await expect(page.locator('.world-globe')).toBeFocused();
  await settleImages(page);
  await page.screenshot({path: info.outputPath("rooms-direct.png")});
  expect(await saved(page)).toEqual(pinned);
  await viewCamera(page, "hall-prep");
  await expect(page.locator('.world-scene [data-scene-view="hall-prep"]')).toBeVisible();
  expect(await saved(page)).toEqual(pinned);
  await page.locator('.world-hud [data-action="levels"]').click();
  await page.locator('[data-level="4"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[3].id).title);
  expect(await saved(page)).toEqual(pinned);
  await page.locator('.game-topbar [data-action="home"]').click();
  await expect(page.locator('.world-scene [data-scene-view="hall-prep"]')).toBeVisible();
  expect(await saved(page)).toEqual(pinned);
  await page.locator('[data-action="show-map"]').click();
  await expect(page.locator(".world-heading")).toHaveCount(0);
  const clear = await page.locator(".world-pin").evaluateAll(pins => pins.every(pin => {
    const r = pin.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && pin.contains(hit);
  }));
  expect(clear).toBe(true);
  await enterMapBuilding(page,'restaurant');
  await expect(page.locator(".world-mission")).toContainText("Скоро");
  expect(await saved(page)).toEqual(pinned);
});

test("Schema 2 migration preserves the exact puzzle and colors, converts unspent repair credit once", async ({ page }) => {
  const old: any = freshProgress();
  old.schema = 2;
  delete old.repairKits;
  delete old.campaign;
  old.completed = CHAPTER.slice(0, 3).map(order => order.id);
  old.stars = 0; old.coins = 80;
  old.renovations = { sign: "honey" }; old.renovation = "honey";
  const definition = chapterLevel(4), board = initial(definition);
  old.attempt = { id: "old-pinned", definition, board: applyMove(board, ...definition.verifiedSolution[0]),
    undo: [board], solution: definition.verifiedSolution.slice(1), mixCount: 0, hints: {}, reward: null };
  expect(rememberHint(old.attempt, old.attempt.solution)).toBe(true);
  await seed(page, old);
  const migrated = await saved(page);
  expect(migrated.schema).toBe(10);
  expect(migrated.campaign.version).toBe("coastal-campaign-8");
  expect(migrated.campaign.completedTasks).toEqual([]);
  const pinned = { ...old.attempt, appearance: createOrderAppearance(definition) };
  expect(migrated.attempt).toEqual(pinned);
  expect(migrated.coins).toBe(80);
  expect(migrated.stars).toBe(0);
  expect(migrated.repairKits).toBe(3);
  expect(migrated.stars + migrated.repairKits).toBe(3);
  expect(migrated.renovations).toEqual({ sign: "honey" });
  await expect(page.locator('[data-action="appearance"]')).toHaveCount(0);
  await page.reload();
  expect(await saved(page)).toEqual(migrated);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(definition.id).title);
  expect((await saved(page)).attempt).toEqual(pinned);
  old.completed = CHAPTER.slice(0, 10).map(order => order.id);
  old.renovations = { sign: "honey", counter: "coral", window: "sea" };
  old.coins = 600;
  old.attempt = null;
  await seed(page, old);
  await expect(page.locator(".world-mission")).toContainText("Стены лавки");
  await expect(page.locator('.world-scene [data-layer-id="restored-floor"]:not(.scene-planned)')).toHaveCount(1);
  expect((await saved(page)).campaign.completedTasks).toEqual(["shop-s1-r01"]);
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(4);
  expect((await saved(page)).stars + (await saved(page)).repairKits).toBe(4);
  expect((await saved(page)).coins).toBe(600);
  expect((await saved(page)).renovations).toEqual(old.renovations);
  await page.reload();
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(4);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[10].id).title);
});

test("Schema 3 old finale credits the new floor and retains active orders through navigation and reload", async ({ page }) => {
  const old: any = freshProgress();
  old.schema = 3;
  delete old.repairKits;
  old.campaign.version = "coastal-campaign-1";
  old.campaign.completedTasks = LEGACY_SHOP_STEPS.slice(0, 5).map(task => task.id);
  old.completed = CHAPTER.slice(0, 10).map(order => order.id);
  old.coins = 600;
  old.renovations = { sign: "coral", counter: "honey" };
  old.renovation = "coral";
  await seed(page, old);
  const migrated = await saved(page);
  expect(migrated.schema).toBe(10);
  expect(migrated.campaign.version).toBe("coastal-campaign-8");
  expect(migrated.campaign.completedTasks).toEqual(["shop-s1-r01"]);
  expect(migrated.coins).toBe(600);
  expect(migrated.stars).toBe(0);
  expect(migrated.repairKits).toBe(4);
  expect(migrated.stars + migrated.repairKits).toBe(4);
  expect(migrated.renovations).toEqual(old.renovations);
  await page.locator('.world-main-action[data-action="play"]').click();
  await solveOrder(page, 11);
  expect((await saved(page)).coins).toBe(660);
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(5);
  // Five repair kits make the walls affordable; keep that credit and continue through
  // the ordinary order list rather than purchasing from the victory dialog.
  await page.locator('.modal-result [data-action="home"]').click();
  await page.locator('.world-hud [data-action="levels"]').click();
  await page.locator('[data-level="12"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[11].id).title);
  await transfer(page, chapterLevel(12).verifiedSolution[0], 1);
  const pinned = (await saved(page)).attempt;
  await page.locator('[data-action="home"]').click();
  await page.reload();
  // The next wall costs five repair kits, but the pending attempt remains intact.
  await page.locator('.world-hud [data-action="levels"]').click();
  await page.locator('[data-level="12"]').click();
  expect((await saved(page)).attempt).toEqual(pinned);
  for (const [index, move] of chapterLevel(12).verifiedSolution.slice(1).entries()) await transfer(page, move, index + 2);
  await expect(page.getByRole("dialog", { name: "Заказ готов", exact: true })).toBeVisible();
  expect((await saved(page)).completed).toHaveLength(12);
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(6);
  expect((await saved(page)).coins).toBe(720);
});

test("Completed schema 4 orders fund three large jobs and continue at order 21", async ({ page }) => {
  const old: any = freshProgress();
  old.schema = 4;
  delete old.repairKits;
  old.campaign.version = "coastal-campaign-2";
  old.campaign.completedTasks = LEGACY_SHOP_STEPS.slice(0, 8).map(task => task.id);
  old.completed = CHAPTER.slice(0, 20).map(order => order.id);
  old.coins = 1200;
  old.renovations = { sign: "coral", counter: "honey" };
  old.renovation = "coral";
  await seed(page, old);
  const migrated = await saved(page);
  expect(migrated.schema).toBe(10);
  expect(migrated.campaign.version).toBe("coastal-campaign-8");
  expect(migrated.coins).toBe(1200);
  expect(migrated.stars).toBe(1);
  // All nineteen completed repair units are already represented in owned architecture.
  expect(migrated.repairKits).toBe(0);
  expect(migrated.stars + migrated.repairKits).toBe(1);
  expect(migrated.campaign.completedTasks).toEqual(SHOP_STEPS.slice(0, 3).map(task => task.id));
  await expect(page.locator('.world-scene [data-scene-view="hall"]')).toBeVisible();
  await expect(page.locator(".world-mission")).toContainText("Витрина у окна");
  await expect(page.locator('.world-scene [data-layer-id="west-cabinet"].scene-planned')).toHaveCount(1);
  await expect(page.locator(".world-target")).toBeVisible();
  await page.locator('.world-hud [data-action="levels"]').click();
  await expect(page.getByRole("heading", { name: "Заказы", exact: true })).toBeVisible();
  await expect(page.locator('[data-level="21"]')).toBeEnabled();
  await expect(page.locator('[data-level="21"]')).not.toHaveClass(/complete/);
  await page.locator('[data-level="21"]').click();
  await solveOrder(page, 21);
  expect((await saved(page)).coins).toBe(1260);
  expect((await saved(page)).stars).toBe(2);
  expect((await saved(page)).repairKits).toBe(0);
  expect((await saved(page)).completed).toHaveLength(21);
});

test("Future saves remain byte-identical, and another tab blocks stale purchases", async ({ page, context }) => {
  const future = { ...freshProgress(), schema: 11 };
  await seed(page, future);
  const raw = JSON.stringify(future);
  await expect(page.getByRole("dialog", { name: "Обновление игры" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw);
  await page.locator('[data-action="refresh"]').click();
  await expect(page.getByRole("dialog", { name: "Обновление игры" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw);
  await seed(page, freshProgress());
  const other = await context.newPage();
  await other.goto("/");
  await other.locator('.world-main-action[data-action="play"]').click();
  await expect(other.locator("#order-heading")).toBeVisible();
  await expect(page.locator(".modal-sync")).toBeVisible();
  const changed = await saved(other);
  await page.locator('[data-action="refresh"]').click();
  await page.locator('.world-main-action[data-action="play"]').click();
  expect((await saved(page)).attempt).toEqual(changed.attempt);
  await other.close();
});

test("Shelf and goal geometry stays separate across the control viewport matrix", async ({ page }) => {
  const p = shopProgress(9);
  await seed(page, p);
  for (const number of [2, 10]) {
    await page.locator('[data-action="levels"]').click();
    await page.locator(`[data-level="${number}"]`).click();
    if (number === 10) await page.locator('[data-action="confirm-switch"]').click();
    await expect(page.locator("#order-heading")).toBeVisible();
    for (const [width, height] of [[360, 640], [360, 500], [360, 400], [1280, 720], [1024, 400], [640, 360]]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => {
        const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        return { goals: rect(document.querySelector(".orders")!), board: rect(document.querySelector(".board")!),
          shelves: [...document.querySelectorAll(".shelf")].map(rect), slots: [...document.querySelectorAll(".shelf .slot")].map(rect),
          hidden: [...document.querySelectorAll(".rear-preview")].map(el => ({ rear: rect(el), tray: rect(el.closest(".shelf")!.querySelector(".shelf-tray")!) })) };
      });
      expect(geometry.goals.bottom, `${number} at ${width}×${height}`).toBeLessThanOrEqual(geometry.board.top + 1);
      for (const slot of geometry.slots) {
        expect(slot.width).toBeGreaterThanOrEqual(44);
        expect(slot.height).toBeGreaterThanOrEqual(44);
        expect(slot.left).toBeGreaterThanOrEqual(geometry.board.left - 1);
        expect(slot.right).toBeLessThanOrEqual(geometry.board.right + 1);
        expect(slot.top).toBeGreaterThanOrEqual(geometry.board.top - 1);
        expect(slot.bottom).toBeLessThanOrEqual(geometry.board.bottom + 1);
      }
      for (const { rear, tray } of geometry.hidden) expect(rear.top).toBeGreaterThanOrEqual(tray.bottom - 1);
      for (const [i, a] of geometry.shelves.entries()) for (const b of geometry.shelves.slice(i + 1))
        expect(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1).toBe(true);
      await assertGoodsSeating(page);
      await assertStockFooter(page);
    }
    await page.locator('[data-action="home"]').click();
  }
});

for (const [width, height] of [[1280, 900], [768, 1024], [360, 640], [360, 400], [640, 360], [844, 390]]) {
 test(`Room goals and map stay usable without stretching or scrolling at ${width}×${height}`, async ({ page }, info) => {
  // Separate viewport cases retain all 15 renovation states, both frames and map round trips.
  test.setTimeout(300_000);
  for (const step of Array.from({ length: shopTasks.length + 1 }, (_, index) => index)) {
    const p = shopProgress(shopWins(step), step);
    if (step >= 9) p.renovations.counter = "sea";
    if (step >= 14) p.renovations.sign = p.renovation = "sea";
    await seed(page, p);
      await page.setViewportSize({ width, height });
      // ResizeObserver fits the native canvas on the next rendering frame.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      for (const angle of ["hall", "hall-prep"]) {
        await viewCamera(page, angle);
        await expect(page.locator(`.world-scene [data-scene-view="${angle}"]`)).toBeVisible();
        const nextTask = shopTasks[step];
        await expect(page.locator('.world-target')).toHaveCount(nextTask?.primaryView === angle ? 1 : 0);
        const geometry = await page.evaluate(() => {
          const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          const app = document.querySelector("#app")!;
          return { scroll: app.scrollHeight - app.clientHeight, scene: rect(document.querySelector(".world-scene")!),
            controls: [...document.querySelectorAll(".world button")].map(button => ({
              ...rect(button), label: button.getAttribute("aria-label") ?? button.textContent,
            })),
            camera: (() => { const stage = document.querySelector<HTMLElement>(".hall-world-stage")!; const m = new DOMMatrix(getComputedStyle(stage).transform); return { width: stage.clientWidth, height: stage.clientHeight, a: m.a, b: m.b, c: m.c, d: m.d }; })(),
            progress: rect(document.querySelector(".world-progress")!),
            progressHidden: getComputedStyle(document.querySelector(".world-progress")!).clipPath !== "none",
            progressOverflow: document.querySelector(".world-progress")!.scrollWidth - document.querySelector(".world-progress")!.clientWidth };
        });
        expect(geometry.scroll, `stage ${step} at ${width}×${height}`).toBeLessThanOrEqual(1);
        expect(geometry.camera.width).toBe(1536);
        expect(geometry.camera.height).toBe(1024);
        expect(geometry.camera.a).toBeGreaterThan(0);
        expect(geometry.camera.a).toBeCloseTo(geometry.camera.d, 5);
        expect(geometry.camera.b).toBe(0);
        expect(geometry.camera.c).toBe(0);
        expect(geometry.progressHidden).toBe(false);
        if (!geometry.progressHidden) {
          expect(geometry.progress.bottom).toBeLessThanOrEqual(height - 24 + 1);
          expect(geometry.progressOverflow).toBeLessThanOrEqual(1);
        }
        for (const control of geometry.controls) {
          expect(control.width).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
          expect(control.left).toBeGreaterThanOrEqual(-1);
          expect(control.right).toBeLessThanOrEqual(width + 1);
          expect(control.top).toBeGreaterThanOrEqual(-1);
          expect(control.bottom).toBeLessThanOrEqual(height + 1);
        }
        for (const [i, a] of geometry.controls.entries()) for (const b of geometry.controls.slice(i + 1))
          expect(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1,
            `stage ${step} ${angle} at ${width}×${height}: ${a.label} / ${b.label}`).toBe(true);
        expect(await saved(page)).toEqual(p);
        if (step === 0 && width === 640) { await settleImages(page); await page.screenshot({ path: info.outputPath(`room-${angle}-landscape.png`) }); }
      }
      await page.locator('[data-action="show-map"]').first().click();
      const pins = await page.locator(".world-pin").evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
      for (const a of pins) { expect(a.left).toBeGreaterThanOrEqual(0); expect(a.right).toBeLessThanOrEqual(width); expect(a.top).toBeGreaterThanOrEqual(0); expect(a.bottom).toBeLessThanOrEqual(height); }
      for (const [i, a] of pins.entries()) for (const b of pins.slice(i + 1)) expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      if (step === 0 && width === 640) { await settleImages(page); await page.screenshot({ path: info.outputPath("map-landscape.png") }); }
      await enterMapBuilding(page,'shop');
  }
 });
}

test("All shelves and play controls fit a phone in portrait and landscape, including reserve", async ({ page }, info) => {
  const p = shopProgress(9);
  await seed(page, p);
  await page.locator('[data-action="levels"]').click();
  await page.locator('[data-level="10"]').click();
  await expect(page.locator("#order-heading")).toBeVisible();
  await transfer(page, chapterLevel(10).verifiedSolution[0], 1);
  const pinned = (await saved(page)).attempt!;
  const beforeTray = new Map<string, { left: number; right: number; top: number; bottom: number; width: number; height: number }[]>();
  for (const reserve of [false, true]) {
    if (reserve) {
      await page.getByRole("button", { name: /^Лоток/ }).click();
      await expect(page.locator(".tray-tool")).toBeVisible();
    }
    for (const [width, height] of [[1280, 900], [1280, 720], [768, 1024], [360, 640], [390, 844], [640, 360], [844, 390]]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => {
        const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const layout = document.querySelector(".puzzle-layout")!;
        return { scroll: layout.scrollHeight - layout.clientHeight, controls: [...document.querySelectorAll(".shelf .slot,.tray-tool .slot,.tools > button.tool,.utility-bar button")].map(rect),
          field: [...document.querySelectorAll(".board,.shelf .slot")].map(rect),
          tray: document.querySelector(".tray-tool") ? rect(document.querySelector(".tray-tool")!) : null,
          traySlot: document.querySelector(".tray-tool .slot") ? rect(document.querySelector(".tray-tool .slot")!) : null };
      });
      const key = `${width}×${height}`;
      if (!reserve) beforeTray.set(key, geometry.field);
      else {
        const before = beforeTray.get(key)!;
        for (const [index, field] of geometry.field.entries()) for (const dimension of ["left", "right", "top", "bottom", "width", "height"] as const)
          expect(Math.abs(field[dimension] - before[index][dimension]), `${key}: ${dimension}`).toBeLessThanOrEqual(1);
        const tray = geometry.tray!, slot = geometry.traySlot!;
        expect(slot.left).toBeGreaterThanOrEqual(tray.left);
        expect(slot.right).toBeLessThanOrEqual(tray.right);
        expect(slot.top).toBeGreaterThanOrEqual(tray.top);
        expect(slot.bottom).toBeLessThanOrEqual(tray.bottom);
      }
      expect(geometry.scroll, `${reserve ? "reserve" : "normal"} ${width}×${height}`).toBeLessThanOrEqual(1);
      for (const control of geometry.controls) {
        expect(control.width).toBeGreaterThanOrEqual(44);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.top).toBeGreaterThanOrEqual(0);
        expect(control.bottom).toBeLessThanOrEqual(height + 1);
        expect(control.left).toBeGreaterThanOrEqual(0);
        expect(control.right).toBeLessThanOrEqual(width + 1);
      }
      for (const [i, a] of geometry.controls.entries()) for (const b of geometry.controls.slice(i + 1)) expect(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1).toBe(true);
      if (!reserve && [360, 640].includes(width)) { await settleImages(page); await page.screenshot({ path: info.outputPath(`order-10-${width}.png`) }); }
      expect((await saved(page)).attempt!.definition).toEqual(pinned!.definition);
      expect((await saved(page)).attempt!.board.shelves.slice(0, 6)).toEqual(pinned!.board.shelves);
    }
  }
  const fromShelf = pinned.board.shelves.findIndex(shelf => shelf.opened && shelf.front.filter(Boolean).length >= 2);
  const source: [number, number] = [fromShelf, pinned.board.shelves[fromShelf].front.findIndex(Boolean)];
  const tray: [number, number] = [pinned.board.shelves.length, 0];
  await transfer(page, [source, tray], 2);
  for (const [width, height] of [[1280, 900], [360, 640], [640, 360]]) {
    await page.setViewportSize({ width, height });
    await settleImages(page);
    await page.screenshot({ path: info.outputPath(`tray-${width}.png`) });
  }
  await transfer(page, [tray, source], 3);
  await page.locator('[data-action="undo"]').click();
  await page.locator('[data-action="undo"]').click();
  expect((await saved(page)).attempt!.board.shelves.slice(0, 6)).toEqual(pinned.board.shelves);
  await page.locator('[data-action="help"]').click();
  await expect(page.locator('.help-tools')).toContainText('Все заказы можно пройти обычными переносами');
  await page.getByRole('button', { name: /^Играть/ }).click();
  await page.setViewportSize({ width: 640, height: 360 });
  for (const [index, move] of pinned!.definition.verifiedSolution.slice(1).entries()) await transfer(page, move, index + 2);
  await expect(page.getByRole("dialog", { name: "Заказ готов", exact: true })).toBeVisible();
  expect((await saved(page)).completed).toHaveLength(10);
});

test("Order 7 keeps each front product the same size on every shelf throughout hidden row reveals", async ({ page }, info) => {
  const p = shopProgress(6);
  await seed(page, p);
  await page.locator('[data-action="levels"]').click();
  await page.locator('[data-level="7"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[6].id).title);
  const assertSame = (items: Awaited<ReturnType<typeof frontGoodsGeometry>>, expected = new Map<string, { width: number; height: number }>()) => {
    for (const item of items) {
      const first = expected.get(item.src);
      if (!first) expected.set(item.src, item);
      else { expect(Math.abs(first.width - item.width), item.src).toBeLessThanOrEqual(1); expect(Math.abs(first.height - item.height), item.src).toBeLessThanOrEqual(1); }
    }
    return expected;
  };
  for (const [width, height] of [[1280, 900], [1280, 720], [768, 1024], [360, 640], [360, 500], [640, 360], [844, 390]]) {
    await page.setViewportSize({ width, height });
    assertSame(await frontGoodsGeometry(page));
    await assertGoodsSeating(page);
    await assertStockFooter(page);
    const rows = await page.locator(".shelf").evaluateAll(elements => elements.map(shelf => {
      const slots = shelf.querySelector(".slots")!.getBoundingClientRect();
      const tray = shelf.querySelector(".shelf-tray")!.getBoundingClientRect();
      const box = shelf.getBoundingClientRect();
      const stock = shelf.querySelector(".rear-preview");
      return { slotsHeight: slots.height, trayHeight: tray.height, baseline: box.bottom - slots.bottom,
        stockTop: stock && getComputedStyle(stock).display !== "none" ? stock.getBoundingClientRect().top : null, trayBottom: tray.bottom };
    }));
    for (const row of rows) {
      expect(Math.abs(row.slotsHeight - rows[0].slotsHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(row.trayHeight - rows[0].trayHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(row.baseline - rows[0].baseline)).toBeLessThanOrEqual(1);
      if (row.stockTop !== null) expect(row.stockTop).toBeGreaterThanOrEqual(row.trayBottom - 1);
    }
    if ([360, 640, 1280].includes(width) && height !== 500 && height !== 720)
      await page.screenshot({ path: info.outputPath(`order-7-${width}.png`) });
  }
  await page.setViewportSize(info.project.use.viewport!);
  const baseline = assertSame(await frontGoodsGeometry(page));
  const definition = chapterLevel(7);
  const pinned = (await saved(page)).attempt!.definition;
  for (const [index, move] of definition.verifiedSolution.entries()) {
    await transfer(page, move, index + 1, async () => { assertSame(await frontGoodsGeometry(page), baseline); await assertGoodsSeating(page); });
    assertSame(await frontGoodsGeometry(page), baseline);
    await assertGoodsSeating(page);
    await assertStockFooter(page);
    expect((await saved(page)).attempt!.definition).toEqual(pinned);
  }
  await expect(page.getByRole("dialog", { name: "Заказ готов", exact: true })).toBeVisible();
  expect((await saved(page)).attempt!.board.shelves.every(shelf => shelf.rear.length === 0)).toBe(true);
});

test("Later orders show hints only on request, including after reload and undo", async ({ page }) => {
  const noGuidance = async () => {
    await expect(page.locator(".coach-spotlight,.gentle-source,.gentle-dest,.gentle-tool,.hint-source,.hint-dest")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Скрыть подсказку", exact: true })).toHaveCount(0);
  };
  for (const number of [4, 7, 9]) {
    const p = shopProgress(number - 1, number > 6 ? 1 : 0);
    await seed(page, p);
    await page.locator('.world-main-action[data-action="play"]').click();
    await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[number - 1].id).title);
    await noGuidance();
    const pinned = (await saved(page)).attempt!.definition;
    await page.locator('[data-action="hint"]').click();
    await expect(page.locator(".gentle-source")).toHaveCount(1);
    expect((await saved(page)).inventory.hint).toBe(1);
    await page.getByRole("button", { name: "Скрыть подсказку", exact: true }).click();
    await noGuidance();
    await page.locator('[data-action="home"]').click();
    await page.reload();
    await page.locator('.world-main-action[data-action="play"]').click();
    await expect(page.locator("#order-heading")).toBeVisible();
    await noGuidance();
    await page.locator('[data-action="hint"]').click();
    await expect(page.locator(".gentle-source")).toHaveCount(1);
    expect((await saved(page)).inventory.hint).toBe(1); // Previously paid proof remains free.
    const move = cachedHint((await saved(page)).attempt!)![0];
    await transfer(page, move, 1);
    await noGuidance();
    await page.locator('[data-action="undo"]').click();
    await expect.poll(async () => (await saved(page)).attempt!.board.used).toBe(0);
    await noGuidance();
    expect((await saved(page)).attempt!.definition).toEqual(pinned);
  }
});

test("Tools are bought in the store, persist without applying, and spend inventory only when used", async ({ page }, info) => {
  // Nine material deliveries have already paid for the floor; the three-kit
  // remainder cannot buy the next five-kit wall while this order is resumed.
  const p = shopProgress(9, 1);
  p.coins = 600;
  p.inventory = { hint: 0, mix: 0, reserve: 0 };
  const definition = chapterLevel(10), board = initial(definition);
  p.attempt = { id: "store-order-10", definition, appearance: createOrderAppearance(definition), board: applyMove(board, ...definition.verifiedSolution[0])!,
    undo: [board], solution: definition.verifiedSolution.slice(1), mixCount: 0, hints: {}, reward: null };
  p.attempts["shop-1"] = p.attempt;
  await seed(page, p);
  // The home screen visibly identifies the shop, even before a tool runs out.
  await expect(page.locator('.world-store')).toContainText("Магазин");
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.triple-rule,.game-message')).toHaveCount(0);
  await expect(page.locator('.tools')).not.toContainText(/100|200|300|◉/);
  await expect(page.getByRole("button", { name: "Подсказка В магазине", exact: true })).toBeVisible();
  const pinned = (await saved(page)).attempt!;
  await page.getByRole("button", { name: "Подсказка В магазине", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Магазин помощи", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(p);
  await settleImages(page);
  await page.screenshot({ path: info.outputPath("tools-store-funded.png") });
  for (const [kind, coins] of [["hint", 500], ["mix", 300], ["reserve", 0]] as const) {
    await page.locator(`[data-action="buy-tool"][data-tool="${kind}"]`).click();
    const after = await saved(page);
    expect(after.coins).toBe(coins);
    expect(after.inventory[kind]).toBe(1);
    expect(after.attempt).toEqual(pinned);
    expect(after.stars).toBe(p.stars);
    expect(after.repairKits).toBe(p.repairKits);
    expect(after.campaign).toEqual(p.campaign);
  }
  await expect(page.locator('[data-action="buy-tool"]:enabled')).toHaveCount(0);
  for (const [width, height] of [[1280, 900], [360, 640], [640, 360]]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      cards: [...document.querySelectorAll('.store-tool')].map(el => ({ overflow: el.scrollWidth - el.clientWidth })),
      footerTop: document.querySelector('.tool-shop-footer')!.getBoundingClientRect().top,
      buttons: [...document.querySelectorAll('.store-buy')].map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })
    }));
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    for (const card of geometry.cards) expect(card.overflow).toBeLessThanOrEqual(1);
    for (const button of geometry.buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
      expect(button.top).toBeGreaterThanOrEqual(0); expect(button.bottom).toBeLessThanOrEqual(geometry.footerTop);
    }
    await page.locator('.tool-shop-content').evaluate(el => el.scrollTop = 0);
    await settleImages(page);
    await page.screenshot({ path: info.outputPath(`tools-store-${width}.png`) });
  }
  await page.locator('.tool-shop-footer [data-action="leave-tools-shop"]').click();
  expect((await saved(page)).attempt).toEqual(pinned);
  await page.reload();
  await page.locator('.world-main-action[data-action="play"]').click();
  expect((await saved(page)).inventory).toEqual({ hint: 1, mix: 1, reserve: 1 });
  expect((await saved(page)).attempt).toEqual(pinned);
  for (const [width, height] of [[1280, 900], [360, 640], [640, 360]]) {
    await page.setViewportSize({ width, height });
    const labels = await page.locator('.tools > button').evaluateAll(buttons => buttons.flatMap(button => {
      const r = button.getBoundingClientRect();
      return [...button.querySelectorAll('.tool-name,.tool-stock')].map(label => {
        const t = label.getBoundingClientRect();
        return { left: t.left - r.left, right: r.right - t.right, top: t.top - r.top, bottom: r.bottom - t.bottom };
      });
    }));
    for (const label of labels) for (const padding of Object.values(label)) expect(padding).toBeGreaterThanOrEqual(7);
    await settleImages(page);
    await page.screenshot({ path: info.outputPath(`tools-game-${width}.png`) });
  }
  await page.locator('[data-action="hint"]').click();
  await expect.poll(async () => (await saved(page)).inventory.hint).toBe(0);
  expect((await saved(page)).coins).toBe(0);
  expect((await saved(page)).attempt!.board).toEqual(pinned.board);
  expect((await saved(page)).repairKits).toBe(p.repairKits);
  expect((await saved(page)).stars).toBe(p.stars);
  await page.getByRole("button", { name: "Скрыть подсказку", exact: true }).click();
  await page.locator('[data-action="mix"]').click();
  await expect.poll(async () => (await saved(page)).attempt!.mixCount, { timeout: 20_000 }).toBe(1);
  const mixed = await saved(page);
  expect(mixed.inventory.mix).toBe(0);
  expect(mixed.coins).toBe(0);
  expect(mixed.attempt!.definition).toEqual(pinned.definition);
  expect(mixed.attempt!.appearance).toEqual(pinned.appearance);
  expect(mixed.repairKits).toBe(p.repairKits);
  expect(mixed.stars).toBe(p.stars);
  await page.locator('[data-action="reserve"]').click();
  await expect(page.locator('.tray-tool .slot')).toBeVisible();
  const withTray = await saved(page);
  expect(withTray.inventory.reserve).toBe(0);
  expect(withTray.coins).toBe(0);
  expect(withTray.attempt!.definition).toEqual(pinned.definition);
  expect(withTray.attempt!.appearance).toEqual(pinned.appearance);
  expect(withTray.repairKits).toBe(p.repairKits);
  expect(withTray.stars).toBe(p.stars);
  await page.getByRole("button", { name: "Смешать В магазине", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Магазин помощи", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(withTray);
  await expect(page.locator('[data-action="buy-tool"][data-tool="mix"]')).toBeDisabled();
  // A fresh player can inspect later tools but cannot buy them before their lessons.
  const fresh = freshProgress(); fresh.coins = 1000;
  await seed(page, fresh);
  await page.locator('.world-store').click();
  await expect(page.getByRole("heading", { name: "Оформление лавки", exact: true })).toBeVisible();
  await page.locator('.scene-shop [data-action="tools-shop"]').click();
  await expect(page.getByRole("heading", { name: "Магазин помощи", exact: true })).toBeVisible();
  await expect(page.locator('[data-tool="mix"]')).toBeDisabled();
  await expect(page.locator('[data-tool="reserve"]')).toBeDisabled();
  await expect(page.locator('[data-store-tool="reserve"]')).toContainText("С заказа 7");
  expect(await saved(page)).toEqual(fresh);
});
