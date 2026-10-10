import {test,expect,type Page} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {freshProgress,STORAGE_KEY,type Progress} from '../../src/storage';
import {applyDebugSceneState} from '../../src/debug-scene';
import {projectTasks,projectOrders} from '../../src/campaign';
import {sceneTaskView} from '../../src/campaign-scene';
import {settleHallFrame,expectWholeHallFrame,chooseWorldView,enterMapBuilding} from './hall-frame';
import {scenePNG,sceneSourcePixels} from './scene-pixels';
import {finishScenePurchase} from './scene-purchase';
import {offlineChapterLevel} from '../../src/content-offline';
import {initial,applyMove} from '../../src/engine';
import {createOrderAppearance} from '../../src/order-supplies';

const saved=(page:Page):Promise<Progress>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
async function open(page:Page,works:number,orders=0){
  const p=freshProgress();expect(applyDebugSceneState(p,{projectId:'bakery-1',works,orders}).ok).toBe(true);
  p.stars=0;p.repairKits=0;p.settings.sound=false;p.settings.reducedMotion=true;
  await page.goto('/');await page.evaluate(({key,p})=>localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});
  await page.reload();await settleHallFrame(page);
}
async function view(page:Page,name:string){
  if(await page.locator('.world-scene > .hall-composition').getAttribute('data-scene-view')!==name)await chooseWorldView(page,name);
  await settleHallFrame(page);
}
const failures=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const errors:string[]=[];failures.set(page,errors);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});});
test.afterEach(({page})=>expect(failures.get(page)).toEqual([]));

for(const renderer of ['default','canvas2d'] as const)test(`All bakery construction/furniture states fit complete frames (${renderer})`,async({page},info)=>{
  test.setTimeout(300_000);
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);} as typeof original;
  });
  const directory=`artifacts/bakery/runtime/${info.project.name}-${renderer}`;await mkdir(directory,{recursive:true});
  const tasks=projectTasks('bakery-1'),frames:{works:number;view:string;file:string}[]=[];
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
    if([0,7,10,12,14,18,19,21,25,26].includes(works))await page.screenshot({path:`docs/screenshots/bakery-${works}-${info.project.name}-${renderer}.png`});
  }
  for(const name of ['bakery-yard','bakery-oven','bakery-shop'])await capture(26,name,'-complete');
  await writeFile(`${directory}/frames.json`,JSON.stringify(frames,null,2));
});

test('Bakery rooms enter through the map and keep paid ownership through rooms and reload',async({page},info)=>{
  await open(page,26);const before=await saved(page);
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  const pin=page.locator('.world-pin[data-area="bakery"]');await expect(pin).toHaveAttribute('data-project','bakery-1');await pin.click();
  await expect(page.locator('.modal-navigation')).toBeVisible();expect(await saved(page)).toEqual(before);
  await page.locator('.navigation-view-card[data-view="bakery-yard"]').click();
  for(const name of ['bakery-yard','bakery-oven','bakery-shop']){await view(page,name);await expectWholeHallFrame(page);await page.screenshot({path:`docs/screenshots/bakery-${name}-${info.project.name}.png`});}
  const after=await saved(page);for(const key of ['completed','campaign','attempts','coins','stars','repairKits','inventory'] as const)expect(after[key]).toEqual(before[key]);
  await page.reload();await settleHallFrame(page);expect(await saved(page)).toEqual(after);
});

test('After the facade the ordinary route equips the entrance hall before entering the kitchen',async({page},info)=>{
  await open(page,10,26);
  await page.evaluate(key=>{const p=JSON.parse(localStorage.getItem(key)!);p.repairKits=6;p.stars=48;localStorage.setItem(key,JSON.stringify(p));},STORAGE_KEY);
  await page.reload();await settleHallFrame(page);
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await page.locator('.world-pin[data-area="bakery"]').click();
  const recommended=page.locator('.navigation-view-card.room-next');
  await expect(recommended).toHaveAttribute('data-view','bakery-shop');
  await expect(recommended).toContainText('Вход и торговый зал');
  await expect(page.locator('.navigation-view-card').first()).toHaveAttribute('data-view','bakery-shop');
  await recommended.click();await settleHallFrame(page);
  for(const id of [11,12,19,20,21,22,23,24,25,13]){
    if(await page.locator('.world-main-action[data-action="show-target"]').count())await page.locator('.world-main-action').click();
    const taskId=`bakery-s1-t${String(id).padStart(2,'0')}`;
    await page.locator(`.world-main-action[data-action="buy-task"][data-task-id="${taskId}"]`).click();
    await finishScenePurchase(page);await settleHallFrame(page);
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view',id===13?'bakery-oven':'bakery-shop');
    if(id===11)await page.screenshot({path:`docs/screenshots/bakery-front-first-${info.project.name}.png`});
    if(id===13){const p=await saved(page);for(const front of [19,20,21,22,23,24,25])expect(p.campaign.completedTasks).toContain(`bakery-s1-t${front}`);}
  }
  await page.screenshot({path:`docs/screenshots/bakery-kitchen-after-front-${info.project.name}.png`});
});

