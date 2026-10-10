import { test, expect, type Page } from '@playwright/test';
import { freshProgress, STORAGE_KEY, type Progress } from '../../src/storage';
import { applyDebugSceneState } from '../../src/debug-scene';
import { projectTasks, type ProjectId } from '../../src/campaign';
import { finishScenePurchase } from './scene-purchase';
import { settleHallFrame } from './hall-frame';
import {CHAPTER} from '../../src/content';
import {offlineChapterLevel} from '../../src/content-offline';
import {initial,applyMove} from '../../src/engine';
import {createOrderAppearance} from '../../src/order-supplies';

const saved=(page:Page):Promise<Progress>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
interface ContinuityReport {armed:boolean;ended:boolean;started:boolean;replaced:number;notReady:number;detached:number;lost:number;frames:number;geometryShift:number;}
async function seed(page:Page,projectId:ProjectId,works:number,pinOrder=false) {
  const progress=freshProgress();
  applyDebugSceneState(progress,{projectId,works,orders:0});
  progress.settings.sound=false;
  progress.settings.reducedMotion=false;
  if(pinOrder){
    const definition=offlineChapterLevel(CHAPTER.findIndex(order=>order.phaseId===projectId)+1);
    const start=initial(definition),step=definition.verifiedSolution[0],board=applyMove(start,step[0],step[1]);
    if(!board)throw new Error('The pinned order fixture must reproduce its first saved move');
    progress.attempt={id:`scene-${projectId}`,definition,appearance:createOrderAppearance(definition),board,undo:[start],solution:definition.verifiedSolution.slice(1),mixCount:0,hints:{},reward:null};
    progress.attempts[projectId]=progress.attempt;
  }
  await page.goto('/');
  await page.evaluate(({key,progress})=>localStorage.setItem(key,JSON.stringify(progress)),{key:STORAGE_KEY,progress});
  await page.reload();
  await expect(page.locator('.world-hud')).toBeVisible();
  if(await page.locator('.world-scene > .hall-composition').count())await settleHallFrame(page);
}

/** Start before the click: preparing and asset loading must keep the painted room too. */
async function watchCompletion(page:Page) {
  await settleHallFrame(page);
  await page.evaluate(()=>{
    const state=window as unknown as {sceneContinuity:ContinuityReport;stopSceneContinuity?:()=>void};
    state.stopSceneContinuity?.();
    const report:ContinuityReport={armed:false,ended:false,started:false,replaced:0,notReady:0,detached:0,lost:0,frames:0,geometryShift:0};
    state.sceneContinuity=report;
    const initial=document.querySelector<HTMLElement>('.world-scene > .hall-composition');
    const surface=initial?.querySelector<HTMLCanvasElement>('canvas')??null;
    const initialView=initial?.dataset.sceneView;
    const bounds=surface?.getBoundingClientRect();
    report.armed=!!surface&&initial?.dataset.sceneReady==='true';
    surface?.addEventListener('webglcontextlost',()=>report.lost++);
    let frameId:number;
    const observe=()=>{
      const scene=document.querySelector<HTMLElement>('.world-scene > .hall-composition');
      const current=scene?.querySelector<HTMLCanvasElement>('canvas')??null;
      if(scene?.dataset.purchasePhase)report.started=true;
      if(report.armed&&(!scene||scene.dataset.sceneView===initialView)) {
        if(current!==surface)report.replaced++;
        if(!surface?.isConnected||surface.width<1||surface.height<1)report.detached++;
        if(scene?.dataset.sceneReady!=='true')report.notReady++;
        if(surface&&bounds) {
          const next=surface.getBoundingClientRect();
          report.geometryShift=Math.max(report.geometryShift,Math.abs(next.x-bounds.x),Math.abs(next.y-bounds.y),Math.abs(next.width-bounds.width),Math.abs(next.height-bounds.height));
        }
        if(report.started&&scene&&!scene.dataset.purchasePhase)report.ended=true;
      }
    };
    const observer=new MutationObserver(observe);
    observer.observe(document.querySelector('#app')!,{subtree:true,childList:true,attributes:true});
    const frame=()=>{observe();if(report.armed)report.frames++;frameId=requestAnimationFrame(frame);};
    frameId=requestAnimationFrame(frame);
    state.stopSceneContinuity=()=>{observer.disconnect();cancelAnimationFrame(frameId);};
  });
}
async function expectContinuity(page:Page) {
  await expect(page.locator('.world-scene [data-purchase-phase]')).toHaveCount(0,{timeout:15_000});
  await finishScenePurchase(page);
  await page.waitForTimeout(100);
  const report=await page.evaluate(()=>(window as unknown as {sceneContinuity:ContinuityReport}).sceneContinuity);
  expect(report.armed).toBe(true);expect(report.started).toBe(true);expect(report.ended).toBe(true);expect(report.frames).toBeGreaterThan(1);
  expect(report.replaced,'The finished scene must retain its painted canvas').toBe(0);
  expect(report.notReady,'No loading frame may reappear at completion').toBe(0);
  expect(report.detached).toBe(0);expect(report.lost).toBe(0);expect(report.geometryShift).toBeLessThan(.1);
  await expect(page.locator('[data-busy-disabled]')).toHaveCount(0);
  await expect(page.locator('[data-action="finish-build"]')).toHaveCount(0);
}
const errors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));page.on('response',response=>{if(response.status()>=400)list.push(`${response.status()} ${response.url()}`);});});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));

