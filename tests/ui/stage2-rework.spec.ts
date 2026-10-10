import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {freshProgress,STORAGE_KEY,type Progress} from '../../src/storage';
import {applyDebugSceneState} from '../../src/debug-scene';
import {projectTasks,type ProjectId} from '../../src/campaign';
import {sceneTaskView} from '../../src/campaign-scene';
import {scenePNG,sceneSourcePixels} from './scene-pixels';
import {settleHallFrame,expectWholeHallFrame,chooseWorldView, enterMapBuilding } from './hall-frame';

const scene='.world-scene > .hall-composition';
const surface='.world-scene .hall-world-stage';
async function open(page:Page,project:ProjectId,works:number,fund=false){
  const progress=freshProgress();
  expect(applyDebugSceneState(progress,{projectId:project,works,orders:0}).ok).toBe(true);
  if(!fund){progress.stars=0;progress.repairKits=0;}
  progress.settings.sound=false;progress.settings.reducedMotion=true;
  await page.goto('/');
  await page.evaluate(({key,progress})=>localStorage.setItem(key,JSON.stringify(progress)),{key:STORAGE_KEY,progress});
  await page.reload();await settleHallFrame(page);
}
async function view(page:Page,name:string){
  if(await page.locator(scene).getAttribute('data-scene-view')!==name)await chooseWorldView(page,name);
  await settleHallFrame(page);
}
const errors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{
  const list:string[]=[];errors.set(page,list);
  page.on('pageerror',e=>list.push(e.message));
  page.on('response',r=>{if(r.status()>=400)list.push(`${r.status()} ${r.url()}`);});
});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));

for(const project of ['shop-2','warehouse-2'] as const)test(`Every ${project} state has a complete production frame for Astra review`,async({page},info)=>{
  test.setTimeout(300_000);
  const directory=`artifacts/stage2-rework/runtime/${project}/${info.project.name}`;
  await mkdir(directory,{recursive:true});
  const tasks=projectTasks(project),frames:{works:number;view:string;file:string}[]=[];
  const capture=async(works:number,name:string,suffix='')=>{
    await view(page,name);await expectWholeHallFrame(page);
    const target=page.locator('.world-target');
    if(await target.count())expect(await target.evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    await expect(page.locator(scene)).toHaveAttribute('data-art-version',project==='shop-2'?'shop-expansion-2':'warehouse-rooms-8');
    const file=`${String(works).padStart(2,'0')}${suffix}-${name}.png`;
    await writeFile(`${directory}/${file}`,await scenePNG(page,surface));
    frames.push({works,view:name,file});
  };
  for(let works=0;works<=tasks.length;works++){
    await open(page,project,works);
    const name=sceneTaskView(tasks[Math.max(0,works-1)].id);
    await capture(works,name);
    if(tasks[works]&&sceneTaskView(tasks[works].id)!==name)await capture(works,sceneTaskView(tasks[works].id),'-next');
    await expect(page.locator('.world-progress')).toContainText(`${works} / 20`);
    await expect(page.locator('.world-scene .scene-layer')).toHaveCount(0);
    if([0,2,3,7,12,16,20].includes(works))await page.screenshot({path:`docs/screenshots/stage2-${project}-${works}-${info.project.name}.png`});
  }
  for(const name of project==='shop-2'?['shop-grocery','shop-service']:['warehouse-cold','warehouse-receiving'])await capture(20,name,'-complete');
  await writeFile(`${directory}/frames.json`,JSON.stringify(frames,null,2));
});

test('Both new shop views fit desktop, mobile, tablet and short portrait/landscape',async({page},info)=>{
  test.skip(info.project.name!=='desktop','The explicit viewport matrix runs once.');
  for(const [width,height] of [[1280,900],[360,640],[384,720],[360,400],[768,1024],[1024,768],[640,360]]){
    await page.setViewportSize({width,height});await open(page,'shop-2',20);
    for(const name of ['shop-grocery','shop-service']){
      await view(page,name);await expectWholeHallFrame(page);
      const targets=await page.locator('.world button').evaluateAll(buttons=>buttons.map(button=>{
        const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return{label:button.getAttribute('aria-label')??button.textContent,width:r.width,height:r.height,x:r.x,right:r.right,y:r.y,bottom:r.bottom,hit:!!hit&&button.contains(hit)};
      }));
      for(const b of targets){expect(b.width,b.label!).toBeGreaterThanOrEqual(44);expect(b.height,b.label!).toBeGreaterThanOrEqual(44);expect(b.x,b.label!).toBeGreaterThanOrEqual(-1);expect(b.y,b.label!).toBeGreaterThanOrEqual(-1);expect(b.right,b.label!).toBeLessThanOrEqual(width+1);expect(b.bottom,b.label!).toBeLessThanOrEqual(height+1);expect(b.hit,b.label!).toBe(true);}
      await page.screenshot({path:`docs/screenshots/shop-expansion-${name}-${width}x${height}.png`});
    }
  }
});

for(const renderer of ['default','canvas2d'] as const)test(`The warehouse cupboard keeps both doors and their approaches unchanged (${renderer})`,async({page},info)=>{
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(getContext,this,[kind,...args]);
    } as typeof getContext;
  });
  const boxes:[[number,number,number,number],[number,number,number,number]]=[[1300,410,90,210],[670,360,110,265]];
  await open(page,'warehouse-2',15);await view(page,'warehouse-receiving');
  const baseline=await Promise.all(boxes.map(box=>sceneSourcePixels(page,surface,box)));
  for(const works of [16,17,18,19,20]){
    await open(page,'warehouse-2',works);await view(page,'warehouse-receiving');
    if(renderer==='canvas2d')await expect(page.locator(scene)).toHaveAttribute('data-renderer','canvas2d');
    for(const [index,box] of boxes.entries()){
      const actual=await sceneSourcePixels(page,surface,box);
      let difference=0;for(let i=0;i<actual.length;i++)if(i%4!==3)difference+=Math.abs(actual[i]-baseline[index][i]);
      expect(difference/(actual.length/4*3),`door ${index} remains intact at ${works}/20`).toBeLessThan(.4);
    }
  }
  await page.screenshot({path:`docs/screenshots/warehouse-door-v8-${info.project.name}-${renderer}.png`});
});

