import { test, expect, type Page } from '@playwright/test';
import { freshProgress, STORAGE_KEY, type Progress } from '../../src/storage';
import { applyDebugSceneState } from '../../src/debug-scene';
import { projectTasks } from '../../src/campaign';
import { settleHallFrame, chooseWorldView } from './hall-frame';
import { finishScenePurchase } from './scene-purchase';
import { scenePNG, sceneSourcePixels } from './scene-pixels';

const surface = '.world-scene .hall-world-stage';
type Box = [number, number, number, number];
const delta = (a: number[], b: number[]) => a.reduce((sum, value, index) =>
  sum + (index % 4 === 3 ? 0 : Math.abs(value - b[index])), 0) / (a.length / 4 * 3);
const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function open(page: Page, works: number) {
  const progress = freshProgress();
  expect(applyDebugSceneState(progress, { projectId: 'restaurant-1', works, orders: 0 }).ok).toBe(true);
  progress.settings.sound = false; progress.settings.reducedMotion = true;
  await page.goto('/');
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload(); await settleHallFrame(page);
}
async function view(page: Page, name: string) {
  if (await page.locator('.world-scene > .hall-composition').getAttribute('data-scene-view') !== name)
    await chooseWorldView(page, name);
  await settleHallFrame(page);
}
const sample = (page: Page, boxes: Box[]) => Promise.all(boxes.map(box => sceneSourcePixels(page, surface, box)));
async function donorPixels(page: Page, box: Box, source: string): Promise<number[]> {
  return page.evaluate(async ({ box, source, encoded }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), value => value.charCodeAt(0))], { type: 'image/png' }));
    const image = new Image(); image.src = `/assets/${source}.webp`; await image.decode();
    // Match the displayed Chromium raster before comparing the source-frame ROI.
    const small = document.createElement('canvas'); small.width = bitmap.width; small.height = bitmap.height; bitmap.close();
    small.getContext('2d')!.drawImage(image, 0, 0, small.width, small.height);
    const copy = document.createElement('canvas'); copy.width = 1536; copy.height = 1024;
    const context = copy.getContext('2d')!; context.drawImage(small, 0, 0, 1536, 1024);
    return [...context.getImageData(...box).data];
  }, { box, source, encoded: (await scenePNG(page, surface)).toString('base64') });
}
const failures = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; failures.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => expect(failures.get(page)).toEqual([]));

