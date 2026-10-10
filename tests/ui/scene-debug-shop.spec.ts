import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectOrders, projectTasks, phaseStatus } from "../../src/campaign";
import { debugScenePreset, type DebugScenePreset } from '../../src/debug-scene';
import { offlineChapterLevel } from "../../src/content-offline";
import { initial } from "../../src/engine";
import { createOrderAppearance } from "../../src/order-supplies";
import { SCENE_SHOP_ITEMS } from "../../src/scene-shop";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";
import { settleHallFrame, enterMapBuilding } from "./hall-frame";
import { scenePNG, scenePNGHash, scenePNGVisualDifference, sceneSourcePixels } from "./scene-pixels";
import { finishScenePurchase } from './scene-purchase';

const screenshotRoot = resolve("docs/screenshots");
mkdirSync(screenshotRoot, { recursive: true });
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "No script errors or failed assets").toEqual([]);
});

async function seed(page: Page, progress = freshProgress()) {
  progress.settings.sound = false;
  await page.goto("/");
  await settleHallFrame(page);
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload();
  await expect(page.locator(".world-hud")).toBeVisible();
}
const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);

async function openDebug(page: Page) {
  const launch = page.locator('.world-debug-control,.game-topbar [data-action="debug-menu"]');
  if (await launch.count()) await launch.first().click();
  else {
    await page.locator('[data-action="settings"]').click();
    await page.getByRole("button", { name: "Дебаг", exact: true }).click();
  }
  await expect(page.locator(".modal-debug")).toBeVisible();
}

async function debugPreset(page: Page, projectId: string, preset: string) {
  await openDebug(page);
  await page.locator('[data-debug-field="project"]').selectOption(projectId);
  await page.locator(`[data-action="debug-scene-preset"][data-preset="${preset}"]`).click();
  await page.locator('[data-action="debug-scene-apply"]').click();
  await expect(page.locator(".modal-debug")).toHaveCount(0);
  await expect(page.locator(".world-hud")).toBeVisible();
  await expect.poll(async () => (await saved(page)).selectedProject).toBe(projectId);
  await finishScenePurchase(page);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: resolve(screenshotRoot, name), fullPage: true });
}

async function expectInsideViewport(page: Page, element: Locator) {
  await element.scrollIntoViewIfNeeded();
  const r = await element.boundingBox(), size = page.viewportSize()!;
  expect(r).not.toBeNull();
  expect(r!.x).toBeGreaterThanOrEqual(-1);
  expect(r!.y).toBeGreaterThanOrEqual(-1);
  expect(r!.x + r!.width).toBeLessThanOrEqual(size.width + 1);
  expect(r!.y + r!.height).toBeLessThanOrEqual(size.height + 1);
  expect(r!.height).toBeGreaterThanOrEqual(44);
  expect(await element.evaluate(control => {
    const rect = control.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === control || (hit !== null && control.contains(hit));
  }), "The visible control receives a pointer at its center").toBe(true);
}

function fundedCounter(): Progress {
  const progress = freshProgress();
  progress.campaign.completedTasks = projectTasks("shop-1").slice(0, 9).map(task => task.id);
  progress.completed = projectOrders("shop-1").slice(0, 50).map(order => order.id);
  progress.coins = 4000;
  progress.stars = 13;
  progress.repairKits = 2;
  progress.renovations.counter = "sea";
  const definition = offlineChapterLevel(51);
  progress.attempt = { id: "scene-shop-pinned", definition, board: initial(definition), undo: [],
    appearance: createOrderAppearance(definition), solution: structuredClone(definition.verifiedSolution),
    mixCount: 0, hints: { exact: structuredClone(definition.verifiedSolution) }, reward: null };
  progress.attempts["shop-1"] = progress.attempt;
  return progress;
}

async function openSceneShop(page: Page) {
  await page.locator('.world-hud [data-action="scene-shop"]').click();
  await expect(page.locator(".modal-scene-shop")).toBeVisible();
}