test('The new shop rooms preserve paid layers and progress through globe, map and reload',async({page})=>{
  await open(page,'shop-2',18);
  const saved=():Promise<Progress>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);
  const before=await saved();
  for(const name of ['shop-service','shop-grocery']){
    await view(page,name);await expectWholeHallFrame(page);
    await expect(page.locator('.world-room-appearance')).toHaveCount(0);
  }
  await view(page,'hall');await expect(page.locator('.world-room-appearance')).toHaveCount(1);
  await page.locator('[data-action="show-map"]').click();
  await enterMapBuilding(page,'warehouse');
  await expect(page.locator('.world')).toHaveAttribute('data-project','warehouse-2');
  await page.locator('[data-action="show-map"]').click();await enterMapBuilding(page,'shop');
  await expect(page.locator('.world')).toHaveAttribute('data-project','shop-2');
  await page.reload();await settleHallFrame(page);const after=await saved();
  for(const key of ['completed','campaign','attempts','coins','stars','repairKits','inventory'] as const)expect(after[key]).toEqual(before[key]);
});

for(const renderer of ['default','canvas2d'] as const)test(`Cold rack preserves complete lower boards, side panel and supports (${renderer})`,async({page},info)=>{
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(getContext,this,[kind,...args]);
    } as typeof getContext;
  });
  const boards=[[751,519],[835,529],[1005,546],[1100,559],[1182,631],[1192,684]],supports=[[1155,753],[1197,605],[913,698],[973,680],[725,650],[780,646],[1219,725]];
  await open(page,'warehouse-2',7);
  const references=await page.evaluate(async({boards,supports})=>{
    const sample=async(name:string,points:number[][])=>{
      const image=new Image();image.src=`/assets/warehouse-room-cold-${name}.webp`;await image.decode();
      const rect=document.querySelector('.world-scene .hall-world-stage')!.getBoundingClientRect();
      const reduced=document.createElement('canvas');reduced.width=Math.round(rect.width*devicePixelRatio);reduced.height=Math.round(rect.height*devicePixelRatio);
      const draw=reduced.getContext('2d')!;draw.imageSmoothingQuality='high';draw.drawImage(image,0,0,reduced.width,reduced.height);
      const source=document.createElement('canvas');source.width=1536;source.height=1024;
      const context=source.getContext('2d')!;context.drawImage(reduced,0,0,1536,1024);
      return points.map(([x,y])=>{const data=[...context.getImageData(x-3,y-3,6,6).data];return[0,1,2].map(c=>data.filter((_,i)=>i%4===c).reduce((sum,v)=>sum+v,0)/36);});
    };
    return{boards:await sample('empty',boards),supports:await sample('rack-bare',supports),behindBins:await sample('empty',supports)};
  },{boards,supports});
  const directory=`artifacts/stage2-rework/cold/${info.project.name}-${renderer}`;await mkdir(directory,{recursive:true});
  for(const works of [7,8,9,10,11,12]){
    await open(page,'warehouse-2',works);await view(page,'warehouse-cold');
    const points=works<9?supports:boards,expected=works<9?references.supports:references.boards;
    const pixels=await sceneSourcePixels(page,surface,[700,510,525,260]);
    for(const [i,[x,y]] of points.entries()){
      // The pending bulk bins deliberately hide the other front feet after t8.
      if(works===8&&i>=2)continue;
      const mean=[0,1,2].map(c=>{let sum=0;for(let dy=-3;dy<3;dy++)for(let dx=-3;dx<3;dx++)sum+=pixels[((y+dy-510)*525+x+dx-700)*4+c];return sum/36;});
      const reference=works===8&&i===1?expected[i].map((v,c)=>v*.73+references.behindBins[i][c]*.27):expected[i];
      expect(mean.reduce((sum,v,c)=>sum+Math.abs(v-reference[c]),0)/3,`whole board/support ${x},${y} at ${works}/20`).toBeLessThan(23);
    }
    await writeFile(`${directory}/${works}.png`,await scenePNG(page,surface));
  }
});