test('Debug window display stays painted on the same canvas when its reveal finishes',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await seed(page,'shop-1',3);
  for(let repeat=0;repeat<2;repeat++) {
    await page.locator('.world-debug-control').click();
    await page.locator('[data-debug-field="works"]').selectOption('4');
    await watchCompletion(page);
    await page.locator('[data-action="debug-scene-apply"]').click();
    await expectContinuity(page);
    expect((await saved(page)).campaign.completedTasks).toEqual(projectTasks('shop-1').slice(0,4).map(task=>task.id));
  }
});

test('All fourteen ordinary shop improvements retain their completed room frame and enable the next action',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await seed(page,'shop-1',0);
  const before=await saved(page);
  const tasks=projectTasks('shop-1');
  for(const [index,task] of tasks.entries()) {
    if(await page.locator('.world-main-action[data-action="show-target"]').count())await page.locator('.world-main-action').click();
    await watchCompletion(page);
    await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${task.id}"]`).click();
    await expectContinuity(page);
    const progress=await saved(page);
    expect(progress.campaign.completedTasks).toEqual(tasks.slice(0,index+1).map(work=>work.id));
    expect(progress.stars).toBe(before.stars-tasks.slice(0,index+1).filter(work=>work.currency==='stars').reduce((sum,work)=>sum+work.cost,0));
    expect(progress.repairKits).toBe(before.repairKits-tasks.slice(0,index+1).filter(work=>work.currency==='repairKits').reduce((sum,work)=>sum+work.cost,0));
    expect(progress.completed).toEqual(before.completed);expect(progress.coins).toBe(before.coins);
  }
  await page.screenshot({path:`docs/screenshots/scene-animation-stable-${info.project.name}.png`});
});

for(const project of ['warehouse-1','bakery-1'] as const)test(`${project} foundation stays on its painted Canvas2D fallback at the end of the effect`,async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  await seed(page,project,6);
  const before=await saved(page);
  await page.evaluate(()=>{
    const canvas=document.querySelector<HTMLCanvasElement>('.world-scene canvas')!;
    const ctx=canvas.getContext('2d')!;
    const sample=()=>Array.from({length:24},(_,index)=>[...ctx.getImageData(
      Math.floor((310+(index%8)*135)/1536*canvas.width),
      Math.floor((525+Math.floor(index/8)*45)/1024*canvas.height),1,1).data]).flat();
    const state=window as unknown as {pixelContinuity:{before:string;firstReveal:string|null;unique:number;blank:number;stop:()=>void}};
    const unique=new Set<string>();
    const report=state.pixelContinuity={before:sample().join(','),firstReveal:null as string|null,unique:0,blank:0,stop:()=>{}};
    let frame:number;
    const tick=()=>{
      const pixels=sample(),value=pixels.join(',');unique.add(value);report.unique=unique.size;
      if(pixels.every((alpha,index)=>index%4!==3||alpha===0))report.blank++;
      if(document.querySelector<HTMLElement>('.world-scene > .hall-composition')?.dataset.purchasePhase==='revealing'&&report.firstReveal===null)report.firstReveal=value;
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);report.stop=()=>cancelAnimationFrame(frame);
  });
  await watchCompletion(page);
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await expectContinuity(page);
  await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-renderer','canvas2d');
  const pixels=await page.evaluate(()=>{
    const report=(window as unknown as {pixelContinuity:{before:string;firstReveal:string|null;unique:number;blank:number;stop:()=>void}}).pixelContinuity;
    report.stop();return {before:report.before,firstReveal:report.firstReveal,unique:report.unique,blank:report.blank};
  });
  expect(pixels.firstReveal,'The first reveal frame starts at the already visible ghost').toBe(pixels.before);
  expect(pixels.unique,'Actual painted foundation pixels must change over several frames').toBeGreaterThan(3);
  expect(pixels.blank).toBe(0);
  expect((await saved(page)).campaign.completedTasks).toEqual([...before.campaign.completedTasks,projectTasks(project)[6].id]);
});

