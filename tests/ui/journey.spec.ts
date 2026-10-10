import {test,expect,type Page} from '@playwright/test';
import {freshProgress,STORAGE_KEY,type Progress} from '../../src/storage';
import {projectOrders,projectTasks,type ProjectId} from '../../src/campaign';
import {applyDebugSceneState} from '../../src/debug-scene';
import {offlineChapterLevel} from '../../src/content-offline';
import {CHAPTER} from '../../src/content';
import {applyMove,initial} from '../../src/engine';
import {createOrderAppearance} from '../../src/order-supplies';
import {settleHallFrame,expectWholeHallFrame} from './hall-frame';
function finish(p:Progress,id:ProjectId){p.completed.push(...projectOrders(id).map(o=>o.id));p.campaign.completedTasks.push(...projectTasks(id).map(t=>t.id));}
async function seed(page:Page,p:Progress){p.settings.sound=false;p.settings.reducedMotion=true;await page.goto('/');await page.evaluate(({key,p})=>localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});await page.reload();if(await page.locator('.world-scene>.hall-composition').count())await settleHallFrame(page);else await expect(page.locator('.world-map')).toBeVisible();}
const saved=(page:Page):Promise<Progress>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
for(const [source,target] of [['shop-1','warehouse-1'],['warehouse-1','warehouse-2'],['shop-2','warehouse-2'],['fruit-yard-1','fruit-yard-2'],['fruit-yard-2','shop-2']] as const)test(`Finished ${source} continues to the actual ${target} work room without an intermediate map`,async({page},info)=>{
  const p=freshProgress();expect(applyDebugSceneState(p,{projectId:source,works:projectTasks(source).length,orders:projectOrders(source).length}).ok).toBe(true);
  if(source==='shop-2'){finish(p,'fruit-yard-1');finish(p,'fruit-yard-2');} // leave warehouse as the unfinished branch
  if(source==='fruit-yard-2')finish(p,'warehouse-2');
  const definition=offlineChapterLevel(CHAPTER.findIndex(o=>o.id===projectOrders(target)[0].id)+1),board=initial(definition),move=definition.verifiedSolution[0];
  const played=applyMove(board,...move)!;
  p.attempts[target]={id:`journey-${target}`,definition,appearance:createOrderAppearance(definition),board:played,undo:[board],solution:definition.verifiedSolution.slice(1),mixCount:0,hints:{},reward:null};
  p.attempt=null;p.stars=0;p.repairKits=0;
  await seed(page,p);const before=await saved(page);
  const action=page.locator('.world-main-action');await expect(action).toHaveAttribute('data-action','continue-journey');await expect(action).toHaveAttribute('data-project',target);
  await expect(page.locator('.world-dock')).not.toContainText(/этап\s*[12]|Можно начинать/i);
  await action.click();await expect(page.locator('.world.in-shop')).toHaveAttribute('data-project',target);await expect(page.locator('.world-map,.modal-navigation')).toHaveCount(0);await expectWholeHallFrame(page);
  const after=await saved(page);expect(after.attempt).toEqual(before.attempts[target]);expect(after.attempts).toEqual(before.attempts);expect(after.campaign).toEqual(before.campaign);expect(after.completed).toEqual(before.completed);expect([after.stars,after.repairKits,after.coins]).toEqual([before.stars,before.repairKits,before.coins]);
  await page.reload();await settleHallFrame(page);expect((await saved(page)).attempt).toEqual(after.attempt);
  await page.screenshot({path:`docs/screenshots/journey-${source}-to-${target}-${info.project.name}.png`});
});
test('Map and room cards always provide the next action without player-facing stage controls',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Explicit window matrix runs once.');
  for(const [width,height] of [[1280,900],[360,640],[360,400],[768,1024],[1024,768],[640,360]]){
    await page.setViewportSize({width,height});const p=freshProgress();finish(p,'shop-1');finish(p,'warehouse-1');p.selectedProject='shop-2';await seed(page,p);
    await page.locator('.world-scene-back[data-action="show-map"]').click();
    const action=page.locator('.world-map-action');await expect(action).toBeVisible();await expect(action).toHaveAttribute('data-project','shop-2');await expect(page.locator('.world-map-stages')).toHaveCount(0);
    const r=(await action.boundingBox())!;expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.y+r.height).toBeLessThanOrEqual(height-23);expect(await action.evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    expect(await action.evaluate(b=>{const r=b.getBoundingClientRect(),walk=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);const boxes:DOMRect[]=[];let node;while(node=walk.nextNode()){if(!node.textContent?.trim())continue;const range=document.createRange();range.selectNodeContents(node);boxes.push(...range.getClientRects());}return boxes.every(t=>t.top>=r.top+3&&t.bottom<=r.bottom-3&&t.left>=r.left+3&&t.right<=r.right-3);})).toBe(true);
    await page.screenshot({path:`docs/screenshots/journey-map-${width}x${height}.png`});
    const json=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);await page.locator('.world-pin[data-area="shop"]').click();await expect(page.locator('.room-next')).toHaveCount(1);await expect(page.locator('.room-next')).toHaveAttribute('data-view','shop-grocery');await expect(page.locator('.modal-navigation')).not.toContainText(/этап\s*[12]/i);
    const close=page.locator('.modal-navigation > .modal-close');
    const closeReachable=async()=>{const r=(await close.boundingBox())!;expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(height);expect(await close.evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);};
    await closeReachable();await page.screenshot({path:`docs/screenshots/journey-rooms-open-${width}x${height}.png`});await page.locator('.room-next').scrollIntoViewIfNeeded();await closeReachable();await page.screenshot({path:`docs/screenshots/journey-rooms-${width}x${height}.png`});await page.keyboard.press('Escape');expect(await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)).toBe(json);
    await action.click();await expectWholeHallFrame(page);await expect(page.locator('.world.in-shop')).toHaveAttribute('data-project','shop-2');
  }
});
test('A completed courtyard keeps room visits available and does not offer unimplemented work',async({page},info)=>{
  const p=freshProgress();for(const id of ['shop-1','warehouse-1','shop-2','warehouse-2','fruit-yard-1','fruit-yard-2','bakery-1'] as const)finish(p,id);
  p.selectedProject='fruit-yard-2';await seed(page,p);if(await page.locator('.world-main-action[data-action="finish"]').count())await page.locator('.world-main-action[data-action="finish"]').click();
  await expect(page.locator('.world.on-map')).toBeVisible();await expect(page.locator('.world-map-action')).toHaveText(/Осмотреть помещения/);
  await expect(page.locator('.world-dock')).not.toContainText(/этап|Можно начинать/i);const action=page.locator('.world-map-action');const r=(await action.boundingBox())!;expect(r.y+r.height).toBeLessThanOrEqual(info.project.name==='desktop'?900-23:640-23);
  await page.screenshot({path:`docs/screenshots/journey-courtyard-complete-${info.project.name}.png`});await action.click();await expect(page.locator('.modal-navigation')).toBeVisible();await page.locator('.navigation-view-card[data-view="fruit-extension"]').click();await expectWholeHallFrame(page);
});
