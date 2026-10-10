import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { freshProgress, STORAGE_KEY, type Progress } from '../../src/storage';
import { applyDebugSceneState } from '../../src/debug-scene';
import { projectTasks, projectOrders } from '../../src/campaign';
import { settleHallFrame, expectWholeHallFrame, enterMapBuilding } from './hall-frame';
import { scenePNG, sceneSourcePixels } from './scene-pixels';
import { finishScenePurchase } from './scene-purchase';

const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function open(page: Page, works: number, orders = 0, projectId: 'terrace-1' | 'bakery-1' = 'terrace-1') {
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

for (const renderer of ['default', 'canvas2d'] as const) test(`Every terrace state keeps its full platform and reachable next action (${renderer})`, async ({ page }, info) => {
  test.setTimeout(240_000);
  if (renderer === 'canvas2d') await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  const directory = `artifacts/terrace/runtime/${info.project.name}-${renderer}`;
  await mkdir(directory, { recursive: true });
  const frames: { works: number; view: string; file: string }[] = [];
  for (let works = 0; works <= 26; works++) {
    await open(page, works);
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view', 'terrace-deck');
    if (renderer === 'default') await expectWholeHallFrame(page);
    else {
      await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-renderer', 'canvas2d');
      const frame = (await page.locator('.world-scene').boundingBox())!;
      expect(frame.width / frame.height).toBeCloseTo(1.5, 3);
    }
    await expect(page.locator('.world-scene .scene-layer')).toHaveCount(0);
    const file = `${String(works).padStart(2, '0')}-terrace-deck.png`;
    await writeFile(`${directory}/${file}`, await scenePNG(page, '.world-scene .hall-world-stage'));
    frames.push({ works, view: 'terrace-deck', file });
    const target = page.locator('.world-target');
    if (await target.count()) expect(await target.evaluate(button => {
      const bounds = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })).toBe(true);
    if ([0, 5, 7, 9, 12, 14, 19, 23, 26].includes(works))
      await page.screenshot({ path: `docs/screenshots/terrace-${works}-${info.project.name}-${renderer}.png` });
  }
  await writeFile(`${directory}/frames.json`, JSON.stringify(frames, null, 2));
});

test('A completed bakery leads directly to the new terrace, with map entry and return preserving ownership', async ({ page }, info) => {
  await open(page, 26, 80, 'bakery-1'); const before = await saved(page);
  const next = page.locator('.world-main-action[data-project="terrace-1"]');
  await expect(next).toHaveText(/К террасе/); await next.click(); await settleHallFrame(page);
  await expect(page.locator('.world')).toHaveAttribute('data-project', 'terrace-1');
  await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view', 'terrace-deck');
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  const pin = page.locator('.world-pin[data-area="terrace"]');
  await expect(pin).toHaveAttribute('data-project', 'terrace-1'); await pin.click();
  const card = page.locator('.navigation-view-card.room-next');
  await expect(card).toHaveAttribute('data-view', 'terrace-deck');
  await expect(card).toContainText('Терраса у моря'); await card.click(); await expectWholeHallFrame(page);
  await page.screenshot({ path: `docs/screenshots/terrace-entry-${info.project.name}.png` });
  await page.locator('.world-scene-back[data-action="show-map"]').click(); await enterMapBuilding(page, 'bakery');
  await expectWholeHallFrame(page);
  const after = await saved(page);
  for (const key of ['campaign', 'completed', 'attempts', 'coins', 'stars', 'repairKits', 'inventory'] as const) expect(after[key]).toEqual(before[key]);
});

test('The first terrace repair uses building materials and pays one kit once', async ({ page }) => {
  await open(page, 0); const before = await saved(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.puzzle[data-order-kind="repair"]')).toBeVisible();
  for (const source of await page.locator('.orders .good,.slot .good').evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).src)))
    expect(source).toMatch(/\/material-[a-z]+\.webp$/);
  await page.locator('.game-topbar [data-action="debug-menu"]').click();
  await page.locator('.modal-debug [data-action="debug-auto"]').click();
  await expect(page.locator('.modal-result')).toBeVisible();
  const after = await saved(page);
  expect(after.attempt!.definition.id).toBe(projectOrders('terrace-1')[0].id);
  expect(after.attempt!.definition.number).toBe(2241);
  expect(after.attempt!.reward).toEqual({ coins: 60, stars: 0, repairKits: 1, fresh: true });
  expect(after.repairKits).toBe(before.repairKits + 1); expect(after.stars).toBe(before.stars); expect(after.coins).toBe(before.coins + 60);
  await page.reload(); expect(await saved(page)).toEqual(after);
});