for (const renderer of ['default', 'canvas2d'] as const) {
  test(`Upstairs access is bought outside before entering and lighting never rebuilds its rails (${renderer})`, async ({ page }, info) => {
    test.setTimeout(90_000);
    if (renderer === 'canvas2d') await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]);
      } as typeof original;
    });
    if (info.project.name === 'desktop') await page.setViewportSize({ width: 1720, height: 1250 });
    await open(page, 9);
    const before = await saved(page), tasks = projectTasks('restaurant-1');
    // Independent Astra inspection chose visible stair treads, the front landing
    // post and rear balcony support. These are not derived from renderer masks.
    const access: Box[] = [[1190, 701, 45, 47], [1095, 355, 15, 60], [1230, 423, 20, 25]];
    const planned = await sample(page, access);
    await expect(page.locator('.world-journey-copy')).toContainText('Вход на второй этаж');
    await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${tasks[9].id}"]`).click();
    await finishScenePurchase(page); await settleHallFrame(page);
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view', 'restaurant-yard');
    const built = await sample(page, access);
    const exteriorLamps: Box[] = [[1043, 220, 25, 62], [1224, 213, 27, 58]];
    const unlit = await sample(page, exteriorLamps);
    const exteriorPot: Box = [1034, 379, 20, 36], bareLanding = await sceneSourcePixels(page, surface, exteriorPot);
    for (const [index, box] of access.entries()) {
      expect(delta(planned[index], built[index]), `Purchased stairs/landing really appear at ${box}`).toBeGreaterThan(8);
      expect(delta(built[index], await donorPixels(page, box, 'restaurant-yard-ready-v3')), `Complete purchased access at ${box}`).toBeLessThan(18);
    }
    await expect(page.locator('.world-main-action')).toHaveAttribute('data-action', 'show-target');
    const afterEntry = await saved(page);
    expect(afterEntry.campaign.completedTasks).toEqual([...before.campaign.completedTasks, tasks[9].id]);
    expect(afterEntry.repairKits).toBe(before.repairKits - tasks[9].cost);
    expect(afterEntry.stars).toBe(before.stars); expect(afterEntry.completed).toEqual(before.completed);
    expect(afterEntry.coins).toBe(before.coins);
    await page.screenshot({ path: `docs/screenshots/restaurant-access-10-${info.project.name}-${renderer}.png` });

    await page.locator('.world-main-action[data-action="show-target"]').click(); await settleHallFrame(page);
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view', 'restaurant-hall');
    const rails: Box[] = [[555, 329, 18, 110], [575, 366, 27, 65]];
    const railBefore = await sample(page, rails);
    const plants: Box[] = [[495, 391, 22, 29], [470, 211, 20, 74]], bareEntrance = await sample(page, plants);
    for (const [index, box] of plants.entries())
      expect(delta(bareEntrance[index], await donorPixels(page, box, 'restaurant-hall-stair-rework-v4')), 'The entrance shows no future opening plants').toBeLessThan(18);
    const lamp: Box = [307, 117, 53, 35], dark = await sceneSourcePixels(page, surface, lamp);
    for (const number of [11, 12]) {
      await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${tasks[number - 1].id}"]`).click();
      await finishScenePurchase(page); await settleHallFrame(page);
      for (const [index, pixels] of (await sample(page, rails)).entries())
        expect(delta(railBefore[index], pixels), `${number} must keep the existing entrance rail`).toBeLessThan(3);
      for (const [index, pixels] of (await sample(page, plants)).entries())
        expect(delta(bareEntrance[index], pixels), `${number} must not import future plants through D1`).toBeLessThan(3);
      await view(page, 'restaurant-yard');
      for (const [index, pixels] of (await sample(page, access)).entries())
        expect(delta(built[index], pixels), `${number} must keep the completed exterior access`).toBeLessThan(3);
      if (number === 12) for (const [index, pixels] of (await sample(page, exteriorLamps)).entries())
        expect(delta(unlit[index], pixels), 'Purchased lights also appear on the facade').toBeGreaterThan(8);
      await view(page, 'restaurant-hall');
    }
    expect(delta(dark, await sceneSourcePixels(page, surface, lamp)), 'Lighting purchases actual lamps').toBeGreaterThan(8);
    const after = await saved(page);
    expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks, ...tasks.slice(9, 12).map(task => task.id)]);
    expect(after.repairKits).toBe(before.repairKits - tasks.slice(9, 12).reduce((sum, task) => sum + task.cost, 0));
    expect(after.completed).toEqual(before.completed); expect(after.coins).toBe(before.coins);
    await page.reload(); await settleHallFrame(page); expect(await saved(page)).toEqual(after);
    await open(page, 26); await view(page, 'restaurant-hall');
    for (const [index, pixels] of (await sample(page, plants)).entries())
      expect(delta(bareEntrance[index], pixels), 'The final opening really adds plants inside the D1 view').toBeGreaterThan(8);
    for (const [index, pixels] of (await sample(page, rails)).entries())
      expect(delta(railBefore[index], pixels), 'Opening plants preserve the existing rails').toBeLessThan(3);
    await view(page, 'restaurant-yard');
    expect(delta(bareLanding, await sceneSourcePixels(page, surface, exteriorPot)), 'The same final pot appears on the exterior landing').toBeGreaterThan(8);
  });

  test(`The working ground-floor shop stays visible through every upstairs construction state (${renderer})`, async ({ page }, info) => {
    test.setTimeout(90_000);
    if (renderer === 'canvas2d') await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]);
      } as typeof original;
    });
    if (info.project.name === 'desktop') await page.setViewportSize({ width: 1720, height: 1250 });
    // Actual independently inspected glass: both display windows and D0.
    const glass: Box[] = [[465, 565, 120, 115], [790, 567, 168, 107], [670, 577, 59, 106], [665, 584, 4, 92]];
    await open(page, 0); const reference = await sample(page, glass);
    for (const [index, box] of glass.entries())
      expect(delta(reference[index], await donorPixels(page, box, 'restaurant-yard-ready-v3')), `Working-shop glass, rather than a consistently empty donor, at ${box}`).toBeLessThan(18);
    for (const works of [5, 9, 10, 11, 12, 14, 26]) {
      await open(page, works); await view(page, 'restaurant-yard');
      for (const [index, pixels] of (await sample(page, glass)).entries())
        expect(delta(reference[index], pixels), `${works} working shop glass must survive full-scene donor changes`).toBeLessThan(3);
    }
    const upper: Box[] = [[475, 250, 130, 94], [702, 246, 144, 102]];
    await open(page, 10); await view(page, 'restaurant-yard'); const reflected = await sample(page, upper);
    for (const [index, box] of upper.entries())
      expect(delta(reflected[index], await donorPixels(page, box, 'restaurant-yard-ready-v3')), `Neutral upper glass without future furnishings at ${box}`).toBeLessThan(18);
    for (const works of [11, 12, 13, 14, 26]) {
      await open(page, works); await view(page, 'restaurant-yard');
      for (const [index, pixels] of (await sample(page, upper)).entries())
        expect(delta(reflected[index], pixels), `${works} preserves the upper glass reflections`).toBeLessThan(3);
    }
  });
}