async function previewFingerprint(page: Page) {
  await expect(page.locator(".scene-shop-preview .hall-composition")).toHaveAttribute("data-scene-ready", "true");
  return scenePNGHash(page, ".scene-shop-preview .hall-world-stage canvas");
}
async function sceneFrame(page: Page) {
  return page.locator(".world-scene canvas").evaluate(canvas => ({
    sourceWidth: (canvas as HTMLCanvasElement).width, sourceHeight: (canvas as HTMLCanvasElement).height,
    width: getComputedStyle(canvas).width, height: getComputedStyle(canvas).height,
    transform: getComputedStyle(canvas.parentElement!).transform,
  }));
}
function rgbDifference(a: number[], b: number[]) {
  let difference = 0;
  for (let index = 0; index < a.length; index += 4)
    difference += Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
  return difference / (a.length / 4 * 3);
}
function unchangedGame(after: Progress, before: Progress) {
  for (const field of ["stars", "repairKits", "completed", "campaign", "inventory", "attempt", "attempts", "renovations", "renovation", "settings"] as const)
    expect(after[field], field).toEqual(before[field]);
}

test("Blank save reaches warehouse I and II through visible debug presets without playing any order", async ({ page }, info) => {
  await seed(page);
  expect(new URL(page.url()).search).toBe("");
  await debugPreset(page, "warehouse-1", "start");
  let progress = await saved(page);
  expect(phaseStatus("shop-1", progress.completed, progress.campaign)).toBe("complete");
  expect(progress.completed).toHaveLength(80);
  expect(projectTasks("warehouse-1").some(task => progress.campaign.completedTasks.includes(task.id))).toBe(false);
  expect(progress.stars).toBe(48);
  expect(progress.repairKits).toBe(32);
  await settleHallFrame(page);
  await screenshot(page, `scene-debug-warehouse-start-${info.project.name}.png`);

  await debugPreset(page, "warehouse-1", "built");
  progress = await saved(page);
  expect(projectTasks("warehouse-1").every(task => progress.campaign.completedTasks.includes(task.id))).toBe(true);
  expect(projectOrders("warehouse-1").some(order => progress.completed.includes(order.id))).toBe(false);
  await page.reload();
  await expect.poll(async () => (await saved(page)).selectedProject).toBe("warehouse-1");
  await debugPreset(page, "warehouse-1", "complete");
  progress = await saved(page);
  expect(phaseStatus("warehouse-1", progress.completed, progress.campaign)).toBe("complete");
  expect(progress.completed).toHaveLength(160);
  await debugPreset(page, "warehouse-2", "middle");
  progress = await saved(page);
  expect(progress.selectedProject).toBe("warehouse-2");
  expect(projectTasks("warehouse-2").filter(task => progress.campaign.completedTasks.includes(task.id))).toHaveLength(10);
  expect(projectOrders("warehouse-2").filter(order => progress.completed.includes(order.id))).toHaveLength(60);
  expect(projectOrders("shop-2").some(order => progress.completed.includes(order.id))).toBe(false);
  expect(progress.attempt).toBeNull();
  expect(progress.coins).toBe(0);
  await settleHallFrame(page);
  await screenshot(page, `scene-debug-warehouse-cold-${info.project.name}.png`);
});

test("Debug currency controls preserve the exact pinned order and custom work/order fields remain editable", async ({ page }) => {
  await seed(page, fundedCounter());
  const before = await saved(page);
  await settleHallFrame(page);
  await openDebug(page);
  for (const [currency, amount] of [["stars", 17], ["repairKits", 9], ["coins", 150]] as const) {
    await page.locator('[data-debug-field="currency"]').selectOption(currency);
    await page.locator('[data-debug-field="amount"]').fill(String(amount));
    await page.locator('[data-action="debug-scene-currency"]').click();
    await expect(page.locator(".modal-debug")).toBeVisible();
  }
  const funded = await saved(page);
  expect(funded.stars).toBe(before.stars + 17);
  expect(funded.repairKits).toBe(before.repairKits + 9);
  expect(funded.coins).toBe(before.coins + 150);
  for (const key of ["attempt", "attempts", "completed", "campaign", "inventory"] as const) expect(funded[key]).toEqual(before[key]);
  await page.locator('[data-debug-field="project"]').selectOption("warehouse-1");
  await page.locator('[data-action="debug-scene-preset"][data-preset="middle"]').click();
  await page.locator('[data-debug-field="works"]').selectOption("7");
  await page.locator('[data-debug-field="orders"]').fill("4");
  await page.locator('[data-action="debug-scene-apply"]').click();
  await finishScenePurchase(page);
  const selected = await saved(page);
  expect(projectTasks("warehouse-1").filter(task => selected.campaign.completedTasks.includes(task.id))).toHaveLength(7);
  expect(projectOrders("warehouse-1").filter(order => selected.completed.includes(order.id))).toHaveLength(4);
  expect(selected.attempts["shop-1"]).toEqual(before.attempt);
  await page.reload();
  expect((await saved(page)).attempts["shop-1"]).toEqual(before.attempt);
});

