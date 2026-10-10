import {test,expect,type Page} from '@playwright/test';
import {CHAPTER} from '../../src/content';
import {projectOrders,projectTasks,type ProjectId} from '../../src/campaign';
import {freshProgress,STORAGE_KEY,type Progress} from '../../src/storage';
import {initial} from '../../src/engine';
import {offlineChapterLevel} from '../../src/content-offline';
import {createOrderAppearance} from '../../src/order-supplies';
const saved=(page:Page):Promise<Progress>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
async function seed(page:Page,p:Progress){
  p.settings.sound=false;p.settings.reducedMotion=true;
  await page.goto('/');await page.evaluate(({key,p})=>localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});
  await page.reload();await expect(page.locator('.world-hud')).toBeVisible();
}
function finish(p:Progress,id:ProjectId){
  p.completed.push(...projectOrders(id).map(o=>o.id));p.campaign.completedTasks.push(...projectTasks(id).map(t=>t.id));
}
async function map(page:Page){
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await expect(page.locator('.world.on-map')).toBeVisible();
  await expect(page.locator('.on-map .world-main-action')).toHaveCount(1);
}
test('a map pin chooses a room before changing project and preserves both pinned orders',async({page})=>{
  const p=freshProgress();finish(p,'shop-1');finish(p,'warehouse-1');p.selectedProject='shop-2';
  for(const id of ['shop-2','warehouse-2'] as const){
    const def=offlineChapterLevel(CHAPTER.findIndex(o=>o.id===projectOrders(id)[0].id)+1);
    p.attempts[id]={id:`map-${id}`,definition:def,appearance:createOrderAppearance(def),board:initial(def),undo:[],solution:def.verifiedSolution,mixCount:0,hints:{},reward:null};
  }
  p.attempt=p.attempts['shop-2']!;p.coins=900;p.stars=7;p.repairKits=4;
  await seed(page,p);const before=await saved(page);
  for(const [area,id] of [['warehouse','warehouse-2'],['fruit-yard','fruit-yard-1'],['shop','shop-2']] as const){
    await map(page);
    const atMap=await saved(page);
    const pin=page.locator(`.world-pin[data-area="${area}"]`);
    if(area==='warehouse')await pin.press('Enter');else await pin.click();
    await expect(page.locator('.modal-navigation')).toBeVisible();
    expect(await saved(page)).toEqual(atMap);
    const unchanged=await saved(page);
    await page.keyboard.press('Escape');expect(await saved(page)).toEqual(unchanged);
    await expect(pin).toBeFocused();await pin.click();
    await page.locator(`.modal-navigation .navigation-view-card[data-project="${id}"]`).first().click();
    await expect(page.locator('.world.in-shop')).toHaveAttribute('data-project',id);
    await expect(page.locator('.world-map')).toHaveCount(0);
    const after=await saved(page);
    expect(after.attempts).toEqual(before.attempts);expect(after.completed).toEqual(before.completed);
    expect(after.campaign).toEqual(before.campaign);expect([after.coins,after.stars,after.repairKits]).toEqual([900,7,4]);
  }
  expect((await saved(page)).attempt).toEqual(before.attempt);
  await page.reload();expect((await saved(page)).attempt).toEqual(before.attempt);
});
test('the map keeps the same bounds for one-stage, two-stage and locked buildings',async({page},info)=>{
  test.skip(info.project.name!=='desktop','The explicit viewport matrix runs once.');
  for(const [width,height] of [[1280,720],[360,640],[384,720],[360,400],[768,1024],[1024,768],[640,360]]){
    await page.setViewportSize({width,height});
    const p=freshProgress();finish(p,'shop-1');finish(p,'warehouse-1');p.selectedProject='shop-2';
    await seed(page,p);await map(page);
    const rect=async()=>page.locator('.world-map').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
    const baseline=await rect();
    for(const area of ['warehouse','fruit-yard','shop','restaurant','bakery','terrace','shop'] as const){
      await page.locator(`.world-pin[data-area="${area}"]`).click();
      if(await page.locator('.modal-navigation').count())await page.keyboard.press('Escape');
      if(await page.locator('.world.in-shop').count())await map(page);
      const actual=await rect();
      for(const key of ['x','y','width','height'] as const)expect(Math.abs(actual[key]-baseline[key]),`${area} ${width}×${height} ${key}`).toBeLessThan(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      const boxes=await page.locator('.world-map-action').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
      for(const b of boxes){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);expect(b.bottom).toBeLessThanOrEqual(height-23);expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}
    }
    await page.screenshot({path:`docs/screenshots/map-direct-entry-${width}x${height}.png`});
  }
});
test('locked pins only explain the unlock requirements and never change the save',async({page},info)=>{
  const p=freshProgress();await seed(page,p);await map(page);const before=await saved(page);
  const baseline=await page.locator('.world-map').boundingBox();
  await page.locator('.world-pin[data-area="warehouse"]').click();
  await expect(page.locator('.world-map-status')).toContainText('Осталось заказов: 80, работ: 14');
  await expect(page.locator('.world-map-action')).toHaveText(/В лавку/);
  await expect(page.locator('.world-map-action')).toHaveAttribute('data-project','shop-1');
  const action=page.locator('.world-map-action'),r=(await action.boundingBox())!,viewport=page.viewportSize()!;
  expect(r.height).toBeGreaterThanOrEqual(44);expect(r.y+r.height).toBeLessThanOrEqual(viewport.height-23);
  expect(await action.evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  expect(await action.evaluate(b=>{const r=b.getBoundingClientRect(),walk=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);const boxes:DOMRect[]=[];let node;while(node=walk.nextNode()){if(!node.textContent?.trim())continue;const range=document.createRange();range.selectNodeContents(node);boxes.push(...range.getClientRects());}return boxes.every(t=>t.top>=r.top+3&&t.bottom<=r.bottom-3&&t.left>=r.left+3&&t.right<=r.right-3);})).toBe(true);
  await page.screenshot({path:`docs/screenshots/journey-map-locked-${info.project.name}.png`});
  expect(await page.locator('.world-map').boundingBox()).toEqual(baseline);expect(await saved(page)).toEqual(before);
});