test('Reduced motion also finishes a shop purchase without replacing its canvas',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await seed(page,'shop-1',3);
  await watchCompletion(page);
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await expectContinuity(page);
});

for(const projectId of ['warehouse-1','warehouse-2'] as const) {
  test(`All ${projectId} purchases retain the painted surface from click through payment and the next ghost`,async({page},info)=>{
    await page.emulateMedia({reducedMotion:'no-preference'});
    await seed(page,projectId,0);
    const before=await saved(page),tasks=projectTasks(projectId);
    for(const [index,task] of tasks.entries()) {
      if(await page.locator('.world-main-action[data-action="show-target"]').count())await page.locator('.world-main-action').click();
      await watchCompletion(page);
      await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${task.id}"]`).evaluate(button=>{
        (button as HTMLButtonElement).click();(button as HTMLButtonElement).click();
      });
      await expectContinuity(page);
      await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-renderer','pixi-webgl');
      const progress=await saved(page);
      expect(progress.campaign.completedTasks).toEqual([...before.campaign.completedTasks,...tasks.slice(0,index+1).map(work=>work.id)]);
      for(const currency of ['stars','repairKits'] as const)
        expect(progress[currency]).toBe(before[currency]-tasks.slice(0,index+1).filter(work=>work.currency===currency).reduce((sum,work)=>sum+work.cost,0));
      expect(progress.completed).toEqual(before.completed);expect(progress.attempts).toEqual(before.attempts);expect(progress.coins).toBe(before.coins);
    }
    await page.screenshot({path:`docs/screenshots/scene-animation-${projectId}-${info.project.name}.png`});
  });
}

test('A delayed new foundation sheet keeps the old room painted until its layers are decoded',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await seed(page,'warehouse-1',5);
  let requested=false;
  await page.route('**/warehouse-room-site-foundation.webp',async route=>{
    requested=true;await new Promise(resolve=>setTimeout(resolve,900));await route.continue();
  });
  await watchCompletion(page);
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await expectContinuity(page);
  expect(requested).toBe(true);
});

test('All twenty shop stage two purchases retain their registered room from click through payment',async({page},info)=>{
  test.setTimeout(300_000);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await seed(page,'shop-2',0,true);
  const before=await saved(page),tasks=projectTasks('shop-2');
  for(const [index,task] of tasks.entries()) {
    if(await page.locator('.world-main-action[data-action="show-target"]').count())await page.locator('.world-main-action').click();
    await watchCompletion(page);
    await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${task.id}"]`).evaluate(button=>{
      (button as HTMLButtonElement).click();(button as HTMLButtonElement).click();
    });
    await expectContinuity(page);
    const after=await saved(page);
    expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks,...tasks.slice(0,index+1).map(work=>work.id)]);
    for(const currency of ['stars','repairKits'] as const)
      expect(after[currency]).toBe(before[currency]-tasks.slice(0,index+1).filter(work=>work.currency===currency).reduce((sum,work)=>sum+work.cost,0));
    expect(after.completed).toEqual(before.completed);expect(after.attempts).toEqual(before.attempts);expect(after.attempt).toEqual(before.attempt);expect(after.coins).toBe(before.coins);
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-art-version','shop-expansion-2');
  }
  const json=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
  await page.reload();await settleHallFrame(page);
  expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(json);
  await page.screenshot({path:`docs/screenshots/shop-expansion-animation-${info.project.name}.png`});
});