test('Terrace internal orders start only after the first tables and chairs and use three new separate goods', async ({ page }, info) => {
  await open(page, 13, 38);
  await expect(page.locator('.world-main-action[data-action="play"]')).toHaveCount(0);
  await open(page, 14, 38); const before = await saved(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.puzzle[data-order-kind="food"]')).toBeVisible();
  const after = await saved(page);
  expect(after.attempt!.definition.id).toBe(projectOrders('terrace-1')[38].id);
  expect(after.attempt!.definition.number).toBe(2279);
  for (const file of ['pie', 'bun', 'lemonade']) {
    const image = page.locator(`.puzzle img[src$="/${file}.webp"]`); expect(await image.count()).toBeGreaterThan(0);
    await expect.poll(() => image.first().evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  }
  expect(after.campaign).toEqual(before.campaign); expect(after.completed).toEqual(before.completed);
  await page.screenshot({ path: `docs/screenshots/terrace-order-39-${info.project.name}.png` });
});

test('Visible debug can replay terrace foundations, furniture and final decoration through the normal reveal', async ({ page }, info) => {
  await open(page, 0);
  for (const number of [7, 8, 9, 10, 11, 12, 13, 14, 19, 23, 26]) {
    await page.locator('.world-debug-control').click();
    await page.locator('[data-debug-field="project"]').selectOption('terrace-1');
    await page.locator('[data-debug-field="works"]').selectOption(String(number));
    await page.locator('[data-action="debug-scene-apply"]').click();
    await finishScenePurchase(page); await expectWholeHallFrame(page);
    await expect(page.locator('.world')).toHaveAttribute('data-project', 'terrace-1');
    expect((await saved(page)).campaign.completedTasks).toContain(projectTasks('terrace-1')[number - 1].id);
  }
  await page.screenshot({ path: `docs/screenshots/terrace-debug-final-${info.project.name}.png` });
});

test('Terrace controls and full platform fit desktop, narrow phones and tablet sizes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Explicit viewport matrix runs once.');
  for (const [width, height] of [[1280, 900], [360, 640], [384, 720], [360, 400], [768, 1024], [1024, 768], [640, 360]]) {
    await page.setViewportSize({ width, height }); await open(page, 26); await expectWholeHallFrame(page);
    for (const selector of ['.world-main-action', '.world-debug-control', '.world-scene-back', '.world-hud [data-action="world-navigation"]']) {
      const button = page.locator(selector), bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(43); expect(bounds.height).toBeGreaterThanOrEqual(43);
      expect(bounds.x).toBeGreaterThanOrEqual(-1); expect(bounds.y).toBeGreaterThanOrEqual(-1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      expect(await button.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    }
    const action = (await page.locator('.world-main-action').boundingBox())!;
    expect(height - action.y - action.height).toBeGreaterThanOrEqual(14);
    await page.screenshot({ path: `docs/screenshots/terrace-${width}x${height}.png` });
  }
});

for (const renderer of ['default', 'canvas2d'] as const) test(`Independently reviewed table supports and service goods retain their source pixels (${renderer})`, async ({ page }) => {
  if (renderer === 'canvas2d') await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  // Astra identified the two rear supports in large source crops before this
  // check. The front supports are occluded by the actual railing and need the
  // full runtime review rather than comparison with a railing-free donor.
  for (const state of [
    ...[13, 14, 18, 26].map(works => ({ works, source: 'tables-only-v2', boxes: [[579, 491, 10, 18], [1009, 485, 9, 18]] })),
    { works: 14, source: 'furniture-bare', boxes: [[633, 447, 9, 20]] },
    { works: 18, source: 'furniture-bare', boxes: [[1056, 410, 8, 10]] },
    { works: 19, source: 'furniture-full', boxes: [[650, 280, 34, 18]] },
    { works: 20, source: 'furniture-full', boxes: [[944, 282, 26, 18]] },
    { works: 21, source: 'furniture-full', boxes: [[495, 444, 16, 20]] },
  ]) {
    await open(page, state.works);
    for (const values of state.boxes) {
      const box = values as [number, number, number, number];
      const actual = await sceneSourcePixels(page, '.world-scene .hall-world-stage', box);
      const expected = await page.evaluate(async ({ source, box }) => {
        const image = new Image(); image.src = `/assets/terrace-${source}.webp`; await image.decode();
        const bounds = document.querySelector('.world-scene .hall-world-stage')!.getBoundingClientRect();
        const small = document.createElement('canvas'); small.width = Math.round(bounds.width * devicePixelRatio); small.height = Math.round(bounds.height * devicePixelRatio);
        const scaled = small.getContext('2d')!; scaled.imageSmoothingQuality = 'high'; scaled.drawImage(image, 0, 0, small.width, small.height);
        const copy = document.createElement('canvas'); copy.width = 1536; copy.height = 1024;
        const context = copy.getContext('2d')!; context.drawImage(small, 0, 0, 1536, 1024);
        return [...context.getImageData(...box).data];
      }, { source: state.source, box });
      let difference = 0;
      for (let index = 0; index < actual.length; index += 4) for (let channel = 0; channel < 3; channel++) difference += Math.abs(actual[index + channel] - expected[index + channel]);
      expect(difference / (actual.length / 4 * 3), `${state.works} ${state.source} support/goods at ${box}`).toBeLessThan(18);
    }
  }
});

test('Both terrace renderers agree locally in all captured construction and furnishing states', async ({ page }, info) => {
  await page.goto('/');
  const directory = `artifacts/terrace/runtime/${info.project.name}`;
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
  await mkdir('artifacts/terrace/parity', { recursive: true });
  await writeFile(`artifacts/terrace/parity/${info.project.name}.json`, JSON.stringify(results, null, 2));
  for (const result of results) expect(result.worst.delta, `${result.works} at tile ${result.worst.x},${result.worst.y}`).toBeLessThan(18);
});
