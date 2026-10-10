import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { projectOrders, projectTasks, type ProjectId } from '../../src/campaign';
import { sceneTaskView } from '../../src/campaign-scene';
import { freshProgress, STORAGE_KEY } from '../../src/storage';
import { scenePNG, sceneSourcePixels } from './scene-pixels';

const surface = '.world-scene .hall-world-stage';
const scene = '.world-scene > .shop-composition';

async function openState(page: Page, project: 'warehouse-1' | 'warehouse-2', works: number) {
  const progress = freshProgress(); progress.selectedProject = project;
  progress.settings.sound = false; progress.settings.reducedMotion = true;
  const prior: ProjectId[] = project === 'warehouse-1' ? ['shop-1'] : ['shop-1', 'warehouse-1'];
  for (const id of prior) {
    progress.completed.push(...projectOrders(id).map(order => order.id));
    progress.campaign.completedTasks.push(...projectTasks(id).map(task => task.id));
  }
  progress.campaign.completedTasks.push(...projectTasks(project).slice(0, works).map(task => task.id));
  // Art review deliberately gives no currency: pending objects must also remain coherent.
  await page.goto('/');
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload();
  await expect(page.locator('.world')).toHaveAttribute('data-project', project);
}

async function view(page: Page, name: string) {
  if (await page.locator(scene).getAttribute('data-scene-view') !== name) {
    await page.locator('.world-hud [data-action="world-navigation"]').click();
    await page.locator(`.navigation-view-card[data-view="${name}"]`).click();
  }
  await expect(page.locator(scene)).toHaveAttribute('data-scene-view', name);
  await expect(page.locator(scene)).toHaveAttribute('data-scene-ready', 'true');
}

test('Every warehouse improvement has a full composed frame for visual review', async ({ page }, info) => {
  test.setTimeout(300_000);
  const directory = `artifacts/warehouse-art/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  const frames: { project: string; works: number; view: string; file: string }[] = [];
  const capture = async (project: string, works: number, name: string, suffix = '') => {
    const file = `${project}-${String(works).padStart(2, '0')}${suffix}-${name}.png`;
    await view(page, name);
    await writeFile(`${directory}/${file}`, await scenePNG(page, surface));
    frames.push({ project, works, view: name, file });
  };
  for (const project of ['warehouse-1', 'warehouse-2'] as const) {
    const tasks = projectTasks(project);
    for (let works = 0; works <= tasks.length; works++) {
      await openState(page, project, works);
      // Inspect the result of this work, even when the next task moves outdoors.
      const name = sceneTaskView(tasks[Math.max(0, works - 1)].id);
      await capture(project, works, name);
      if (tasks[works] && sceneTaskView(tasks[works].id) !== name)
        await capture(project, works, sceneTaskView(tasks[works].id), '-next');
      await expect(page.locator('.world-progress')).toContainText(`${works} / ${tasks.length}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    for (const name of project === 'warehouse-1'
      ? ['warehouse-yard', 'warehouse', 'warehouse-receiving']
      : ['warehouse-yard', 'warehouse', 'warehouse-cold', 'warehouse-receiving']) {
      await capture(project, tasks.length, name, '-complete');
    }
  }
  await writeFile(`${directory}/frames.json`, JSON.stringify(frames, null, 2));
});

test('Empty storage rack has continuous teal panels before its wooden crates are purchased', async ({ page }, info) => {
  await openState(page, 'warehouse-1', 14); await view(page, 'warehouse');
  // These previously showed severed crate faces inside broad shelf-panel masks.
  for (const [x, y] of [[870, 509], [1052, 572], [1278, 479], [950, 548], [1100, 574]]) {
    const pixels = await sceneSourcePixels(page, surface, [x - 3, y - 3, 6, 6]);
    const channels = [0, 1, 2].map(channel => pixels.filter((_, index) => index % 4 === channel).reduce((a, b) => a + b, 0) / 36);
    expect(channels[1], `teal panel at ${x},${y}`).toBeGreaterThan(channels[0] + 20);
    expect(channels[2], `teal panel at ${x},${y}`).toBeGreaterThan(channels[0] + 15);
  }
  const shelf = await sceneSourcePixels(page, surface, [1407, 535, 6, 6]);
  const redMinusGreen = shelf.reduce((sum, value, index) => sum + (index % 4 === 0 ? value : index % 4 === 1 ? -value : 0), 0) / 36;
  expect(redMinusGreen, 'bottom wooden shelf under the later closed crate').toBeGreaterThan(40);
  await page.screenshot({ path: `docs/screenshots/warehouse-rack-fixed-${info.project.name}.png` });
});

