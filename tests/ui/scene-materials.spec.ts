import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { freshProgress, STORAGE_KEY, type Progress } from '../../src/storage';
import { applyDebugSceneState } from '../../src/debug-scene';
import { SCENE_SHOP_ITEMS } from '../../src/scene-shop';
import { chooseWorldView, settleHallFrame } from './hall-frame';
import { scenePNG, sceneSourcePixels, scenePNGVisualDifference } from './scene-pixels';

const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const gameFields = ['completed', 'campaign', 'attempt', 'attempts', 'stars', 'repairKits', 'inventory', 'renovations'] as const;
const rooms = ['hall', 'hall-prep'] as const;
type Box = [number, number, number, number];
// Selected by the independent Astra reviewer in baseline screenshots at 100–200%,
// before looking at material paths: threshold, rear/perimeter floor and slab apron.
const floorSamples: Record<typeof rooms[number], Box[]> = {
  hall: [[135,702,8,8], [960,518,8,8], [1490,663,8,8], [588,578,8,8], [480,815,30,30]],
  'hall-prep': [[740,800,30,30], [8,735,8,8], [554,510,8,8], [1500,886,8,8]],
};
const slabSamples: Record<typeof rooms[number], Box[]> = {
  hall: [[970,644,10,10], [960,667,4,4], [900,550,10,10], [1338,707,4,4]],
  'hall-prep': [[636,399,8,8], [930,498,8,5]],
};
const protectedSamples: Record<typeof rooms[number], Box[]> = {
  hall: [[130,645,8,8], [1155,590,50,55]],
  'hall-prep': [[688,368,10,10], [801,405,10,10], [895,422,8,8], [943,428,8,8]],
};
const meanDifference = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : Math.abs(value - b[index])), 0) / (a.length / 4 * 3);
const failures = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; failures.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => expect(failures.get(page)).toEqual([]));

async function seed(page: Page) {
  const progress = freshProgress();
  expect(applyDebugSceneState(progress, { projectId: 'shop-1', works: 14, orders: 80 }).ok).toBe(true);
  progress.coins = 4800; progress.settings.sound = false; progress.settings.reducedMotion = true;
  await page.goto('/');
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload(); await settleHallFrame(page);
}
async function room(page: Page, name: typeof rooms[number]) {
  if (await page.locator('.world-scene > .hall-composition').getAttribute('data-scene-view') !== name) await chooseWorldView(page, name);
  await settleHallFrame(page);
}
async function openStore(page: Page) {
  await page.locator('.world-hud [data-action="scene-shop"]').click();
  await readyPreview(page);
}
async function readyPreview(page: Page) {
  await expect(page.locator('.modal-scene-shop .hall-composition')).toHaveAttribute('data-scene-ready', 'true');
}
async function previewDifference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  // A phone's modal and world sample the same grain at different resolutions.
  // Compare the material at a common footprint, then separately check the exact
  // plans and independent full-resolution surface/perimeter ROIs below.
  return page.evaluate(async ({ a, b }) => {
    const decode = async (encoded: string) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 43;
      const context = canvas.getContext('2d')!; context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, 64, 43); bitmap.close();
      return context.getImageData(0, 0, 64, 43).data;
    };
    const first = await decode(a), second = await decode(b); let total = 0;
    for(let index=0;index<first.length;index++) if(index%4!==3)total+=Math.abs(first[index]-second[index]);
    return total/(first.length/4*3);
  }, { a:a.toString('base64'), b:b.toString('base64') });
}
const paintedPlan = async (page: Page, selector: string) => {
  const plan = JSON.parse((await page.locator(selector).textContent())!);
  return {base:plan.base,layers:plan.layers.map(({animate:_,...layer}: {animate?:boolean;[key:string]:unknown})=>layer)};
};