test('A kitchen-first save migrates to the entrance route and keeps the partly played order during purchase',async({page})=>{
  const p=freshProgress();expect(applyDebugSceneState(p,{projectId:'bakery-1',works:0,orders:38}).ok).toBe(true);
  const former=Array.from({length:14},(_,i)=>`bakery-s1-t${String(i+1).padStart(2,'0')}`);
  p.campaign.completedTasks.push(...former);p.stars=7;p.repairKits=2;p.coins=1234;
  const definition=offlineChapterLevel(639),board=initial(definition),move=definition.verifiedSolution[0];
  p.attempt={id:'bakery-before-reorder',definition,board:applyMove(board,...move)!,undo:[board],solution:definition.verifiedSolution.slice(1),mixCount:0,hints:{},reward:null,appearance:createOrderAppearance(definition)};
  p.attempts['bakery-1']=structuredClone(p.attempt);
  const source={...p,schema:9,campaign:{...p.campaign,version:'coastal-campaign-7'}};
  await page.goto('/');await page.evaluate(({key,source})=>localStorage.setItem(key,JSON.stringify(source)),{key:STORAGE_KEY,source});
  await page.reload();await settleHallFrame(page);
  let after=await saved(page);expect(after.schema).toBe(10);expect(after.campaign.bakeryLegacyPrefix).toBe(14);
  expect(after.attempt).toEqual(p.attempt);expect(after.attempts).toEqual(p.attempts);
  expect([after.coins,after.stars,after.repairKits]).toEqual([1234,7,2]);
  if(await page.locator('.world-main-action[data-action="show-target"]').count())await page.locator('.world-main-action').click();
  await page.locator('.world-main-action[data-action="buy-task"][data-task-id="bakery-s1-t19"]').click();
  await finishScenePurchase(page);await settleHallFrame(page);
  await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view','bakery-shop');
  after=await saved(page);for(const id of former)expect(after.campaign.completedTasks).toContain(id);
  expect(after.attempt).toEqual(p.attempt);expect(after.attempts).toEqual(p.attempts);
  expect([after.coins,after.stars,after.repairKits]).toEqual([1234,4,2]);
  await page.reload();await settleHallFrame(page);expect(await saved(page)).toEqual(after);
});

test('First interior bakery order uses the real separate baguette and croissant sprites',async({page},info)=>{
  await open(page,14,38);const before=await saved(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.puzzle')).toBeVisible();const after=await saved(page);
  expect(after.attempt?.definition.id).toBe(projectOrders('bakery-1')[38].id);
  expect(after.attempt?.definition.number).toBe(1119);
  for(const file of ['baguette','croissant']){const images=page.locator(`.puzzle img[src$="/${file}.webp"]`);expect(await images.count()).toBeGreaterThan(0);await expect.poll(()=>images.first().evaluate(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0)).toBe(true);}
  expect(after.campaign).toEqual(before.campaign);expect(after.completed).toEqual(before.completed);
  await page.screenshot({path:`docs/screenshots/bakery-order-39-${info.project.name}.png`});
});

test('Returning from bakery through the map restores the shop room and its surround',async({page})=>{
  await open(page,26);const before=await saved(page);
  await page.locator('.world-scene-back[data-action="show-map"]').click();await enterMapBuilding(page,'shop');
  await chooseWorldView(page,'hall');await expectWholeHallFrame(page);
  await expect(page.locator('.world')).not.toHaveClass(/bakery-game-world/);
  const surround=await page.locator('.world').evaluate(el=>getComputedStyle(el,'::before').backgroundImage);
  expect(surround).toContain('hall-room-main-clean.webp');
  const after=await saved(page);for(const key of ['completed','campaign','attempts','coins','stars','repairKits','inventory'] as const)expect(after[key]).toEqual(before[key]);
});

test('Finished fruit rooms directly continue to the new bakery construction',async({page})=>{
  await open(page,0);const before=await saved(page);
  await page.locator('.world-scene-back[data-action="show-map"]').click();await enterMapBuilding(page,'fruit-yard');
  await chooseWorldView(page,'fruit-extension');
  const next=page.locator('.world-main-action[data-project="bakery-1"]');
  await expect(next).toHaveText(/К пекарне/);await next.click();await settleHallFrame(page);
  await expect(page.locator('.world')).toHaveAttribute('data-project','bakery-1');
  await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view','bakery-yard');
  const after=await saved(page);for(const key of ['completed','campaign','attempts','coins','stars','repairKits','inventory'] as const)expect(after[key]).toEqual(before[key]);
});

test('A bakery repair victory uses materials, pays one kit once and restores the pinned result',async({page})=>{
  await open(page,0);const before=await saved(page);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator('.puzzle[data-order-kind="repair"]')).toBeVisible();
  await page.locator('.orders .good,.slot .good').evaluateAll(async nodes=>{await Promise.all(nodes.map(node=>(node as HTMLImageElement).decode()));});
  for(const src of await page.locator('.orders .good,.slot .good').evaluateAll(nodes=>nodes.map(node=>(node as HTMLImageElement).src)))expect(src).toMatch(/\/material-[a-z]+\.webp$/);
  await page.locator('.game-topbar [data-action="debug-menu"]').click();
  await page.locator('.modal-debug [data-action="debug-auto"]').click();
  await expect(page.locator('.modal-result')).toBeVisible();const after=await saved(page);
  expect(after.attempt!.definition.id).toBe(projectOrders('bakery-1')[0].id);
  expect(after.attempt!.definition.number).toBe(1081);
  expect(after.attempt!.reward).toEqual({coins:60,stars:0,repairKits:1,fresh:true});
  expect(after.repairKits).toBe(before.repairKits+1);expect(after.stars).toBe(before.stars);expect(after.coins).toBe(before.coins+60);
  await page.reload();expect(await saved(page)).toEqual(after);
});

