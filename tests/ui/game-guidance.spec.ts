import {enterMapBuilding} from './hall-frame';
import { test, expect, type Page } from "@playwright/test";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";
import { projectOrders, projectTasks } from "../../src/campaign";
import { offlineChapterLevel } from "../../src/content-offline";
import { initial } from "../../src/engine";
import { createOrderAppearance } from "../../src/order-supplies";

async function seed(page: Page, progress: Progress) {
  progress.settings.sound = false;
  await page.goto("/");
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload();
  await expect(page.locator('.world-hud')).toBeVisible();
}
const light = (page: Page, selector = '.world-main-action') => page.locator(selector).evaluate(element => {
  const style = getComputedStyle(element, '::after');
  const box = element.getBoundingClientRect();
  return { animation: style.animationName, opacity: style.opacity, box: { x: box.x, y: box.y, width: box.width, height: box.height }, transform: getComputedStyle(element).transform };
});
function finishedShop() {
  const progress = freshProgress();
  progress.completed = projectOrders('shop-1').map(order => order.id);
  progress.campaign.completedTasks = projectTasks('shop-1').map(task => task.id);
  return progress;
}

test('next action follows play, pinned continuation, affordable build and another room', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const progress = freshProgress();
  await seed(page, progress);
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'play');
  await expect(page.locator('.world-target .target-hand')).toHaveCount(0);
  expect((await light(page)).animation).toBe('guidance-light');
  progress.repairKits = 6;
  await seed(page, progress);
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'buy-task');
  await expect(page.locator('.world-target')).toHaveAttribute('data-guide', 'build');
  expect(await page.locator('.world-target').evaluate(element => getComputedStyle(element).position)).toBe('absolute');
  progress.campaign.completedTasks = projectTasks('shop-1').slice(0, 10).map(task => task.id);
  progress.completed = projectOrders('shop-1').slice(0, 57).map(order => order.id);
  progress.repairKits = 0;
  const definition = offlineChapterLevel(58);
  progress.attempt = { id: 'guide-pinned', definition, appearance: createOrderAppearance(definition), board: initial(definition), undo: [], solution: definition.verifiedSolution, mixCount: 0, hints: {}, reward: null };
  progress.attempts['shop-1'] = progress.attempt;
  await seed(page, progress);
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'continue');
  await page.locator('.world-globe').click();
  await page.locator('.navigation-view-card[data-view="hall"]').click();
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'show-target');
  await page.locator('.world-main-action').click();
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'continue');
  const actual = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(actual.attempt).toEqual(progress.attempt);
});

test('exhausted project funding points to an available project with orders', async ({ page }) => {
  const progress = finishedShop();
  progress.completed.push(...projectOrders('warehouse-1').map(order => order.id), ...projectOrders('shop-2').map(order => order.id));
  progress.campaign.completedTasks.push(...projectTasks('warehouse-1').map(task => task.id));
  progress.selectedProject = 'shop-2';
  await seed(page, progress);
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'funding');
  await page.locator('.world-main-action').click();
  await expect(page.locator('.world-pin[data-area="warehouse"]')).toHaveAttribute('data-guide', 'map-pin');
  await expect(page.locator('.world-main-action[data-guide="entry"]')).toHaveCount(0);
  await enterMapBuilding(page,'warehouse');
  await expect(page.locator('.world.in-shop')).toHaveAttribute('data-project','warehouse-2');
  await expect(page.locator('.world-map')).toHaveCount(0);
});