for (const renderer of ['pixi', 'canvas2d'] as const) test(`All bought materials cover both room angles and survive preview/reset/reload (${renderer})`, async ({ page }, info) => {
  test.setTimeout(300_000);
  if (renderer === 'canvas2d') await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  const directory = `artifacts/scene-materials/${info.project.name}-${renderer}`;
  await mkdir(directory, { recursive: true });
  await seed(page);
  const originals = new Map<string, Buffer>();
  const previewBaselines = new Map<string, number>();
  const originalSamples = new Map<string, number[]>();
  for (const name of rooms) {
    await room(page, name);
    const pixels = await scenePNG(page, '.world-scene .hall-world-stage');
    originals.set(name, pixels); await writeFile(`${directory}/${name}-base.png`, pixels);
    if(info.project.name==='desktop') for(const box of [...floorSamples[name],...slabSamples[name],...protectedSamples[name]])
      originalSamples.set(`${name}:${box}`,await sceneSourcePixels(page,'.world-scene .hall-world-stage',box));
  }
  // Calibrate different modal/world sampling using the unmodified artwork,
  // instead of treating a change in canvas size as a changed material.
  await openStore(page);
  for(const name of rooms) {
    await page.locator(`[data-action="scene-shop-room"][data-view="${name}"]`).click(); await readyPreview(page);
    previewBaselines.set(name,await previewDifference(page,await scenePNG(page,'.scene-shop-preview .hall-world-stage'),originals.get(name)!));
  }
  await page.locator('.modal-scene-shop .modal-close').click();
  for (const item of SCENE_SHOP_ITEMS) {
    // Start in the packing angle: the store should keep the player's room.
    await room(page, 'hall-prep'); const before = await saved(page);
    await openStore(page);
    await expect(page.locator('.scene-shop-preview .hall-composition')).toHaveAttribute('data-scene-view', 'hall-prep');
    await page.locator(`[data-action="scene-shop-preview"][data-item="${item.id}"]`).click(); await readyPreview(page);
    const previews = new Map<string, Buffer>();
    const previewPlans = new Map<string, unknown>();
    for (const name of rooms) {
      await page.locator(`[data-action="scene-shop-room"][data-view="${name}"]`).click(); await readyPreview(page);
      await expect(page.locator('.scene-shop-preview .hall-composition')).toHaveAttribute('data-scene-view', name);
      previews.set(name, await scenePNG(page, '.scene-shop-preview .hall-world-stage'));
      previewPlans.set(name, await paintedPlan(page,'.scene-shop-preview .hall-canvas-plan'));
      await writeFile(`${directory}/${name}-${item.id}-preview.png`,previews.get(name)!);
    }
    expect(await saved(page)).toEqual(before);
    await page.locator('.modal-scene-shop .modal-close').click();
    expect(await scenePNGVisualDifference(page, originals.get('hall-prep')!, await scenePNG(page, '.world-scene .hall-world-stage'))).toBeLessThanOrEqual(3);

    await openStore(page);
    await page.locator(`[data-action="scene-shop-buy"][data-item="${item.id}"]`).click(); await readyPreview(page);
    const bought = await saved(page);
    expect(bought.coins).toBe(before.coins - item.cost);
    expect(bought.sceneDecor!.owned).toContain(item.id);
    expect(bought.sceneDecor!.equipped[item.slot]).toBe(item.id);
    for (const field of gameFields) expect(bought[field], `${item.id} leaves ${field} intact`).toEqual(before[field]);
    await expect(page.locator(`[data-action="scene-shop-equip"][data-item="${item.id}"]`)).toBeDisabled();
    await page.locator('.modal-scene-shop .modal-close').click();
    const equipped = new Map<string, Buffer>();
    for (const name of rooms) {
      await room(page, name);
      const composition = page.locator('.world-scene > .hall-composition');
      await expect(composition).toHaveAttribute('data-renderer', renderer === 'pixi' ? 'pixi-webgl' : 'canvas2d');
      const pixels = await scenePNG(page, '.world-scene .hall-world-stage'); equipped.set(name, pixels);
      await writeFile(`${directory}/${name}-${item.id}.png`, pixels);
      expect(await scenePNGVisualDifference(page, originals.get(name)!, pixels), `${item.id} changes ${name}`).toBeGreaterThan(.15);
      expect(await paintedPlan(page,'.world-scene .hall-canvas-plan')).toEqual(previewPlans.get(name));
      expect(await previewDifference(page, previews.get(name)!, pixels), `${item.id} preview agrees with bought ${name} within its baseline sampling delta`).toBeLessThan(previewBaselines.get(name)!+1);
      if(info.project.name==='desktop' && item.slot!=='lighting') {
        for(const box of item.slot==='floor'?floorSamples[name]:slabSamples[name])
          expect(meanDifference(originalSamples.get(`${name}:${box}`)!,await sceneSourcePixels(page,'.world-scene .hall-world-stage',box)),`${item.id} covers ${name} ${box}`).toBeGreaterThan(8);
        for(const box of protectedSamples[name])
          expect(meanDifference(originalSamples.get(`${name}:${box}`)!,await sceneSourcePixels(page,'.world-scene .hall-world-stage',box)),`${item.id} preserves exterior/register/tools ${name} ${box}`).toBeLessThan(3);
      }
    }
    await page.reload(); await settleHallFrame(page);
    expect((await saved(page)).sceneDecor).toEqual(bought.sceneDecor);
    expect((await saved(page)).coins).toBe(bought.coins);
    for (const name of rooms) {
      await room(page, name);
      expect(await scenePNGVisualDifference(page, equipped.get(name)!, await scenePNG(page, '.world-scene .hall-world-stage'))).toBeLessThanOrEqual(3);
    }
    await openStore(page);
    await page.locator(`[data-action="scene-shop-reset"][data-slot="${item.slot}"]`).click(); await readyPreview(page);
    expect((await saved(page)).coins).toBe(bought.coins);
    expect((await saved(page)).sceneDecor!.owned).toContain(item.id);
    expect((await saved(page)).sceneDecor!.equipped[item.slot]).toBeUndefined();
    await page.locator(`[data-action="scene-shop-equip"][data-item="${item.id}"]`).click(); await readyPreview(page);
    expect((await saved(page)).coins).toBe(bought.coins);
    expect((await saved(page)).sceneDecor!.equipped[item.slot]).toBe(item.id);
    // Return to the free material before checking the next independent variant.
    await page.locator(`[data-action="scene-shop-reset"][data-slot="${item.slot}"]`).click(); await readyPreview(page);
    await page.locator('.modal-scene-shop .modal-close').click();
    for (const name of rooms) {
      await room(page, name);
      expect(await scenePNGVisualDifference(page, originals.get(name)!, await scenePNG(page, '.world-scene .hall-world-stage'))).toBeLessThanOrEqual(3);
    }
  }
  expect((await saved(page)).coins).toBe(300);
  expect((await saved(page)).sceneDecor!.owned).toHaveLength(6);
});
