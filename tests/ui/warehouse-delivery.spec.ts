import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {freshProgress,STORAGE_KEY} from '../../src/storage';
import {projectOrders,projectTasks} from '../../src/campaign';
import {scenePNG,sceneSourcePixels} from './scene-pixels';
const scene='.world-scene > .hall-composition';
const surface='.world-scene .hall-world-stage';
async function open(page:Page,works:number){
  const progress=freshProgress();progress.selectedProject='warehouse-1';
  progress.settings.sound=false;progress.settings.reducedMotion=true;
  progress.completed=projectOrders('shop-1').map(order=>order.id);
  progress.campaign.completedTasks=[...projectTasks('shop-1'),...projectTasks('warehouse-1').slice(0,works)].map(task=>task.id);
  await page.goto('/');
  await page.evaluate(({key,progress})=>localStorage.setItem(key,JSON.stringify(progress)),{key:STORAGE_KEY,progress});
  await page.reload();
  if(await page.locator(scene).getAttribute('data-scene-view')!=='warehouse'){
    await page.locator('.world-globe').click();await page.locator('.navigation-view-card[data-view="warehouse"]').click();
  }
  await expect(page.locator(scene)).toHaveAttribute('data-scene-ready','true');
  await expect(page.locator(scene)).toHaveAttribute('data-art-version','warehouse-rooms-8');
}
const points=[[1210,741],[1215,756],[1366,735],[1334,715],[1154,861],[1226,893],[1323,943],[1457,869]];
async function means(page:Page){
  const pixels=await sceneSourcePixels(page,surface,[1130,680,360,280]);
  return points.map(([x,y])=>[0,1,2].map(c=>{
    let sum=0;for(let dy=-3;dy<3;dy++)for(let dx=-3;dx<3;dx++)sum+=pixels[((y+dy-680)*360+x+dx-1130)*4+c];
    return sum/36;
  }));
}
for(const renderer of ['default','canvas2d'] as const)test(`Delivery preserves whole jam jars and supports, including the single-opacity preview (${renderer})`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  const directory=`artifacts/warehouse-v7/delivery/${info.project.name}-${renderer}`;
  await mkdir(directory,{recursive:true});
  await open(page,23);const floor=await means(page);
  // Independent intact master resized as an ordinary bitmap, with no app masks.
  const reference=await page.evaluate(async(points)=>{
    const image=new Image();image.src='/assets/warehouse-room-storage-master.webp';await image.decode();
    const rect=document.querySelector('.world-scene .hall-world-stage')!.getBoundingClientRect();
    const sampled=document.createElement('canvas');sampled.width=Math.round(rect.width*devicePixelRatio);sampled.height=Math.round(rect.height*devicePixelRatio);
    const reduced=sampled.getContext('2d')!;reduced.imageSmoothingQuality='high';reduced.filter='brightness(1.035)';
    reduced.drawImage(image,0,0,sampled.width,sampled.height);
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;
    const context=canvas.getContext('2d')!;context.drawImage(sampled,0,0,1536,1024);
    return points.map(([x,y])=>{
      const p=[...context.getImageData(x-3,y-3,6,6).data];
      return [0,1,2].map(c=>p.filter((_,i)=>i%4===c).reduce((sum,v)=>sum+v,0)/36);
    });
  },points);
  for(const works of [24,25,26]){
    await open(page,works);const actual=await means(page);
    for(const [i,point] of points.entries()){
      if(works===24&&i>=4)continue; // The small contact shadows also fade under these feet.
      const expected=works===24?reference[i].map((v,c)=>v*.27+floor[i][c]*.73):reference[i];
      const difference=actual[i].reduce((sum,v,c)=>sum+Math.abs(v-expected[c]),0)/3;
      expect(difference,`whole jar/foot ${point} at ${works}/26`).toBeLessThan(works===24?12:18);
    }
    await writeFile(`${directory}/${works}.png`,await scenePNG(page,surface));
    await page.screenshot({path:`docs/screenshots/warehouse-v7-delivery-${works}-${info.project.name}-${renderer}.png`});
  }
  expect(errors).toEqual([]);
});