test('map guides to the warehouse room choice and uses round keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const progress = finishedShop();
  await seed(page, progress);
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'continue-journey');
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  const pin = page.locator('.world-pin[data-area="warehouse"]');
  await expect(pin).toHaveAttribute('data-guide', 'map-pin');
  await expect(pin).toHaveAttribute('data-action','select-project');
  await expect(page.locator('.on-map .world-main-action')).toHaveCount(1);
  const pointer = await pin.evaluate(element => ({ keyboard: element.matches(':focus-visible'), outline: getComputedStyle(element).outlineStyle, shadow: getComputedStyle(element).boxShadow }));
  expect(pointer.outline).toBe('none');
  expect(pointer.shadow).toBe('none');
  await page.keyboard.press('Tab');
  await pin.focus();
  const keyboard = await pin.evaluate(element => ({ keyboard: element.matches(':focus-visible'), outline: getComputedStyle(element).outlineStyle, round: getComputedStyle(element.querySelector('span')!).borderRadius, circleOutline: getComputedStyle(element.querySelector('span')!).outlineStyle }));
  expect(keyboard.keyboard).toBe(true);
  expect(keyboard.outline).toBe('none');
  expect(keyboard.round).toBe('50%');
  expect(keyboard.circleOutline).toBe('solid');
  await pin.press('Enter');
  await expect(page.locator('.modal-navigation')).toBeVisible();
  await page.locator('.navigation-view-card[data-project="warehouse-1"]').first().click();
  await expect(page.locator('.world')).toHaveAttribute('data-project', 'warehouse-1');
});

test('normal order victory highlights the result next action and unlocked navigation notice', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const progress = freshProgress();
  progress.completed = projectOrders('shop-1').slice(0, 3).map(order => order.id);
  progress.repairKits = 3;
  const definition = offlineChapterLevel(4);
  progress.attempt = { id: 'guide-result', definition, appearance: createOrderAppearance(definition), board: initial(definition), undo: [], solution: definition.verifiedSolution, mixCount: 0, hints: {}, reward: null };
  progress.attempts['shop-1'] = progress.attempt;
  await seed(page, progress);
  await page.locator('.world-main-action').click();
  await page.getByRole('button', { name: 'Дебаг', exact: true }).click();
  await page.getByRole('button', { name: 'Пройти уровень', exact: true }).click();
  await expect(page.locator('.modal-result [data-guide="result-next"]')).toBeVisible();
  expect((await light(page, '.modal-result [data-guide="result-next"]')).animation).toBe('guidance-light');
  await page.locator('.modal-result [data-guide="result-next"]').click();
  await expect(page.locator('.game-topbar')).toBeVisible();
  await seed(page, finishedShop());
  await page.locator('.world-globe').click();
  await expect(page.locator('.modal-navigation [data-guide="next-place"]')).toBeVisible();
  expect((await light(page, '.modal-navigation [data-guide="next-place"]')).animation).toBe('guidance-light');
});

test('light animates without moving hit boxes, while setting and OS preference keep static guidance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const progress = freshProgress();
  await seed(page, progress);
  const start = await light(page);
  const samples = await page.locator('.world-main-action').evaluate(element => {
    const animation = element.getAnimations({ subtree: true }).find(animation => (animation as CSSAnimation).animationName === 'guidance-light')!;
    animation.pause();
    animation.currentTime = 0;
    const a = getComputedStyle(element, '::after').opacity;
    animation.currentTime = 1200;
    const b = getComputedStyle(element, '::after').opacity;
    return { a, b };
  });
  expect(samples.a).not.toBe(samples.b);
  expect((await light(page)).box).toEqual(start.box);
  progress.settings.reducedMotion = true;
  await seed(page, progress);
  expect((await light(page)).animation).toBe('none');
  expect((await light(page)).opacity).toBe('1');
  progress.settings.reducedMotion = false;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, progress);
  expect((await light(page)).animation).toBe('none');
  expect((await light(page)).opacity).toBe('1');
  await expect(page.locator('.world-main-action')).toHaveAttribute('data-guide', 'play');
});

test('guidance fits desktop, 384 and 360 phones, tablet and short windows', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Viewport matrix runs once.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const [width, height] of [[1280, 900], [384, 720], [360, 640], [768, 1024], [360, 400], [640, 360]]) {
    await page.setViewportSize({ width, height });
    await seed(page, finishedShop());
    await page.locator('.world-scene-back[data-action="show-map"]').click();
    const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, controls: [...document.querySelectorAll('.world-main-action,.world-pin')].map(element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; }) }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    for (const box of geometry.controls) {
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(height);
    }
    expect((await light(page, '.world-pin[data-guide="map-pin"] > span')).animation).toBe('guidance-light');
    await page.screenshot({ path: `docs/screenshots/guidance-map-${width}x${height}.png` });
  }
});