test('Bakery rooms, navigation and the next action remain reachable across phone and tablet sizes',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Explicit viewport matrix runs once.');
  test.setTimeout(240_000);
  for(const [width,height] of [[1280,900],[360,640],[384,720],[360,400],[768,1024],[1024,768],[640,360]]){
    await page.setViewportSize({width,height});await open(page,26);
    const before=await saved(page);
    for(const name of ['bakery-yard','bakery-oven','bakery-shop']){
      await view(page,name);await expectWholeHallFrame(page);
      for(const selector of ['.world-main-action','.world-debug-control','.world-hud [data-action="world-navigation"]','.world-scene-back']){
        const button=page.locator(selector),r=(await button.boundingBox())!;
        expect(r.width).toBeGreaterThanOrEqual(43);expect(r.height).toBeGreaterThanOrEqual(43);
        expect(r.x).toBeGreaterThanOrEqual(-1);expect(r.y).toBeGreaterThanOrEqual(-1);
        expect(r.x+r.width).toBeLessThanOrEqual(width+1);expect(r.y+r.height).toBeLessThanOrEqual(height+1);
        expect(await button.evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
      }
      const action=(await page.locator('.world-main-action').boundingBox())!;
      expect(height-action.y-action.height).toBeGreaterThanOrEqual(14);
      await page.screenshot({path:`docs/screenshots/bakery-${name}-${width}x${height}.png`});
    }
    const after=await saved(page);for(const key of ['completed','campaign','attempts','coins','stars','repairKits','inventory'] as const)expect(after[key]).toEqual(before[key]);
  }
});

test('Visible bakery debug opens the chosen improvement and finishes the ordinary reveal',async({page},info)=>{
  await open(page,0);
  for(const number of [7,10,11,12,13,19,20,21,26]){
    const task=projectTasks('bakery-1')[number-1];
    await page.locator('.world-debug-control').click();
    await page.locator('[data-debug-field="project"]').selectOption('bakery-1');
    await page.locator('[data-debug-field="works"]').selectOption(String(number));
    await page.locator('[data-action="debug-scene-apply"]').click();
    await expect(page.locator('.modal-debug')).toHaveCount(0);
    await finishScenePurchase(page);await settleHallFrame(page);
    await expect(page.locator('.world')).toHaveAttribute('data-project','bakery-1');
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-scene-view',sceneTaskView(task.id));
    expect((await saved(page)).campaign.completedTasks).toContain(task.id);
    await expect(page.locator('.world-main-action')).toBeEnabled();
    await expect(page.locator('.scene-reveal-result')).toHaveCount(0);
  }
  await page.screenshot({path:`docs/screenshots/bakery-debug-last-work-${info.project.name}.png`});
});

