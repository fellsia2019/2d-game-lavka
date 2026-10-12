import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { freshProgress, STORAGE_KEY, type Progress } from '../../src/storage';
import { applyDebugSceneState } from '../../src/debug-scene';
import { projectTasks, projectOrders } from '../../src/campaign';
import { settleHallFrame, expectWholeHallFrame, chooseWorldView, enterMapBuilding } from './hall-frame';
import { scenePNG, sceneSourcePixels } from './scene-pixels';
import { sceneTaskView } from '../../src/campaign-scene';
import { finishScenePurchase } from './scene-purchase';

const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function open(page: Page, works: number, orders = 0, projectId: 'restaurant-1' | 'terrace-1' = 'restaurant-1') {
  const progress = freshProgress();
  expect(applyDebugSceneState(progress, { projectId, works, orders }).ok).toBe(true);
  progress.stars = 0; progress.repairKits = 0;
  progress.settings.sound = false; progress.settings.reducedMotion = true;
  await page.goto('/');
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload(); await settleHallFrame(page);
}
const failures = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; failures.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => expect(failures.get(page)).toEqual([]));

async function view(page:Page,name:string){
  if(await page.locator('.world-scene > .hall-composition').getAttribute('data-scene-view')!==name)await chooseWorldView(page,name);
  await settleHallFrame(page);
}

for(const renderer of ['default','canvas2d'] as const)test(`All restaurant construction/furniture states fit complete frames (${renderer})`,async({page},info)=>{
  test.setTimeout(300_000);
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);} as typeof original;
  });
  const directory=`artifacts/restaurant/runtime/${info.project.name}-${renderer}`;await mkdir(directory,{recursive:true});
  const tasks=projectTasks('restaurant-1'),frames:{works:number;view:string;file:string}[]=[];
  const capture=async(works:number,name:string,suffix='')=>{
    await view(page,name);
    if(renderer==='default')await expectWholeHallFrame(page);
    else{await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-renderer','canvas2d');const r=(await page.locator('.world-scene').boundingBox())!;expect(r.width/r.height).toBeCloseTo(1.5,3);}
    await expect(page.locator('.world-scene .scene-layer')).toHaveCount(0);
    const file=`${String(works).padStart(2,'0')}${suffix}-${name}.png`;
    await writeFile(`${directory}/${file}`,await scenePNG(page,'.world-scene .hall-world-stage'));frames.push({works,view:name,file});
    const target=page.locator('.world-target');
    if(await target.count())expect(await target.evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  };
  for(let works=0;works<=tasks.length;works++){
    await open(page,works);const current=sceneTaskView(tasks[Math.max(0,works-1)].id);await capture(works,current);
    if(tasks[works]&&sceneTaskView(tasks[works].id)!==current)await capture(works,sceneTaskView(tasks[works].id),'-next');
    if([0,7,10,12,14,18,19,21,25,26].includes(works))await page.screenshot({path:`docs/screenshots/restaurant-${works}-${info.project.name}-${renderer}.png`});
  }
  for(const works of [11,12]) { await open(page,works); await capture(works,'restaurant-yard','-shared'); }
  await open(page,26);
  for(const name of ['restaurant-yard','restaurant-hall','restaurant-kitchen']) {
    await capture(26,name,'-complete');
    await page.screenshot({path:`docs/screenshots/restaurant-complete-${name}-${info.project.name}-${renderer}.png`});
  }
  await writeFile(`${directory}/frames.json`,JSON.stringify(frames,null,2));
});

test('A completed terrace leads directly to the new restaurant, with map entry and return preserving ownership', async ({ page }, info) => {
  await open(page, 26, 80, 'terrace-1'); const before = await saved(page);
  const next = page.locator('.world-main-action[data-project="restaurant-1"]');
  await expect(next).toHaveText(/В ресторан/); await next.click(); await settleHallFrame(page);
  await expect(page.locator('.world')).toHaveAttribute('data-project', 'restaurant-1');
  await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view', 'restaurant-yard');
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  const pin = page.locator('.world-pin[data-area="restaurant"]');
  await expect(pin).toHaveAttribute('data-project', 'restaurant-1'); await pin.click();
  const card = page.locator('.navigation-view-card.room-next');
  await expect(card).toHaveAttribute('data-view', 'restaurant-yard');
  await expect(card).toContainText('Лавка и второй этаж'); await card.click(); await expectWholeHallFrame(page);
  await page.screenshot({ path: `docs/screenshots/restaurant-entry-${info.project.name}.png` });
  await page.locator('.world-scene-back[data-action="show-map"]').click(); await enterMapBuilding(page, 'terrace');
  await expectWholeHallFrame(page);
  const after = await saved(page);
  for (const key of ['campaign', 'completed', 'attempts', 'coins', 'stars', 'repairKits', 'inventory'] as const) expect(after[key]).toEqual(before[key]);
});

