import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { freshProgress, STORAGE_KEY } from '../../src/storage';
import { applyDebugSceneState } from '../../src/debug-scene';
import { COASTAL_MAP_VERSION } from '../../src/coastal-map-scene';

async function openMap(page: Page, works: number) {
  const progress = freshProgress();
  expect(applyDebugSceneState(progress, { projectId: 'terrace-1', works, orders: 0 }).ok).toBe(true);
  progress.settings.sound = false; progress.settings.reducedMotion = true;
  await page.goto('/');
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload(); await page.locator('.world-scene-back[data-action="show-map"]').click();
  await expect(page.locator('.coastal-map-art')).toHaveAttribute('data-art-version', COASTAL_MAP_VERSION);
  await page.evaluate(async () => {
    await Promise.all([...document.querySelectorAll<SVGImageElement>('.coastal-map-art image')].map(async element => {
      const image = new Image(); image.src = element.href.baseVal; await image.decode();
    }));
    await document.fonts.ready; await new Promise(requestAnimationFrame);
  });
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
  page.on('response', response => { if (response.status() >= 400) list.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('Actual terrace map construction keeps its frame and neighbouring buildings, with complete landmark captures', async ({ page }, info) => {
  const directory = `artifacts/terrace/map-runtime/${info.project.name}`; await mkdir(directory, { recursive: true });
  const frames: { works: number; file: string }[] = [];
  let geometry: { x: number; y: number; width: number; height: number } | undefined;
  let reference: Buffer | undefined;
  // Fixed independent protected landmarks: shop, warehouse, fruit pavilion,
  // upper bakery facade and left promenade. None belongs to the terrace site.
  const protectedPoints = [[654, 158], [789, 185], [1188, 160], [1402, 208], [337, 480], [564, 507], [1227, 330], [1051, 367], [740, 650], [609, 731]];
  for (const works of [0, 2, 6, 7, 8, 9, 10, 26]) {
    await openMap(page, works);
    const map = page.locator('.coastal-map-art'), bounds = (await map.boundingBox())!;
    if (geometry) for (const key of ['x', 'y', 'width', 'height'] as const) expect(bounds[key]).toBeCloseTo(geometry[key], 1);
    else geometry = bounds;
    await expect(map.locator('[data-map-site="terrace"]')).toHaveAttribute('data-map-stage', String(works));
    const png = await map.screenshot({ style: '.scene-interaction-layer,.world-hud,.world-scene-back{visibility:hidden!important}' });
    if (reference) {
      const differences = await page.evaluate(async ({ reference, png, points }) => {
        const read = async (encoded: string) => {
          const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), value => value.charCodeAt(0))], { type: 'image/png' }));
          const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024;
          const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0, 1536, 1024); bitmap.close();
          return points.map(([x, y]) => [...context.getImageData(x - 3, y - 3, 6, 6).data]);
        };
        const before = await read(reference), after = await read(png);
        return before.map((pixels, point) => {
          let difference = 0;
          for (let index = 0; index < pixels.length; index += 4) for (let channel = 0; channel < 3; channel++) difference += Math.abs(pixels[index + channel] - after[point][index + channel]);
          return difference / (36 * 3);
        });
      }, { reference: reference.toString('base64'), png: png.toString('base64'), points: protectedPoints });
      for (const [index, difference] of differences.entries()) expect(difference, `${works}, protected neighbouring landmark ${protectedPoints[index]}`).toBeLessThan(18);
    } else reference = png;
    const file = `${String(works).padStart(2, '0')}-map.png`; await writeFile(`${directory}/${file}`, png);
    await page.screenshot({ path: `${directory}/${String(works).padStart(2, '0')}-ui.png` }); frames.push({ works, file });
  }
  await writeFile(`${directory}/frames.json`, JSON.stringify(frames, null, 2));
  await page.screenshot({ path: `docs/screenshots/terrace-map-final-${info.project.name}.png` });
});