test("Presets and custom work applied from an open order return to the scene without a null-attempt error", async ({ page }) => {
  for(const preset of ['start','middle','built','complete','custom'] as const) {
    await seed(page);
    await page.locator('.world-main-action[data-action="play"]').click();
    await expect(page.locator('#order-heading')).toBeVisible();
    await openDebug(page);
    const state=preset==='custom'?{projectId:'shop-1' as const,works:3,orders:4}:debugScenePreset('shop-1',preset as DebugScenePreset);
    if(preset==='custom') {
      await page.locator('[data-debug-field="works"]').selectOption(String(state.works));
      await page.locator('[data-debug-field="orders"]').fill(String(state.orders));
    } else await page.locator(`[data-action="debug-scene-preset"][data-preset="${preset}"]`).click();
    await page.locator('[data-action="debug-scene-apply"]').click();
    expect(browserErrors.get(page), "Applying a scene must not render the removed order").toEqual([]);
    await expect(page.locator('.world-hud')).toBeVisible();
    await expect(page.locator('#order-heading')).toHaveCount(0);
    await finishScenePurchase(page);
    const progress=await saved(page);
    expect(progress.campaign.completedTasks).toEqual(projectTasks('shop-1').slice(0,state.works).map(task=>task.id));
    expect(progress.completed).toEqual(projectOrders('shop-1').slice(0,state.orders).map(order=>order.id));
    expect(progress.attempt).toBeNull();
    await page.reload();
    expect(await saved(page)).toEqual(progress);
  }
});

test("Direct scene debug previews every shop improvement through the ordinary before-and-after reveal", async ({ page },info) => {
  await seed(page);
  for (const [index,task] of projectTasks('shop-1').entries()) {
    await page.locator('.world-debug-control').click();
    await page.locator('[data-debug-field="works"]').selectOption(String(index+1));
    // Inspect the event in the same turn, before a reduced-motion timer ends.
    const preparing=await page.locator('[data-action="debug-scene-apply"]').evaluate((button,key)=>{
      (button as HTMLButtonElement).click();
      return {phase:document.querySelector<HTMLElement>('.world-scene [data-purchase-phase]')?.dataset.purchasePhase,
        name:document.querySelector('.scene-reveal-notice')?.textContent,
        disabled:(document.querySelector('.world-main-action') as HTMLButtonElement)?.disabled,
        works:JSON.parse(localStorage.getItem(key)!).campaign.completedTasks};
    },STORAGE_KEY);
    expect(preparing.phase,task.name).toBe('preparing');
    expect(preparing.name).toContain(task.name);
    expect(preparing.disabled).toBe(true);
    expect(preparing.works).toEqual(projectTasks('shop-1').slice(0,index).map(work=>work.id));
    await finishScenePurchase(page);
    const progress=await saved(page);
    expect(progress.campaign.completedTasks).toEqual(projectTasks('shop-1').slice(0,index+1).map(work=>work.id));
    expect(progress.completed).toEqual([]);
    expect(progress.coins).toBe(0);
    await expect(page.locator('.world-scene [data-scene-view]')).not.toHaveCount(0);
    if(index===0||index===1||index===13)await screenshot(page,`scene-debug-work-${index+1}-${info.project.name}.png`);
  }
  // Replaying a previously owned improvement must still show its reveal.
  await page.locator('.world-debug-control').click();
  await page.locator('[data-debug-field="works"]').selectOption('1');
  await page.locator('[data-action="debug-scene-apply"]').click();
  await finishScenePurchase(page);
  expect((await saved(page)).campaign.completedTasks).toEqual([projectTasks('shop-1')[0].id]);
});