test('Cold shelving has complete freestanding posts before the bulk bins are purchased', async ({ page }, info) => {
  await openState(page, 'warehouse-2', 7); await view(page, 'warehouse-cold');
  for (const [x, y] of [[725, 620], [913, 660], [1150, 579], [780, 320], [970, 340]]) {
    const pixels = await sceneSourcePixels(page, surface, [x - 3, y - 3, 6, 6]);
    const mean = [0, 1, 2].map(channel => pixels.filter((_, index) => index % 4 === channel).reduce((a, b) => a + b, 0) / 36);
    expect(mean[1], `complete rack post at ${x},${y}`).toBeGreaterThan(mean[0] + 20);
    expect(mean[2], `complete rack post at ${x},${y}`).toBeGreaterThan(mean[0] + 15);
  }
  await page.screenshot({ path: `docs/screenshots/warehouse-cold-rack-fixed-${info.project.name}.png` });
});

for (const renderer of ['default', 'canvas2d'] as const) test(`Pallet keeps its complete rear corner in front of the rack at steps 13 and 14 (${renderer})`, async ({ page }, info) => {
  test.setTimeout(300_000);
  if (renderer === 'canvas2d') await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, kind: string, ...args: any[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : Reflect.apply(getContext, this, [kind, ...args]);
    } as typeof getContext;
  });
  const directory = `artifacts/warehouse-pallet/${info.project.name}-${renderer}`;
  await mkdir(directory, { recursive: true });
  for (let works = 12; works <= 26; works++) {
    await openState(page, 'warehouse-1', works); await view(page, 'warehouse');
    if (renderer === 'canvas2d') await expect(page.locator(scene)).toHaveAttribute('data-renderer', 'canvas2d');
    if (works >= 13) {
      // One real screenshot supplies the whole pallet ROI. Samples cover the
      // rear deck and supporting blocks, including the formerly teal corner.
      const pixels = await sceneSourcePixels(page, surface, [775, 540, 270, 130]);
      const meanAt = (x: number, y: number) => [0, 1, 2].map(channel => {
        let sum = 0;
        for (let dy = -3; dy < 3; dy++) for (let dx = -3; dx < 3; dx++)
          sum += pixels[((y + dy - 540) * 270 + x + dx - 775) * 4 + channel];
        return sum / 36;
      });
      const corner = meanAt(1017, 583);
      expect(corner[0] - corner[2], `intact rear deck at step ${works}`).toBeGreaterThan(95);
      // Compare complete blocks with their intact donor, allowing exposure
      // and Chromium's resampling at 360 px. Floor and teal cuts differ widely.
      for (const [x, y, reference] of [
        [790, 592, [229, 139, 60]], [852, 617, [229, 139, 69]],
        [931, 640, [219, 129, 59]], [1024, 612, [84, 38, 10]],
      ] as const) {
        const mean = meanAt(x, y);
        expect(mean.reduce((sum, value, channel) => sum + Math.abs(value - reference[channel]), 0) / 3,
          `complete supporting block ${x},${y} at step ${works}`).toBeLessThan(30);
      }
    }
    await writeFile(`${directory}/${works}.png`, await scenePNG(page, surface));
    if ([13, 14].includes(works)) {
      const before = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
      await page.reload(); await view(page, 'warehouse');
      expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
      await expect(page.locator(scene)).toHaveAttribute('data-art-version', 'warehouse-rooms-8');
      if (renderer === 'default') await page.screenshot({ path: `docs/screenshots/warehouse-pallet-${works}-${info.project.name}.png` });
    }
  }
});
