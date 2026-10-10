import {test,expect,type Page} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {freshProgress,STORAGE_KEY} from '../../src/storage';
import {applyDebugSceneState} from '../../src/debug-scene';
import type {ProjectId} from '../../src/campaign';
import {chooseWorldView,settleHallFrame} from './hall-frame';
import {scenePNG,sceneSourcePixels} from './scene-pixels';
interface Contour {id:string;projectId:ProjectId;works:number;view:string;source:string;blendSource?:string;blendAlpha?:number;box:[number,number,number,number];tolerance:number;}
const paths=['docs/art/fruit-rooms/reports/contours-v2.json','docs/art/shop-expansion/reports/contours-v2.json'];
async function open(page:Page,c:Contour){const p=freshProgress();expect(applyDebugSceneState(p,{projectId:c.projectId,works:c.works,orders:0}).ok).toBe(true);p.stars=0;p.repairKits=0;p.settings.sound=false;p.settings.reducedMotion=true;await page.goto('/');await page.evaluate(({key,p})=>localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});await page.reload();await settleHallFrame(page);if(await page.locator('.world-scene>.hall-composition').getAttribute('data-scene-view')!==c.view)await chooseWorldView(page,c.view);await settleHallFrame(page);}
for(const renderer of ['default','canvas2d'] as const)test(`User reported furniture contours match independent whole donors (${renderer})`,async({page},info)=>{
  test.setTimeout(180_000);
  if(renderer==='canvas2d')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);} as typeof original;});
  const cases:Contour[]=(await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8')) as Contour[]))).flat();expect(cases.length).toBeGreaterThan(5);
  const dir=`artifacts/art-contours/${info.project.name}-${renderer}`;await mkdir(dir,{recursive:true});const results:{id:string;difference:number;tolerance:number}[]=[];
  for(const c of cases){
    await open(page,c);if(renderer==='canvas2d')await expect(page.locator('.world-scene>.hall-composition')).toHaveAttribute('data-renderer','canvas2d');
    const actual=await sceneSourcePixels(page,'.world-scene .hall-world-stage',c.box);
    await writeFile(`${dir}/${c.id}.png`,await scenePNG(page,'.world-scene .hall-world-stage'));
    // Render an independent whole donor through the SAME CSS box and backing size.
    // Rounding a fractional screenshot box ourselves shifts thin supports by a pixel.
    await page.evaluate(async({source,blendSource,blendAlpha,renderer})=>{
      const stage=document.querySelector('.world-scene .hall-world-stage')!,paint=stage.querySelector<HTMLCanvasElement>('.hall-canvas-surface')!;
      const reference=document.createElement('canvas');reference.className='qa-reference-canvas';reference.width=paint.width;reference.height=paint.height;
      reference.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:100;pointer-events:none';
      const ctx=reference.getContext('2d')!;ctx.imageSmoothingQuality=renderer==='canvas2d'?'high':'low';
      const draw=async(name:string,alpha=1)=>{const image=new Image();image.src=`/assets/${name}`;await image.decode();ctx.globalAlpha=alpha;ctx.drawImage(image,0,0,reference.width,reference.height);};
      await draw(source);if(blendSource)await draw(blendSource,blendAlpha);stage.append(reference);
    },{source:c.source,blendSource:c.blendSource,blendAlpha:c.blendAlpha,renderer});
    let expected:number[];
    try {expected=await sceneSourcePixels(page,'.world-scene .hall-world-stage',c.box);await writeFile(`${dir}/${c.id}-reference.png`,await scenePNG(page,'.world-scene .hall-world-stage'));}
    finally {await page.locator('.qa-reference-canvas').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));}
    let difference=0;for(let i=0;i<actual.length;i++)if(i%4!==3)difference+=Math.abs(actual[i]-expected![i]);difference/=actual.length/4*3;
    results.push({id:c.id,difference,tolerance:c.tolerance});
    expect.soft(difference,`${c.id} at ${c.works}: RGB difference ${difference.toFixed(2)}`).toBeLessThan(c.tolerance);
  }
  await writeFile(`${dir}/results.json`,JSON.stringify(results,null,2));
});
