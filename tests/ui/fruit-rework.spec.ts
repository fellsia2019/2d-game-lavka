import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {freshProgress,STORAGE_KEY} from '../../src/storage';
import {applyDebugSceneState} from '../../src/debug-scene';
import {projectTasks,type ProjectId} from '../../src/campaign';
import {sceneTaskView} from '../../src/campaign-scene';
import {scenePNG} from './scene-pixels';
import {settleHallFrame,expectWholeHallFrame,chooseWorldView} from './hall-frame';

const surface='.world-scene .hall-world-stage';
async function open(page:Page,project:ProjectId,works:number){
  const p=freshProgress();expect(applyDebugSceneState(p,{projectId:project,works,orders:0}).ok).toBe(true);
  p.stars=0;p.repairKits=0;p.settings.sound=false;p.settings.reducedMotion=true;
  await page.goto('/');await page.evaluate(({key,p})=>localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});
  await page.reload();await settleHallFrame(page);
}
async function view(page:Page,name:string){
  if(await page.locator('.world-scene > .hall-composition').getAttribute('data-scene-view')!==name)await chooseWorldView(page,name);
  await settleHallFrame(page);
}
const failures=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{
  const errors:string[]=[];failures.set(page,errors);page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
});
test.afterEach(({page})=>expect(failures.get(page)).toEqual([]));
for(const project of ['fruit-yard-1','fruit-yard-2'] as const)test(`All ${project} construction and furnishing frames remain whole`,async({page},info)=>{
  test.setTimeout(300_000);
  const directory=`artifacts/fruit-rework/runtime/${project}/${info.project.name}`;await mkdir(directory,{recursive:true});
  const tasks=projectTasks(project),frames:{works:number;view:string;file:string}[]=[];
  const capture=async(works:number,name:string,suffix='')=>{
    await view(page,name);await expectWholeHallFrame(page);
    await expect(page.locator('.world-scene .scene-layer')).toHaveCount(0);
    const file=`${String(works).padStart(2,'0')}${suffix}-${name}.png`;
    await writeFile(`${directory}/${file}`,await scenePNG(page,surface));frames.push({works,view:name,file});
    const target=page.locator('.world-target');
    if(await target.count())expect(await target.evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  };
  for(let works=0;works<=tasks.length;works++){
    await open(page,project,works);
    const name=sceneTaskView(tasks[Math.max(0,works-1)].id);await capture(works,name);
    if(tasks[works]&&sceneTaskView(tasks[works].id)!==name)await capture(works,sceneTaskView(tasks[works].id),'-next');
    if([0,6,7,9,12,14,18,20,26].includes(works))await page.screenshot({path:`docs/screenshots/fruit-${project}-${works}-${info.project.name}.png`});
  }
  for(const name of project==='fruit-yard-1'?['fruit-yard','fruit-market']:['fruit-extension-site','fruit-extension','fruit-market'])await capture(tasks.length,name,'-complete');
  await writeFile(`${directory}/frames.json`,JSON.stringify(frames,null,2));
});

test('Fruit buildings, room choice and map preserve whole frames across window sizes',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Explicit viewport matrix runs once.');
  for(const [width,height] of [[1280,900],[360,640],[384,720],[360,400],[768,1024],[1024,768],[640,360]]){
    await page.setViewportSize({width,height});await open(page,'fruit-yard-2',20);
    for(const name of ['fruit-market','fruit-extension']){
      await view(page,name);await expectWholeHallFrame(page);
      await page.locator('.world-globe').click();await expect(page.locator('.navigation-room-heading')).toHaveText('Помещения и зоны');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
      await page.screenshot({path:`docs/screenshots/fruit-${name}-${width}x${height}.png`});
    }
  }
});

test('Canvas2D keeps the assembled fruit objects complete',async({page},info)=>{
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(getContext,this,[kind,...args]);} as typeof getContext;
  });
  const directory=`artifacts/fruit-rework/fallback/${info.project.name}`;await mkdir(directory,{recursive:true});
  for(const [project,works,name] of [['fruit-yard-1',7,'fruit-yard'],['fruit-yard-1',12,'fruit-yard'],['fruit-yard-1',14,'fruit-market'],['fruit-yard-1',26,'fruit-market'],['fruit-yard-1',17,'fruit-market'],['fruit-yard-1',18,'fruit-market'],['fruit-yard-1',19,'fruit-market'],['fruit-yard-1',25,'fruit-market'],['fruit-yard-2',9,'fruit-extension-site'],['fruit-yard-2',11,'fruit-extension'],['fruit-yard-2',12,'fruit-extension'],['fruit-yard-2',13,'fruit-extension'],['fruit-yard-2',20,'fruit-extension'],['fruit-yard-2',20,'fruit-market']] as const){
    await open(page,project,works);await view(page,name);
    await expect(page.locator('.world-scene > .hall-composition')).toHaveAttribute('data-renderer','canvas2d');
    await writeFile(`${directory}/${project}-${works}-${name}.png`,await scenePNG(page,surface));
  }
});
