import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {freshProgress,STORAGE_KEY} from '../../src/storage';
import {applyDebugSceneState} from '../../src/debug-scene';
import {type ProjectId} from '../../src/campaign';
import {scenePNG} from './scene-pixels';

const scene='.world-scene > .hall-composition';
const surface='.world-scene .hall-world-stage';
async function open(page:Page,projectId:ProjectId,works:number,view:string){
  const progress=freshProgress();applyDebugSceneState(progress,{projectId,works,orders:0});
  progress.settings.sound=false;progress.settings.reducedMotion=true;
  await page.goto('/');
  await page.evaluate(({key,progress})=>localStorage.setItem(key,JSON.stringify(progress)),{key:STORAGE_KEY,progress});
  await page.reload();
  if(await page.locator(scene).getAttribute('data-scene-view')!==view){
    await page.locator('.world-hud [data-action="world-navigation"]').click();
    await page.locator(`.navigation-view-card[data-view="${view}"]`).click();
  }
  await expect(page.locator(scene)).toHaveAttribute('data-scene-ready','true');
}
async function sampling(page:Page){
  await expect.poll(()=>page.locator(`${scene} canvas`).evaluate((canvas:HTMLCanvasElement)=>{
    const rect=canvas.getBoundingClientRect(),resolution=Math.min(1,rect.width*devicePixelRatio/1536,rect.height*devicePixelRatio/1024);
    return Math.max(Math.abs(canvas.width-Math.round(1536*resolution)),Math.abs(canvas.height-Math.round(1024*resolution)));
  })).toBeLessThanOrEqual(1);
}
for(const renderer of ['default','canvas2d'] as const)test(`Art sampling follows viewport and density without replacing the room (${renderer})`,async({page,browser},info)=>{
  test.setTimeout(180_000);
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  const directory=`artifacts/warehouse-v6/sampling/${info.project.name}-${renderer}`;
  await mkdir(directory,{recursive:true});
  let storageFrame:Buffer|undefined;
  for(const [project,works,view] of [
    ['warehouse-1',13,'warehouse'],['warehouse-1',24,'warehouse'],
    ['warehouse-2',3,'warehouse-cold'],['shop-1',14,'hall'],
  ] as const){
    await open(page,project,works,view);await sampling(page);
    await expect(page.locator(scene)).toHaveAttribute('data-renderer',renderer==='canvas2d'?'canvas2d':'pixi-webgl');
    const png=await scenePNG(page,surface);
    if(project==='warehouse-1'&&works===24)storageFrame=png;
    await writeFile(`${directory}/${view}-${works}.png`,png);
  }
  await page.evaluate(()=>{(window as unknown as {samplingCanvas:Element|null}).samplingCanvas=document.querySelector('.world-scene canvas');});
  for(const [width,height] of [[360,400],[768,1024],[640,360],[1280,900],[360,640],[1440,1000]]){
    await page.setViewportSize({width,height});await sampling(page);
    expect(await page.evaluate(()=>(window as unknown as {samplingCanvas:Element|null}).samplingCanvas===document.querySelector('.world-scene canvas'))).toBe(true);
    await expect(page.locator(scene)).toHaveAttribute('data-scene-ready','true');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
  if(info.project.name==='mobile-360'&&renderer==='default'){
    // A high-quality independent 2D render distinguishes continuous floor
    // seams from the rejected punctuated GL output (mean RGB error 2.489).
    const reference=await browser.newContext({baseURL:'http://127.0.0.1:4190',viewport:{width:360,height:640},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    try{
      const fallback=await reference.newPage();
      await fallback.addInitScript(()=>{
        const original=HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
          return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
        } as typeof original;
      });
      await open(fallback,'warehouse-1',24,'warehouse');await sampling(fallback);
      const oracle=await scenePNG(fallback,surface);
      const difference=await page.evaluate(async({actual,oracle})=>{
        const pixels=async(encoded:string)=>{
          const bytes=Uint8Array.from(atob(encoded),value=>value.charCodeAt(0));
          const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
          const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);bitmap.close();
          return context.getImageData(10,165,250,70).data;
        };
        const a=await pixels(actual),b=await pixels(oracle);let sum=0;
        for(let i=0;i<a.length;i++)if(i%4!==3)sum+=Math.abs(a[i]-b[i]);
        return sum/(a.length/4*3);
      },{actual:storageFrame!.toString('base64'),oracle:oracle.toString('base64')});
      expect(difference,'thin floor seams match the independently reduced artwork').toBeLessThan(2.1);
    }finally{await reference.close();}
    const context=await browser.newContext({baseURL:'http://127.0.0.1:4190',viewport:{width:360,height:640},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    try{
      const phone=await context.newPage();
      phone.on('pageerror',error=>errors.push(error.message));
      for(const [project,works,view] of [['warehouse-1',24,'warehouse'],['warehouse-2',3,'warehouse-cold'],['shop-1',14,'hall']] as const){
        await open(phone,project,works,view);await sampling(phone);
        await writeFile(`${directory}/${view}-${works}-dpr3.png`,await scenePNG(phone,surface));
      }
    }finally{await context.close();}
    expect(errors).toEqual([]);
  }
});
