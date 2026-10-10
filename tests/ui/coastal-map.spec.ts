import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {freshProgress,STORAGE_KEY} from '../../src/storage';
import {applyDebugSceneState} from '../../src/debug-scene';
import {projectTasks,type ProjectId} from '../../src/campaign';
import {COASTAL_MAP_VERSION,COASTAL_BAKERY_SITE} from '../../src/coastal-map-scene';

async function open(page:Page,project:ProjectId,works:number){
  const p=freshProgress();expect(applyDebugSceneState(p,{projectId:project,works,orders:0}).ok).toBe(true);
  p.settings.sound=false;p.settings.reducedMotion=true;
  await page.goto('/');await page.evaluate(({key,p})=>localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});
  await page.reload();await page.locator('.world-scene-back[data-action="show-map"]').click();
  await expect(page.locator('.coastal-map-art')).toHaveAttribute('data-art-version',COASTAL_MAP_VERSION);
  await page.evaluate(async()=>{
    await Promise.all([...document.querySelectorAll<SVGImageElement>('.coastal-map-art image')].map(async element=>{const image=new Image();image.src=element.href.baseVal;await image.decode();}));
    await document.fonts.ready;await new Promise(requestAnimationFrame);
  });
}
const points=[[1280,365],[1271,397],[1392,391],[1042,563],[1241,582],[1118,465],[654,158],[789,185]];
const failures=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{
  const errors:string[]=[];failures.set(page,errors);page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
});
test.afterEach(({page})=>expect(failures.get(page)).toEqual([]));

test('Coastal map keeps independent construction and unique locked architecture',async({page},info)=>{
  test.setTimeout(300_000);
  const directory=`artifacts/coastal-map/runtime/${info.project.name}`;await mkdir(directory,{recursive:true});
  const frames:{project:ProjectId;works:number;file:string}[]=[];
  for(const project of ['warehouse-1','fruit-yard-1','fruit-yard-2'] as const){
    const states=[...Array.from({length:project==='fruit-yard-2'?13:15},(_,i)=>i),projectTasks(project).length];
    for(const works of states){
      await open(page,project,works);
      await expect(page.locator('.world-map .scene-layer,.warehouse-map-plate')).toHaveCount(0);
      const expected=await page.evaluate(async({points,bakeryDomain})=>{
        const image=new Image();image.src='/assets/coastal-map-cleared-v1.webp';await image.decode();
        const bakery=new Image();bakery.src='/assets/coastal-bakery-map-before.webp';await bakery.decode();
        const r=document.querySelector('.coastal-map-art')!.getBoundingClientRect(),small=document.createElement('canvas');
        small.width=Math.round(r.width*devicePixelRatio);small.height=Math.round(r.height*devicePixelRatio);
        const draw=small.getContext('2d')!;draw.imageSmoothingQuality='high';draw.drawImage(image,0,0,small.width,small.height);
        const c=document.createElement('canvas');c.width=1536;c.height=1024;const ctx=c.getContext('2d')!;ctx.drawImage(small,0,0,1536,1024);
        const base=ctx.getImageData(0,0,1536,1024).data;draw.clearRect(0,0,small.width,small.height);draw.drawImage(bakery,0,0,small.width,small.height);ctx.drawImage(small,0,0,1536,1024);
        const replacement=ctx.getImageData(0,0,1536,1024).data,path=new Path2D(bakeryDomain);
        return points.map(([x,y])=>{const data=ctx.isPointInPath(path,x,y)?replacement:base;return[0,1,2].map(k=>{let sum=0;for(let yy=y-3;yy<y+3;yy++)for(let xx=x-3;xx<x+3;xx++)sum+=data[(yy*1536+xx)*4+k];return sum/36;});});
      },{points,bakeryDomain:COASTAL_BAKERY_SITE.beforeDomain});
      const png=await page.locator('.coastal-map-art').screenshot({style:'.scene-interaction-layer,.world-hud,.world-scene-back{visibility:hidden!important}'});
      const actual=await page.evaluate(async({png,points})=>{
        const bytes=Uint8Array.from(atob(png),v=>v.charCodeAt(0)),image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
        const c=document.createElement('canvas');c.width=1536;c.height=1024;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0,1536,1024);image.close();
        return points.map(([x,y])=>{const a=ctx.getImageData(x-3,y-3,6,6).data;return[0,1,2].map(k=>Array.from(a).filter((_,i)=>i%4===k).reduce((n,v)=>n+v,0)/36);});
      },{png:png.toString('base64'),points});
      for(const [i,mean] of actual.entries())expect(mean.reduce((n,v,k)=>n+Math.abs(v-expected[i][k]),0)/3,`locked feature ${points[i]} during ${project} ${works}`).toBeLessThan(18);
      const file=`${project}-${String(works).padStart(2,'0')}`;
      await writeFile(`${directory}/${file}.png`,png);await page.screenshot({path:`${directory}/${file}-ui.png`});
      frames.push({project,works,file});
    }
  }
  await writeFile(`${directory}/frames.json`,JSON.stringify(frames,null,2));
  await page.screenshot({path:`docs/screenshots/coastal-map-final-${info.project.name}.png`});
});