test('Counter contour repair retains the painted service room through purchase thirteen',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await seed(page,'shop-2',12,true);
  const before=await saved(page),task=projectTasks('shop-2')[12];
  await watchCompletion(page);
  await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${task.id}"]`).click();
  await expectContinuity(page);
  const after=await saved(page);
  expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks,task.id]);
  expect(after[task.currency]).toBe(before[task.currency]-task.cost);
  expect(after.attempt).toEqual(before.attempt);expect(after.attempts).toEqual(before.attempts);
  expect(after.completed).toEqual(before.completed);expect(after.coins).toBe(before.coins);
  await page.screenshot({path:`docs/screenshots/shop-expansion-counter-animation-${info.project.name}.png`});
});

for(const project of ['fruit-yard-1','fruit-yard-2','bakery-1'] as const)test(`Every ${project} purchase retains its registered scene and pinned order`,async({page},info)=>{
  test.setTimeout(300_000);await page.emulateMedia({reducedMotion:'no-preference'});
  await seed(page,project,0,true);
  const before=await saved(page),tasks=projectTasks(project);
  for(const [index,task] of tasks.entries()){
    if(await page.locator('.world-main-action[data-action="show-target"]').count())await page.locator('.world-main-action').click();
    await watchCompletion(page);
    await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${task.id}"]`).evaluate(b=>{(b as HTMLButtonElement).click();(b as HTMLButtonElement).click();});
    await expectContinuity(page);const after=await saved(page);
    expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks,...tasks.slice(0,index+1).map(t=>t.id)]);
    for(const currency of ['stars','repairKits'] as const)expect(after[currency]).toBe(before[currency]-tasks.slice(0,index+1).filter(t=>t.currency===currency).reduce((n,t)=>n+t.cost,0));
    expect(after.attempt).toEqual(before.attempt);expect(after.attempts).toEqual(before.attempts);
    expect(after.completed).toEqual(before.completed);expect(after.coins).toBe(before.coins);
  }
  const json=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
  await page.reload();await settleHallFrame(page);expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(json);
  await page.screenshot({path:`docs/screenshots/fruit-animation-${project}-${info.project.name}.png`});
});

test('A deliberate debug camera change enters its complete painted view after a delayed download',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await seed(page,'shop-1',9);
  await page.route('**/hall-room-prep-before.webp',async route=>{
    await new Promise(resolve=>setTimeout(resolve,900));await route.continue();
  });
  await page.evaluate(()=>{
    const state=window as unknown as {cameraContinuity:{blank:number;switched:number;stop:()=>void}};
    const report=state.cameraContinuity={blank:0,switched:0,stop:()=>{}};
    let view=document.querySelector<HTMLElement>('.world-scene > .hall-composition')!.dataset.sceneView;
    let frame:number;
    const sample=()=>{
      const scene=document.querySelector<HTMLElement>('.world-scene > .hall-composition');
      if(!scene||scene.dataset.sceneReady!=='true')report.blank++;
      if(scene&&scene.dataset.sceneView!==view){view=scene.dataset.sceneView;report.switched++;}
      frame=requestAnimationFrame(sample);
    };
    frame=requestAnimationFrame(sample);report.stop=()=>cancelAnimationFrame(frame);
  });
  await page.locator('.world-debug-control').click();
  await page.locator('[data-debug-field="works"]').selectOption('11');
  await page.locator('[data-action="debug-scene-apply"]').click();
  await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view','hall-prep');
  await expect(page.locator('.world-scene [data-purchase-phase]')).toHaveCount(0,{timeout:15_000});
  await finishScenePurchase(page);
  const report=await page.evaluate(()=>{
    const report=(window as unknown as {cameraContinuity:{blank:number;switched:number;stop:()=>void}}).cameraContinuity;
    report.stop();return {blank:report.blank,switched:report.switched};
  });
  expect(report).toEqual({blank:0,switched:1});
  await expect(page.locator('canvas.hall-canvas-surface')).toHaveCount(1);
});