test("Scene shop preview is free, purchase changes the actual canvas, and ownership survives reload without altering gameplay", async ({ page }, info) => {
  await seed(page, fundedCounter());
  const before = await saved(page);
  const originalPNG = await scenePNG(page, ".world-scene .hall-world-stage canvas");
  writeFileSync(info.outputPath("shop-cancel-before.png"), originalPNG);
  const originalPlan = await page.locator(".world-scene .hall-canvas-plan").textContent();
  const originalFrame = await sceneFrame(page);
  const originalTop = await sceneSourcePixels(page, ".world-scene canvas", [1000, 585, 80, 30]);
  const item = SCENE_SHOP_ITEMS.find(entry => entry.id === "counter-smoked-oak")!;
  await openSceneShop(page);
  const originalPreview = await previewFingerprint(page);
  await page.locator(`[data-action="scene-shop-preview"][data-item="${item.id}"]`).click();
  const variantPreview = await previewFingerprint(page);
  expect(variantPreview).not.toBe(originalPreview);
  expect(await saved(page)).toEqual(before);
  await page.locator(".modal-scene-shop .modal-close").click();
  const afterCancelPNG = await scenePNG(page, ".world-scene .hall-world-stage canvas");
  writeFileSync(info.outputPath("shop-cancel-after.png"), afterCancelPNG);
  expect(await page.locator(".world-scene .hall-canvas-plan").textContent()).toBe(originalPlan);
  expect(await sceneFrame(page)).toEqual(originalFrame);
  expect(await scenePNGVisualDifference(page, originalPNG, afterCancelPNG)).toBeLessThanOrEqual(3);

  await openSceneShop(page);
  await page.locator(`[data-action="scene-shop-buy"][data-item="${item.id}"]`).click();
  const bought = await saved(page);
  expect(bought.coins).toBe(before.coins - item.cost);
  expect(bought.sceneDecor!.owned).toContain(item.id);
  expect(bought.sceneDecor!.equipped.counterTop).toBe(item.id);
  unchangedGame(bought, before);
  await expect(page.locator(`[data-action="scene-shop-equip"][data-item="${item.id}"]`)).toBeDisabled();
  await screenshot(page, `scene-shop-owned-${info.project.name}.png`);
  await page.locator(".modal-scene-shop .modal-close").click();
  const decoratedPNG = await scenePNG(page, ".world-scene .hall-world-stage canvas");
  const decoratedPlan = await page.locator(".world-scene .hall-canvas-plan").textContent();
  expect(decoratedPlan).not.toBe(originalPlan);
  expect(await sceneFrame(page)).toEqual(originalFrame);
  expect(rgbDifference(originalTop, await sceneSourcePixels(page, ".world-scene canvas", [1000, 585, 80, 30]))).toBeGreaterThan(8);
  await page.reload();
  expect((await saved(page)).sceneDecor).toEqual(bought.sceneDecor);
  expect((await saved(page)).coins).toBe(bought.coins);
  const reloadPNG = await scenePNG(page, ".world-scene .hall-world-stage canvas");
  expect(await page.locator(".world-scene .hall-canvas-plan").textContent()).toBe(decoratedPlan);
  expect(await sceneFrame(page)).toEqual(originalFrame);
  expect(await scenePNGVisualDifference(page, decoratedPNG, reloadPNG)).toBeLessThanOrEqual(3);
  await openSceneShop(page);
  await page.locator('[data-action="scene-shop-reset"][data-slot="counterTop"]').click();
  expect((await saved(page)).sceneDecor!.equipped.counterTop).toBeUndefined();
  expect((await saved(page)).sceneDecor!.owned).toContain(item.id);
  expect((await saved(page)).coins).toBe(bought.coins);
  await page.locator(`[data-action="scene-shop-equip"][data-item="${item.id}"]`).click();
  expect((await saved(page)).sceneDecor!.equipped.counterTop).toBe(item.id);
  expect((await saved(page)).coins).toBe(bought.coins);
  unchangedGame(await saved(page), before);
});

test("Base counter colors stay free and do not purchase a catalog finish", async ({ page }) => {
  await seed(page, fundedCounter());
  await page.locator('[data-action="show-map"]').first().click();
  await enterMapBuilding(page,'shop');
  const before = await saved(page);
  await page.locator('[data-action="appearance"]').click();
  await expect(page.locator(".modal-renovation")).toBeVisible();
  await page.locator('input[data-color="coral"]').check();
  await page.locator('[data-action="buy-renovation"]').click();
  const after = await saved(page);
  expect(after.coins).toBe(before.coins);
  expect(after.stars).toBe(before.stars);
  expect(after.repairKits).toBe(before.repairKits);
  expect(after.sceneDecor).toEqual(before.sceneDecor);
  expect(after.renovations.counter).toBe("coral");
  expect(after.attempt).toEqual(before.attempt);
});