test('Available buildings open a read-only room chooser and closed places remain locked',async({page},info)=>{
  await open(page,'fruit-yard-2',20);
  const before=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
  for(const area of ['shop','warehouse','fruit-yard']){
    await page.locator(`.world-pin[data-area="${area}"]`).click();
    await expect(page.locator('.modal-navigation')).toBeVisible();
    await expect(page.locator('.navigation-room-description')).toHaveText('Помещения и зоны здания');
    for(const preview of await page.locator('.modal-navigation .hall-composition').all())
      await expect(preview).toHaveAttribute('data-scene-ready','true');
    expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(before);
    await page.screenshot({path:`docs/screenshots/room-chooser-${area}-${info.project.name}.png`});
    await page.keyboard.press('Escape');await expect(page.locator('.world-pin[data-area="'+area+'"]').first()).toBeFocused();
  }
  for(const area of ['bakery','terrace','restaurant']){
    await page.locator(`.world-pin[data-area="${area}"]`).click();
    await expect(page.locator('.modal-navigation')).toHaveCount(0);
    expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(before);
  }
});

test('Compact map marks keep all names visible beside abandoned and finished buildings',async({page},info)=>{
  for(const [project,works] of [['warehouse-1',0],['warehouse-1',14],['fruit-yard-1',0],['fruit-yard-1',14],['fruit-yard-2',20]] as const){
    await open(page,project,works);
    for(const name of await page.locator('.world-pin > b').all())await expect(name).toBeVisible();
    await page.screenshot({path:`docs/screenshots/coastal-map-compact-${project}-${works}-${info.project.name}.png`});
  }
});

test('Bakery map construction preserves neighbouring buildings, paths and the overall scale',async({page},info)=>{
  test.setTimeout(240_000);
  const directory=`artifacts/bakery/map/${info.project.name}`;await mkdir(directory,{recursive:true});
  let before:Buffer|undefined,baseline:{x:number;y:number;width:number;height:number}|undefined;
  const states=[0,1,2,3,4,5,6,7,8,9,10,23,26],frames:{works:number;file:string}[]=[];
  for(const works of states){
    await open(page,'bakery-1',works);
    const bounds=(await page.locator('.coastal-map-art').boundingBox())!;
    if(baseline)for(const key of ['x','y','width','height'] as const)expect(bounds[key]).toBeCloseTo(baseline[key],1);
    else baseline=bounds;
    await expect(page.locator('[data-map-site="bakery"]')).toHaveAttribute('data-map-stage',String(works));
    const png=await page.locator('.coastal-map-art').screenshot({style:'.scene-interaction-layer,.world-hud,.world-scene-back{visibility:hidden!important}'});
    if(before){
      const difference=await page.evaluate(async({a,b,domain,beforeDomain})=>{
        const decode=async(encoded:string)=>{const bytes=Uint8Array.from(atob(encoded),v=>v.charCodeAt(0)),image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const c=document.createElement('canvas');c.width=1536;c.height=1024;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0,1536,1024);image.close();return{ctx,data:ctx.getImageData(0,0,1536,1024).data};};
        const first=await decode(a),next=await decode(b),paths=[new Path2D(domain),new Path2D(beforeDomain)];
        let sum=0,count=0;
        for(let y=20;y<1000;y+=12)for(let x=20;x<1516;x+=12){
          if(paths.some(path=>[-16,0,16].some(dx=>[-16,0,16].some(dy=>first.ctx.isPointInPath(path,x+dx,y+dy)))))continue;
          const i=(y*1536+x)*4;for(let k=0;k<3;k++){sum+=Math.abs(first.data[i+k]-next.data[i+k]);count++;}
        }
        return sum/count;
      },{a:before.toString('base64'),b:png.toString('base64'),domain:COASTAL_BAKERY_SITE.domain,beforeDomain:COASTAL_BAKERY_SITE.beforeDomain});
      expect(difference,'Construction cannot repaint neighbouring plots or shift the whole map').toBeLessThan(.1);
    }else before=png;
    const file=`bakery-${String(works).padStart(2,'0')}.png`;await writeFile(`${directory}/${file}`,png);frames.push({works,file});
    if([0,7,10,26].includes(works))await page.screenshot({path:`docs/screenshots/bakery-map-${works}-${info.project.name}.png`});
  }
  await writeFile(`${directory}/frames.json`,JSON.stringify(frames,null,2));
});