for(const renderer of ['default','canvas2d'] as const)test(`Expanded counter covers the inherited foot without stray teal fragments (${renderer})`,async({page},info)=>{
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(getContext,this,[kind,...args]);
    } as typeof getContext;
  });
  await open(page,'shop-2',13);await view(page,'shop-service');
  const box:[number,number,number,number]=[1359,676,6,6];
  const expected=await page.evaluate(async box=>{
    const image=new Image();image.src='/assets/shop-expansion-service-counter.webp';await image.decode();
    const rect=document.querySelector('.world-scene .hall-world-stage')!.getBoundingClientRect();
    const reduced=document.createElement('canvas');reduced.width=Math.round(rect.width*devicePixelRatio);reduced.height=Math.round(rect.height*devicePixelRatio);
    const draw=reduced.getContext('2d')!;draw.imageSmoothingQuality='high';draw.drawImage(image,0,0,reduced.width,reduced.height);
    const source=document.createElement('canvas');source.width=1536;source.height=1024;
    const context=source.getContext('2d')!;context.drawImage(reduced,0,0,1536,1024);
    return [...context.getImageData(...box).data];
  },box);
  const directory=`artifacts/stage2-rework/counter/${info.project.name}-${renderer}`;await mkdir(directory,{recursive:true});
  for(const works of [13,16,20]){
    await open(page,'shop-2',works);await view(page,'shop-service');
    if(renderer==='canvas2d')await expect(page.locator(scene)).toHaveAttribute('data-renderer','canvas2d');
    const actual=await sceneSourcePixels(page,surface,box);
    let difference=0;for(let i=0;i<actual.length;i++)if(i%4!==3)difference+=Math.abs(actual[i]-expected[i]);
    expect(difference/(actual.length/4*3),`clean counter foot at ${works}/20`).toBeLessThan(15);
    await writeFile(`${directory}/${works}.png`,await scenePNG(page,surface));
  }
});

test('Canvas2D keeps complete new shop furniture and both final room views',async({page},info)=>{
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(getContext,this,[kind,...args]);
    } as typeof getContext;
  });
  const directory=`artifacts/stage2-rework/shop-fallback/${info.project.name}`;await mkdir(directory,{recursive:true});
  for(const [works,name] of [[4,'shop-grocery'],[5,'shop-grocery'],[6,'shop-grocery'],[7,'shop-grocery'],[9,'shop-grocery'],[15,'shop-service'],[12,'shop-service'],[13,'shop-service'],[17,'shop-service'],[20,'shop-grocery'],[20,'shop-service']] as const){
    await open(page,'shop-2',works);await view(page,name);
    await expect(page.locator(scene)).toHaveAttribute('data-renderer','canvas2d');
    const frame=await page.locator(scene).boundingBox();expect(frame!.width/frame!.height).toBeCloseTo(1.5,3);
    const plan=await page.locator('.world-scene .hall-canvas-plan').evaluate(el=>JSON.parse(el.textContent!));
    for(const layer of plan.layers)expect(layer.source).toMatch(/\/assets\/shop-expansion-[\w-]+\.(webp|svg)$/);
    await writeFile(`${directory}/${works}-${name}.png`,await scenePNG(page,surface));
  }
  await page.screenshot({path:`docs/screenshots/shop-expansion-final-canvas2d-${info.project.name}.png`});
});