test("All six finishes change a fully furnished room without covering the installed cash register", async ({ page }, info) => {
  const progress = fundedCounter();
  progress.campaign.completedTasks = projectTasks("shop-1").map(task => task.id);
  progress.renovation = progress.renovations.sign = "sea";
  await seed(page, progress);
  const before = await saved(page);
  await openSceneShop(page);
  await previewFingerprint(page);
  const original = await scenePNGHash(page, ".scene-shop-preview .hall-world-stage");
  const registerPixels = () => sceneSourcePixels(page, ".scene-shop-preview canvas", [1155, 590, 50, 55]);
  const register = await registerPixels();
  for (const item of SCENE_SHOP_ITEMS) {
    await page.locator(`[data-action="scene-shop-preview"][data-item="${item.id}"]`).click();
    await previewFingerprint(page);
    const variant = await scenePNGHash(page, ".scene-shop-preview .hall-world-stage");
    expect(variant, `${item.id} has a visible finish`).not.toBe(original);
    expect(await registerPixels(), `${item.id} leaves cash register pixels intact`).toEqual(register);
    expect(await saved(page)).toEqual(before);
  }
  await screenshot(page, `scene-shop-all-finishes-${info.project.name}.png`);
});

test("Short debug and scene-shop dialogs scroll every control into view and keep keyboard focus inside", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One explicit short-window matrix avoids duplicating both device projects.");
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page, fundedCounter());
  await openDebug(page);
  const tabletDebugControls = page.locator('.modal-debug button:enabled,.modal-debug select:enabled,.modal-debug input:enabled');
  for (let index = 0; index < await tabletDebugControls.count(); index++) await expectInsideViewport(page, tabletDebugControls.nth(index));
  await page.locator('[data-debug-field="project"]').scrollIntoViewIfNeeded();
  await screenshot(page, "scene-debug-tablet.png");
  await page.locator(".modal-debug .modal-close").click();
  await openSceneShop(page);
  await previewFingerprint(page);
  const tabletShopControls = page.locator(".modal-scene-shop button:enabled");
  for (let index = 0; index < await tabletShopControls.count(); index++) await expectInsideViewport(page, tabletShopControls.nth(index));
  await page.locator(".scene-shop-heading").scrollIntoViewIfNeeded();
  await screenshot(page, "scene-shop-tablet.png");
  await page.locator(".modal-scene-shop .modal-close").click();
  await page.setViewportSize({ width: 640, height: 360 });
  await seed(page, fundedCounter());
  await openDebug(page);
  const debug = page.locator(".modal-debug");
  const debugControls = debug.locator('button:enabled,select:enabled,input:enabled');
  for (let index = 0; index < await debugControls.count(); index++) await expectInsideViewport(page, debugControls.nth(index));
  await page.locator('[data-debug-field="project"]').focus();
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".modal-debug"))).toBe(true);
  }
  await page.locator('[data-debug-field="project"]').scrollIntoViewIfNeeded();
  await screenshot(page, "scene-debug-short-landscape.png");
  await page.locator(".modal-debug .modal-close").click();
  await page.setViewportSize({ width: 360, height: 400 });
  await openSceneShop(page);
  const shop = page.locator(".modal-scene-shop");
  const bounds = await shop.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400);
  const shopControls = shop.locator("button:enabled");
  for (let index = 0; index < await shopControls.count(); index++) await expectInsideViewport(page, shopControls.nth(index));
  await page.locator('[data-action="scene-shop-buy"][data-item="floor-weathered"]').scrollIntoViewIfNeeded();
  await screenshot(page, "scene-shop-short-portrait.png");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Direct scene debug stays reachable and clear of navigation and palette across viewport sizes",async({page},info)=>{
  test.skip(info.project.name!=='desktop','The explicit viewport matrix includes mobile widths.');
  const progress=fundedCounter();
  progress.campaign.completedTasks=projectTasks('shop-1').map(task=>task.id);
  for(const [width,height] of [[1280,900],[360,640],[768,1024],[640,360],[360,400]]) {
    await page.setViewportSize({width,height});
    await seed(page,progress);
    const debug=page.locator('.world-debug-control');
    await expectInsideViewport(page,debug);
    const collisions=await debug.evaluate(button=>{
      const a=button.getBoundingClientRect();
      return [...document.querySelectorAll('.world-scene-back,.world-room-appearance,.world-target')].filter(control=>{
        const b=control.getBoundingClientRect();
        return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
      }).map(control=>control.className);
    });
    expect(collisions,`${width}×${height}`).toEqual([]);
    await debug.click();
    await expect(page.locator('.modal-debug')).toBeVisible();
    await page.locator('.modal-debug .modal-close').click();
    if(width===360&&height===640)await screenshot(page,'scene-debug-direct-mobile-360.png');
    if(width===640)await screenshot(page,'scene-debug-direct-landscape.png');
  }
});
