import { finishScenePurchase } from './scene-purchase';
import { test, expect, type Page } from "@playwright/test";
import { projectOrders, projectTasks, type ProjectId } from "../../src/campaign";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";
import { offlineChapterLevel } from "../../src/content-offline";
import { initial } from "../../src/engine";
import { createOrderAppearance } from "../../src/order-supplies";
import { chooseWorldView, expectWholeHallFrame, enterMapBuilding } from "./hall-frame";

const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function seed(page: Page, progress: Progress) {
  progress.settings.reducedMotion = true; progress.settings.sound = false;
  await page.goto("/");
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload();
  await expect(page.locator('.world-hud')).toBeVisible();
}
function finish(progress: Progress, phase: ProjectId) {
  progress.completed.push(...projectOrders(phase).map(order => order.id));
  progress.campaign.completedTasks.push(...projectTasks(phase).map(task => task.id));
}
async function globe(page: Page) {
  await page.getByRole('button', { name: 'Навигация по двору', exact: true }).click();
  await expect(page.locator('.modal-navigation')).toBeVisible();
  await expect(page.locator('.navigation-view-card[data-view="hall"],.navigation-view-card[data-view="hall-prep"]')).toHaveCount(2);
  for (const preview of await page.locator('.modal-navigation .hall-composition').all()) await expect(preview).toHaveAttribute('data-scene-ready','true');
  await page.locator('.modal-navigation').evaluate(async modal => { await Promise.all([...modal.querySelectorAll('img')].map(image => image.decode())); });
}