test('the recommended room pulses in light while keeping its card and progress unchanged', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  const p=finishedShop();p.completed.push(...projectOrders('warehouse-1').map(o=>o.id));p.campaign.completedTasks.push(...projectTasks('warehouse-1').map(t=>t.id));p.selectedProject='shop-2';
  await seed(page,p);await page.locator('.world-globe').click();
  const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
  const action=page.locator('.room-next .room-card-action');
  const sample=await action.evaluate(element=>{
    const animation=element.getAnimations().find(a=>(a as CSSAnimation).animationName==='journey-invitation')!;
    const rect=()=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    animation.pause();animation.currentTime=0;const a=getComputedStyle(element).boxShadow,box=rect();animation.currentTime=1600;
    return {a,b:getComputedStyle(element).boxShadow,box,after:rect()};
  });
  expect(sample.a).not.toBe(sample.b);expect(sample.after).toEqual(sample.box);
  expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(before);
  await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.world-globe').click();
  expect(await action.evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
});


test('warehouse registered canvas views preserve fixed, round guided targets', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Warehouse guidance viewport matrix runs once.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const milestones = [['warehouse-1', 0, 'warehouse-yard'], ['warehouse-1', 14, 'warehouse'], ['warehouse-1', 19, 'warehouse-receiving'], ['warehouse-2', 0, 'warehouse-cold'], ['warehouse-2', 12, 'warehouse-receiving']] as const;
  for (const [width, height] of [[1280, 900], [360, 640], [640, 360]]) {
    await page.setViewportSize({ width, height });
    for (const [project, step, view] of milestones) {
      const progress = finishedShop();
      progress.selectedProject = project;
      if (project === 'warehouse-2') {
        progress.completed.push(...projectOrders('warehouse-1').map(order => order.id));
        progress.campaign.completedTasks.push(...projectTasks('warehouse-1').map(task => task.id));
      }
      progress.campaign.completedTasks.push(...projectTasks(project).slice(0, step).map(task => task.id));
      // The fixture funds the next affordance; economic payment invariants are covered separately.
      progress.stars = 1000; progress.repairKits = 1000;
      await seed(page, progress);
      await expect(page.locator('.world-scene > .warehouse-composition')).toHaveAttribute('data-scene-view', view);
      await expect(page.locator('.world-scene > .warehouse-composition')).toHaveAttribute('data-scene-ready', 'true');
      await expect(page.locator('.world-target')).toHaveAttribute('data-guide', 'build');
      const shape = await page.locator('.world-target').evaluate(element => {
        const rect = () => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
        const style = getComputedStyle(element), matrix = new DOMMatrix(style.transform);
        const before = rect();
        const animation = element.getAnimations({ subtree: true }).find(animation => (animation as CSSAnimation).animationName === 'guidance-light')!;
        animation.pause(); animation.currentTime = 1200;
        const after = rect(), ring = getComputedStyle(element, '::after');
        const hit = document.elementFromPoint(before.x + before.width / 2, before.y + before.height / 2);
        return { position: style.position, round: style.borderRadius, rotation: [matrix.b, matrix.c], ringTransform: ring.transform, ringAnimation: ring.animationName, before, after, hit: !!hit && element.contains(hit) };
      });
      expect(shape.position).toBe('absolute'); expect(shape.round).toBe('50%'); expect(shape.rotation).toEqual([0, 0]);
      expect(shape.ringTransform).toBe('none'); expect(shape.ringAnimation).toBe('guidance-light');
      expect(shape.after).toEqual(shape.before); expect(shape.hit).toBe(true);
      expect(shape.before.width).toBeGreaterThanOrEqual(44); expect(shape.before.height).toBeGreaterThanOrEqual(44);
      expect(shape.before.x).toBeGreaterThanOrEqual(0); expect(shape.before.right).toBeLessThanOrEqual(width);
      expect(shape.before.y).toBeGreaterThanOrEqual(0); expect(shape.before.bottom).toBeLessThanOrEqual(height);
      if (width === 360) await page.screenshot({ path: `docs/screenshots/guidance-${view}-${project}-360x640.png` });
    }
  }
});