test('The first restaurant repair uses building materials and pays one kit once', async ({ page }) => {
  await open(page, 0); const before = await saved(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.puzzle[data-order-kind="repair"]')).toBeVisible();
  for (const source of await page.locator('.orders .good,.slot .good').evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src)))
    expect(source).toMatch(/\/material-[a-z]+\.webp$/);
  await page.locator('.game-topbar [data-action="debug-menu"]').click();
  await page.locator('.modal-debug [data-action="debug-auto"]').click();
  await expect(page.locator('.modal-result')).toBeVisible();
  const after = await saved(page);
  expect(after.attempt!.definition.id).toBe(projectOrders('restaurant-1')[0].id);
  expect(after.attempt!.definition.number).toBe(3901);
  expect(after.attempt!.reward).toEqual({ coins: 60, stars: 0, repairKits: 1, fresh: true });
  expect(after.repairKits).toBe(before.repairKits + 1); expect(after.stars).toBe(before.stars); expect(after.coins).toBe(before.coins + 60);
  await page.reload(); expect(await saved(page)).toEqual(after);
});

test('Restaurant internal orders start only after the first tables and chairs and use two new separate goods', async ({ page }, info) => {
  await open(page, 13, 38);
  await expect(page.locator('.world-main-action[data-action="play"]')).toHaveCount(0);
  await open(page, 14, 38); const before = await saved(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.puzzle[data-order-kind="food"]')).toBeVisible();
  const after = await saved(page);
  expect(after.attempt!.definition.id).toBe(projectOrders('restaurant-1')[38].id);
  expect(after.attempt!.definition.number).toBe(3939);
  for (const file of ['cupcake', 'soda']) {
    const image = page.locator(`.puzzle img[src$="/${file}.webp"]`); expect(await image.count()).toBeGreaterThan(0);
    await expect.poll(() => image.first().evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  }
  expect(after.campaign).toEqual(before.campaign); expect(after.completed).toEqual(before.completed);
  await page.screenshot({ path: `docs/screenshots/restaurant-order-39-${info.project.name}.png` });
});

test('Visible debug can replay restaurant foundations, furniture and final decoration through the normal reveal', async ({ page }, info) => {
  await open(page, 0);
  for (const number of [7, 8, 9, 10, 11, 12, 13, 14, 19, 23, 26]) {
    await page.locator('.world-debug-control').click();
    await page.locator('[data-debug-field="project"]').selectOption('restaurant-1');
    await page.locator('[data-debug-field="works"]').selectOption(String(number));
    await page.locator('[data-action="debug-scene-apply"]').click();
    await finishScenePurchase(page); await expectWholeHallFrame(page);
    await expect(page.locator('.world')).toHaveAttribute('data-project', 'restaurant-1');
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view', sceneTaskView(projectTasks('restaurant-1')[number-1].id));
    expect((await saved(page)).campaign.completedTasks).toContain(projectTasks('restaurant-1')[number - 1].id);
  }
  await page.screenshot({ path: `docs/screenshots/restaurant-debug-final-${info.project.name}.png` });
});

test('Restaurant controls and complete room fit desktop, narrow phones and tablet sizes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Explicit viewport matrix runs once.');
  for (const [width, height] of [[1280, 900], [360, 640], [384, 720], [360, 400], [768, 1024], [1024, 768], [640, 360]]) {
    await page.setViewportSize({ width, height }); await open(page, 26);
    for (const name of ['restaurant-yard','restaurant-hall','restaurant-kitchen']) {
    await view(page,name); await expectWholeHallFrame(page);
    for (const selector of ['.world-main-action', '.world-debug-control', '.world-scene-back', '.world-hud [data-action="world-navigation"]']) {
      const button = page.locator(selector), bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(43); expect(bounds.height).toBeGreaterThanOrEqual(43);
      expect(bounds.x).toBeGreaterThanOrEqual(-1); expect(bounds.y).toBeGreaterThanOrEqual(-1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      expect(await button.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    }
    const action = (await page.locator('.world-main-action').boundingBox())!;
    expect(height - action.y - action.height).toBeGreaterThanOrEqual(14);
    await page.screenshot({ path: `docs/screenshots/restaurant-${name}-${width}x${height}.png` });
    }
  }
});

for (const renderer of ['default', 'canvas2d'] as const) test(`Independently diagnosed kitchen support and utensil bowl stay complete (${renderer})`, async ({ page }) => {
  if (renderer === 'canvas2d') await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  // These solid interior ROIs were identified by the independent Astra reviewer
  // in the painted frame, where a missing fourth leg and pan bowl were visible.
  for (const state of [
    { works: 22, boxes: [[1085, 545, 6, 35]] },
    { works: 24, boxes: [[1085, 545, 6, 35], [842, 324, 8, 15]] },
    { works: 26, boxes: [[1085, 545, 6, 35], [842, 324, 8, 15]] },
  ]) {
    await open(page, state.works); await view(page, 'restaurant-kitchen');
    for (const values of state.boxes) {
      const box = values as [number, number, number, number];
      const actual = await sceneSourcePixels(page, '.world-scene .hall-world-stage', box);
      const expected = await page.evaluate(async box => {
        const image = new Image(); image.src = '/assets/restaurant-kitchen-master-v3.webp'; await image.decode();
        const bounds = document.querySelector('.world-scene .hall-world-stage')!.getBoundingClientRect();
        const small = document.createElement('canvas'); small.width = Math.round(bounds.width * devicePixelRatio); small.height = Math.round(bounds.height * devicePixelRatio);
        const scaled = small.getContext('2d')!; scaled.imageSmoothingQuality = 'high'; scaled.drawImage(image, 0, 0, small.width, small.height);
        const copy = document.createElement('canvas'); copy.width = 1536; copy.height = 1024;
        const context = copy.getContext('2d')!; context.drawImage(small, 0, 0, 1536, 1024);
        return [...context.getImageData(...box).data];
      }, box);
      let difference = 0;
      for (let index = 0; index < actual.length; index += 4) for (let channel = 0; channel < 3; channel++) difference += Math.abs(actual[index + channel] - expected[index + channel]);
      expect(difference / (actual.length / 4 * 3), `${state.works} support/utensil at ${box}`).toBeLessThan(18);
    }
  }
  // The independent review also found a cropped crock painted below the rail.
  // This backsplash area must remain unchanged when buying the utensils.
  const backsplash: [number, number, number, number] = [1000, 365, 25, 12];
  await open(page, 23); await view(page, 'restaurant-kitchen');
  const before = await sceneSourcePixels(page, '.world-scene .hall-world-stage', backsplash);
  for (const works of [24, 26]) {
    await open(page, works); await view(page, 'restaurant-kitchen');
    const after = await sceneSourcePixels(page, '.world-scene .hall-world-stage', backsplash);
    let difference = 0;
    for (let index = 0; index < before.length; index += 4) for (let channel = 0; channel < 3; channel++) difference += Math.abs(before[index + channel] - after[index + channel]);
    expect(difference / (before.length / 4 * 3), `${works} keeps the wall below the utensil rail`).toBeLessThan(3);
  }
});

test('Both restaurant renderers agree locally in all captured construction and furnishing states', async ({ page }, info) => {
  await page.goto('/');
  const directory = `artifacts/restaurant/runtime/${info.project.name}`;
  const frames = JSON.parse(await readFile(`${directory}-default/frames.json`, 'utf8')) as { works: number; file: string }[];
  const results: { works: number; worst: { x: number; y: number; delta: number } }[] = [];
  for (const frame of frames) {
    const [a, b] = await Promise.all([readFile(`${directory}-default/${frame.file}`), readFile(`${directory}-canvas2d/${frame.file}`)]);
    const worst = await page.evaluate(async ({ a, b }) => {
      const decode = async (value: string) => {
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(value), character => character.charCodeAt(0))], { type: 'image/png' }));
        const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024;
        const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0, 1536, 1024); bitmap.close();
        return context.getImageData(0, 0, 1536, 1024).data;
      };
      const first = await decode(a), second = await decode(b); let worst = { x: 0, y: 0, delta: 0 };
      for (let y = 0; y < 1024; y += 64) for (let x = 0; x < 1536; x += 64) {
        let sum = 0;
        for (let yy = y; yy < y + 64; yy++) for (let xx = x; xx < x + 64; xx++) {
          const index = (yy * 1536 + xx) * 4;
          for (let channel = 0; channel < 3; channel++) sum += Math.abs(first[index + channel] - second[index + channel]);
        }
        const delta = sum / (64 * 64 * 3); if (delta > worst.delta) worst = { x, y, delta };
      }
      return worst;
    }, { a: a.toString('base64'), b: b.toString('base64') });
    results.push({ works: frame.works, worst });
  }
  await mkdir('artifacts/restaurant/parity', { recursive: true });
  await writeFile(`artifacts/restaurant/parity/${info.project.name}.json`, JSON.stringify(results, null, 2));
  for (const result of results) expect(result.worst.delta, `${result.works} at tile ${result.worst.x},${result.worst.y}`).toBeLessThan(18);
});