test('globe whole-view cards and yard previews preserve the pinned order and purchases', async ({ page }, info) => {
  const progress = freshProgress();
  progress.campaign.completedTasks = projectTasks('shop-1').slice(0,10).map(task => task.id);
  progress.completed = projectOrders('shop-1').slice(0,57).map(order => order.id);
  progress.renovations.counter = 'honey';
  const definition = offlineChapterLevel(58);
  progress.attempt = { id:'navigation-pinned', definition, appearance:createOrderAppearance(definition), board:initial(definition), undo:[], solution:definition.verifiedSolution, mixCount:0, hints:{}, reward:null };
  progress.attempts['shop-1'] = progress.attempt;
  await seed(page, progress);
  const before = await saved(page);
  await globe(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-navigation')).toHaveCount(0);
  await expect(page.locator('.world-globe')).toBeFocused();
  expect(await saved(page)).toEqual(before);
  await chooseWorldView(page,'hall-prep',true);
  await expectWholeHallFrame(page);
  await globe(page);
  await expect(page.locator('.navigation-view-card[data-view="hall-prep"]')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({ path:`docs/screenshots/navigation-modal-${info.project.name}.png` });
  await page.locator('.navigation-up').click();
  await expect(page.locator('.world-map')).toBeVisible();
  await enterMapBuilding(page,'warehouse');
  expect(await saved(page)).toEqual(before);
  await expect(page.locator('.world-main-action[data-action="select-project"]')).toHaveCount(0);
  await page.locator('.world-scene-back[data-action="home"]').click();
  await expect(page.locator('.world-scene > .shop-composition')).toHaveAttribute('data-scene-view','hall-prep');
  await chooseWorldView(page,'hall');
  expect(await saved(page)).toEqual(before);
  await expect(page.locator('.world-dock .world-hall-view,.world-room-selector')).toHaveCount(0);
});

test('the final shop job offers warehouse continuation and its optional map offers room entry', async ({ page }, info) => {
  const progress = freshProgress();
  progress.completed = projectOrders('shop-1').map(order => order.id);
  progress.campaign.completedTasks = projectTasks('shop-1').slice(0,13).map(task => task.id);
  progress.stars = projectTasks('shop-1')[13].cost;
  await seed(page,progress);
  await expect(page.locator('.world-mission h2')).not.toHaveText('Склад');
  await globe(page);
  await expect(page.locator('.navigation-notice')).toHaveCount(0);
  await page.locator('.navigation-up').click();
  await enterMapBuilding(page,'warehouse');
  await expect(page.locator('.world-main-action[data-action="select-project"]')).toHaveCount(0);
  await page.locator('.world-scene-back').click();
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await finishScenePurchase(page);
  await expect(page.locator('.world-mission h2')).toHaveText('Склад');
  await expect(page.locator('.world-main-action')).toHaveText(/К складу/);
  await expect(page.locator('.world-globe')).toHaveClass(/has-destination/);
  await globe(page);
  await expect(page.locator('.navigation-view-card[data-view="shop-grocery"]')).toHaveCount(0);
  await page.locator('.navigation-view-card[data-view="hall"]').click();
  const beforePreview = await saved(page);
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await expect(page.locator('.world-map-action')).toHaveAttribute('data-project','warehouse-1');
  await expect(page.locator('.world-pin[data-area="warehouse"] .world-pin-badge')).toHaveText('Открыт');
  await expect(page.locator('.world-pin[data-area="shop"] .world-pin-badge')).toHaveText('Вы здесь');
  expect(await saved(page)).toEqual(beforePreview);
  await page.screenshot({ path:`docs/screenshots/navigation-warehouse-${info.project.name}.png` });
  await expect(page.locator('.on-map .world-main-action')).toHaveCount(1);
  await enterMapBuilding(page,'warehouse');
  expect((await saved(page)).selectedProject).toBe('warehouse-1');
  await expect(page.locator('.world-map')).toHaveCount(0);
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await expect(page.locator('.world-pin[data-area="warehouse"] .world-pin-badge')).toHaveText('Вы здесь');
  await page.locator('.world-scene-back[data-action="home"]').click();
  expect((await saved(page)).selectedProject).toBe('warehouse-1');
});

test('room cards keep the earlier hall available without exposing stage selectors', async ({ page }) => {
  const progress = freshProgress(); finish(progress,'shop-1'); finish(progress,'warehouse-1');
  progress.selectedProject = 'shop-2';
  await seed(page,progress);
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await expect(page.locator('.world-map-stages button')).toHaveCount(0);
  await page.locator('.world-pin[data-area="shop"]').click();
  await page.locator('.modal-navigation .navigation-view-card[data-project="shop-1"]').first().click();
  expect((await saved(page)).selectedProject).toBe('shop-1');
  await globe(page);
  await expect(page.locator('.navigation-current')).toHaveText('Лавка');
  await page.locator('.navigation-up').click();
  await page.locator('.world-pin[data-area="shop"]').click();
  await page.locator('.modal-navigation .navigation-view-card[data-project="shop-2"]').first().click();
  expect((await saved(page)).selectedProject).toBe('shop-2');
});

test('navigation targets and scrollable whole-view cards fit short mobile and tablet', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop','Viewport matrix runs once.');
  const progress = freshProgress(); finish(progress,'shop-1');
  progress.coins=1800; progress.stars=421; progress.repairKits=179;
  await seed(page,progress);
  for (const [width,height] of [[1280,900],[360,640],[360,400],[768,1024]]) {
    await page.setViewportSize({ width,height });
    await expectWholeHallFrame(page);
    const hud = await page.locator('.world-hud').evaluate(element => {
      const rect=(node:Element)=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      return {box:rect(element),items:[...element.children].map(rect),buttons:[...element.querySelectorAll(':scope > button')].map(rect),chips:[...element.querySelectorAll('.world-currency')].map(rect)};
    });
    expect(hud.buttons).toHaveLength(4); expect(hud.chips).toHaveLength(3);
    for(const button of hud.buttons) {expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);}
    for(const item of [...hud.items,...hud.chips]) {expect(item.x).toBeGreaterThanOrEqual(0);expect(item.right).toBeLessThanOrEqual(width);expect(item.bottom).toBeLessThanOrEqual(hud.box.bottom);}
    for(let i=1;i<hud.items.length;i++) expect(hud.items[i].x).toBeGreaterThanOrEqual(hud.items[i-1].right);
    await globe(page);
    const dialog=(await page.locator('.modal-navigation').boundingBox())!;
    expect(dialog.x).toBeGreaterThanOrEqual(0);expect(dialog.y).toBeGreaterThanOrEqual(0);
    expect(dialog.x+dialog.width).toBeLessThanOrEqual(width);expect(dialog.y+dialog.height).toBeLessThanOrEqual(height);
    for(const button of await page.locator('.modal-navigation button').all()) {
      await button.scrollIntoViewIfNeeded();
      const rect=(await button.boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(44);expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);
    }
    await page.locator('.navigation-view-card[data-view="hall"]').click();
    await expectWholeHallFrame(page);
  }
});