for(const renderer of ['default','canvas2d'] as const)test(`Repaired table support and baguette silhouettes retain the independent donor pixels (${renderer})`,async({page})=>{
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);} as typeof original;
  });
  // These interiors were diagnosed independently by Astra in the composed
  // frames. Narrow interior ROIs avoid neighbouring furniture and mask edges.
  for(const state of [
    {works:21,view:'bakery-oven',source:'oven-bare',boxes:[[844,511,11,12]]},
    {works:15,view:'bakery-shop',source:'shop-master',boxes:[[460,564,38,18],[393,590,22,16]]},
    {works:19,view:'bakery-shop',source:'shop-master',boxes:[[179,580,6,8],[182,595,6,8],[460,564,38,18],[393,590,22,16]]},
    {works:26,view:'bakery-shop',source:'shop-master',boxes:[[179,580,6,8],[182,595,6,8],[460,564,38,18],[393,590,22,16]]},
    // The open turquoise side under the baguette belongs to the existing
    // trays donor. A wider stock mask used to repaint it with a dark wedge.
    ...[15,19,26].map(works=>({works,view:'bakery-shop',source:'shop-trays-clean',boxes:[[283,689,3,9]]})),
  ]){
    await open(page,state.works);await view(page,state.view);
    for(const value of state.boxes){
      const box=value as [number,number,number,number],actual=await sceneSourcePixels(page,'.world-scene .hall-world-stage',box);
      const expected=await page.evaluate(async({source,box})=>{
        const image=new Image();image.src=`/assets/bakery-${source}.webp`;await image.decode();
        const r=document.querySelector('.world-scene .hall-world-stage')!.getBoundingClientRect();
        const small=document.createElement('canvas');small.width=Math.round(r.width*devicePixelRatio);small.height=Math.round(r.height*devicePixelRatio);
        const scaled=small.getContext('2d')!;scaled.imageSmoothingQuality='high';scaled.drawImage(image,0,0,small.width,small.height);
        const copy=document.createElement('canvas');copy.width=1536;copy.height=1024;const context=copy.getContext('2d')!;
        context.drawImage(small,0,0,1536,1024);return [...context.getImageData(...box).data];
      },{source:state.source,box});
      let difference=0;for(let i=0;i<actual.length;i+=4)for(let k=0;k<3;k++)difference+=Math.abs(actual[i+k]-expected[i+k]);
      expect(difference/(actual.length/4*3),`${state.works}, ${state.view}, support/baguette at ${box}`).toBeLessThan(18);
    }
  }
});

test('Both bakery renderers paint matching local regions in the captured construction and furniture states',async({page},info)=>{
  // Run after the all-state captures. Tile comparison catches large interior
  // triangulation errors that disappear in a whole-frame average.
  await page.goto('/');
  const root=`artifacts/bakery/runtime/${info.project.name}`;
  const frames=JSON.parse(await readFile(`${root}-default/frames.json`,'utf8')) as {works:number;view:string;file:string}[];
  const results:{works:number;view:string;worst:{x:number;y:number;delta:number}}[]=[];
  for(const frame of frames){
    const [a,b]=await Promise.all([readFile(`${root}-default/${frame.file}`),readFile(`${root}-canvas2d/${frame.file}`)]);
    const worst=await page.evaluate(async({a,b})=>{
      const decode=async(encoded:string)=>{const bytes=Uint8Array.from(atob(encoded),v=>v.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const copy=document.createElement('canvas');copy.width=1536;copy.height=1024;const ctx=copy.getContext('2d')!;ctx.drawImage(bitmap,0,0,1536,1024);bitmap.close();return ctx.getImageData(0,0,1536,1024).data;};
      const first=await decode(a),next=await decode(b);let worst={x:0,y:0,delta:0};
      for(let y=0;y<1024;y+=64)for(let x=0;x<1536;x+=64){
        let sum=0;for(let yy=y;yy<y+64;yy++)for(let xx=x;xx<x+64;xx++){const i=(yy*1536+xx)*4;for(let k=0;k<3;k++)sum+=Math.abs(first[i+k]-next[i+k]);}
        const delta=sum/(64*64*3);if(delta>worst.delta)worst={x,y,delta};
      }
      return worst;
    },{a:a.toString('base64'),b:b.toString('base64')});
    results.push({works:frame.works,view:frame.view,worst});
  }
  await mkdir('artifacts/bakery/parity',{recursive:true});await writeFile(`artifacts/bakery/parity/${info.project.name}.json`,JSON.stringify(results,null,2));
  for(const result of results)expect(result.worst.delta,`${result.works} ${result.view}, tile${result.worst.x},${result.worst.y}: WebGL/Canvas2D geometry`).toBeLessThan(18);
});
