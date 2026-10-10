import { test, expect, type Page } from '@playwright/test';
import { freshProgress, STORAGE_KEY, type Progress } from '../../src/storage';
import { applyDebugSceneState } from '../../src/debug-scene';
import { projectTasks } from '../../src/campaign';
import { offlineChapterLevel } from '../../src/content-offline';
import { initial } from '../../src/engine';
import { sceneSourcePixels } from './scene-pixels';
import { chooseWorldView, expectWholeHallFrame } from './hall-frame';
import { finishScenePurchase } from './scene-purchase';

const saved=(page:Page):Promise<Progress>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
async function seed(page:Page,works:number,motion=false,warehouse=false) {
  const p=freshProgress();
  applyDebugSceneState(p,{projectId:warehouse?'warehouse-1':'shop-1',works,orders:0});
  p.settings.reducedMotion=!motion;p.settings.sound=false;
  if(!warehouse) {
    const definition=offlineChapterLevel(1);
    p.attempt={id:'polish-pinned-order',definition,board:initial(definition),undo:[],solution:definition.verifiedSolution,mixCount:0,hints:{},reward:null};
    p.attempts['shop-1']=p.attempt;
  }
  await page.goto('/');
  await page.evaluate(({p,key})=>localStorage.setItem(key,JSON.stringify(p)),{p,key:STORAGE_KEY});
  await page.reload();
  await expect(page.locator('.world-hud')).toBeVisible();
  if(!warehouse)await chooseWorldView(page,'hall');
  await expectWholeHallFrame(page);
  return saved(page);
}
async function pixels(page:Page,box:[number,number,number,number]) {
  return sceneSourcePixels(page,'.world-scene canvas',box);
}

function difference(a:number[],b:number[]) {let total=0;for(let i=0;i<a.length;i+=4)total+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);return total/(a.length/4*3);}
async function acknowledge(page:Page) {
  await finishScenePurchase(page);
}
const errors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));page.on('response',r=>{if(r.status()>=400)list.push(`${r.status()} ${r.url()}`);});});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));

test('Windows and door repair has a substantial visible change and keeps the whole room',async({page},info)=>{
  const before=await seed(page,2);
  const damaged=await pixels(page,[309,0,285,320]);
  await page.screenshot({path:`docs/screenshots/shop-polish-windows-before-${info.project.name}.png`});
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await acknowledge(page);
  await expectWholeHallFrame(page);
  expect(difference(damaged,await pixels(page,[309,0,285,320]))).toBeGreaterThan(18);
  const after=await saved(page);
  expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks,'shop-s1-r03']);
  expect(after.attempt).toEqual(before.attempt);
  await page.screenshot({path:`docs/screenshots/shop-polish-windows-after-${info.project.name}.png`});
});
test('Counter has a darker walnut top, full feet and a contact shadow',async({page},info)=>{
  await seed(page,9);
  await expect(page.locator('[data-contact-shadow="counter"]')).toHaveCount(1);
  const luminance=(d:number[])=>.2126*d[0]+.7152*d[1]+.0722*d[2];
  const colors={top:luminance(await pixels(page,[1000,600,1,1])),floor:luminance(await pixels(page,[680,800,1,1]))};
  expect(colors.floor-colors.top).toBeGreaterThan(35);
  await page.screenshot({path:`docs/screenshots/shop-polish-counter-${info.project.name}.png`});
});
test('Lighting installs actual fixtures in both complete room views',async({page},info)=>{
  const before=await seed(page,13);
  const dark=await pixels(page,[760,10,155,180]);
  await page.screenshot({path:`docs/screenshots/shop-polish-light-before-${info.project.name}.png`});
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await acknowledge(page);
  expect(difference(dark,await pixels(page,[760,10,155,180]))).toBeGreaterThan(8);
  for(const view of ['hall','hall-prep']) {
    await chooseWorldView(page,view);await expectWholeHallFrame(page);
    expect(await page.locator('.hall-canvas-metadata [data-scene-task="shop-s1-r14"][data-layer-kind="equipment"]').count()).toBe(2);
    await expect(page.locator('[data-light-glow="installed"]')).toHaveCount(1);
    await page.screenshot({path:`docs/screenshots/shop-polish-light-${view}-${info.project.name}.png`});
  }
  expect((await saved(page)).attempt).toEqual(before.attempt);
});
test('Purchase shows the destination and effects, then returns control without a completed notice or button',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const before=await seed(page,8,true);
  await page.evaluate(() => {
    const events:{phase:string;time:number;paths:number}[]=[];
    (window as unknown as {revealEvents:typeof events}).revealEvents=events;
    new MutationObserver(()=>{
      const phase=document.querySelector<HTMLElement>('.world-scene .shop-composition')?.dataset.purchasePhase??'idle';
      if(phase==='idle'&&!events.length)return;
      if(phase&&events.at(-1)?.phase!==phase)events.push({phase,time:performance.now(),paths:document.querySelectorAll('.scene-reveal-effects path').length});
    }).observe(document.querySelector('#app')!,{subtree:true,childList:true,attributes:true});
  });
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await acknowledge(page);
  const phases=await page.evaluate(()=>(window as unknown as {revealEvents:{phase:string;time:number;paths:number}[]}).revealEvents);
  expect(phases.map(event=>event.phase)).toEqual(['preparing','revealing','idle']);
  expect(phases[1].time-phases[0].time).toBeGreaterThanOrEqual(640);
  expect(phases[2].time-phases[1].time).toBeGreaterThanOrEqual(1440);
  expect(phases[1].paths).toBeGreaterThan(0);
  await page.screenshot({path:`docs/screenshots/shop-polish-reveal-${info.project.name}.png`});
  const after=await saved(page);
  expect(after.stars).toBe(before.stars-projectTasks('shop-1')[8].cost);
  expect(after.completed).toEqual(before.completed);expect(after.attempt).toEqual(before.attempt);expect(after.coins).toBe(before.coins);
  await expect(page.locator('[data-action="finish-build"]')).toHaveCount(0);
  await expect(page.locator('.world-main-action')).toBeEnabled();
});
test('Reload during the preparation never spends the price',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const before=await seed(page,8,true);
  // Dispatch and inspect preparation atomically, before a later browser round trip.
  const navigation=page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame()});
  await page.locator('.world-main-action[data-action="buy-task"]').evaluate(button=>{
    (button as HTMLButtonElement).click();
    if(!document.querySelector('.scene-reveal-notice')?.classList.contains('is-preparing'))throw new Error('Purchase did not enter preparation');
    // Navigation starts in this same event turn, before the payment timer.
    location.reload();
  });
  await navigation;await expect(page.locator('.world-hud')).toBeVisible();
  expect(await saved(page)).toEqual(before);
});
test('Reduced motion finishes a warehouse improvement automatically with no completed notice',async({page},info)=>{
  const before=await seed(page,6,false,true);
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await acknowledge(page);
  await page.screenshot({path:`docs/screenshots/warehouse-auto-reveal-${info.project.name}.png`});
  const after=await saved(page);
  expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks,'warehouse-s1-t07']);
  expect(after.repairKits).toBe(before.repairKits-projectTasks('warehouse-1')[6].cost);
  expect(after.completed).toEqual(before.completed);
  await expect(page.locator('[data-action="finish-build"]')).toHaveCount(0);
});