test('map status, unlock counts and stage choices retain bottom space', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop','Viewport matrix runs once.');
  for (const [width,height] of [[1280,720],[360,640],[360,400],[768,1024]]) {
    await page.setViewportSize({ width,height });
    for (const state of ['ordinary','locked','stages'] as const) {
      const progress=freshProgress();
      if(state==='stages'){finish(progress,'shop-1');finish(progress,'warehouse-1');}
      await seed(page,progress);
      await page.locator('.world-scene-back[data-action="show-map"]').click();
      if(state==='locked') {
        await enterMapBuilding(page,'warehouse');
        await expect(page.locator('.world-map-status')).toContainText('Завершите все 80 заказов и 14 работ');
        await expect(page.locator('.world-map-status')).toContainText('Осталось заказов: 80, работ: 14');
      }
      const layout=await page.locator('.world-dock').evaluate(dock=>{
        const rect=(element:Element)=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const status=dock.querySelector('.world-map-status')!;
        return {status:rect(status),scroll:status.scrollHeight,client:status.clientHeight,children:[...dock.children].map(rect),buttons:[...dock.querySelectorAll('button')].map(rect)};
      });
      expect(layout.status.bottom,`${state} ${width}×${height}`).toBeLessThanOrEqual(height-23);
      expect(layout.scroll).toBeLessThanOrEqual(layout.client+1);
      for(const button of layout.buttons){expect(button.width).toBeGreaterThanOrEqual(44);expect(button.height).toBeGreaterThanOrEqual(44);expect(button.bottom).toBeLessThanOrEqual(height-23);}
      for(const child of layout.children){expect(child.x).toBeGreaterThanOrEqual(0);expect(child.right).toBeLessThanOrEqual(width);}
      if(width===360&&state==='locked') await page.screenshot({path:`docs/screenshots/navigation-locked-${width}x${height}.png`});
    }
  }
});

test('all six buildings keep readable names and separate touch targets on the map', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop','Viewport matrix runs once.');
  for(const [width,height] of [[1280,720],[768,1024],[360,640],[360,400],[640,360]]) {
    await page.setViewportSize({width,height});
    for(const state of ['locked','new'] as const) {
      const progress=freshProgress();if(state==='new')finish(progress,'shop-1');
      await seed(page,progress);
      await page.locator('.world-scene-back[data-action="show-map"]').click();
      if(state==='locked')await enterMapBuilding(page,'warehouse');
      for(const name of await page.locator('.world-pin > b').all()) await expect(name).toBeVisible();
      for(const badge of await page.locator('.world-pin-badge').all()){
        const separated=await badge.evaluate(node=>{
          const a=node.getBoundingClientRect(),b=node.parentElement!.querySelector('b')!.getBoundingClientRect();
          return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;
        });
        expect(separated,`${width}×${height} ${state}: badge does not cover building name`).toBe(true);
      }
      const geometry=await page.evaluate(()=>{
        const rect=(node:Element)=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        return {hud:rect(document.querySelector('.world-hud')!),dock:rect(document.querySelector('.world-dock')!),back:rect(document.querySelector('.world-scene-back')!),
          pins:[...document.querySelectorAll('.world-pin')].map(pin=>({box:rect(pin),name:rect(pin.querySelector('b')!),font:parseFloat(getComputedStyle(pin.querySelector('b')!).fontSize)}))};
      });
      expect(geometry.pins).toHaveLength(6);
      const separate=(a:{x:number;y:number;right:number;bottom:number},b:typeof a)=>a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y;
      for(const [i,pin] of geometry.pins.entries()) {
        expect(pin.font).toBeGreaterThanOrEqual(16);expect(pin.box.width).toBeGreaterThanOrEqual(44);expect(pin.box.height).toBeGreaterThanOrEqual(44);
        for(const box of [pin.box,pin.name]) {expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);expect(box.y).toBeGreaterThanOrEqual(geometry.hud.bottom);if(width>=600&&height<=500)expect(box.right).toBeLessThanOrEqual(geometry.dock.x);else expect(box.bottom).toBeLessThanOrEqual(geometry.dock.y);}
        expect(separate(pin.box,geometry.back),`${width}×${height} ${state}: map return`).toBe(true);
        for(const other of geometry.pins.slice(i+1))expect(separate(pin.box,other.box),`${width}×${height} ${state}: pin overlap`).toBe(true);
      }
      await page.screenshot({path:`docs/screenshots/navigation-map-names-${width}x${height}-${state}.png`});
    }
  }
});
