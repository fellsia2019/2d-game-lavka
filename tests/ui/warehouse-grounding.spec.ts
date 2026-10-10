import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { projectOrders, projectTasks, type ProjectId } from '../../src/campaign';
import { freshProgress, STORAGE_KEY } from '../../src/storage';
import { scenePNG, sceneSourcePixels } from './scene-pixels';
import { STORAGE_SHADOWS, COLD_SHADOWS, EXTERIOR_SHADOWS } from '../../src/warehouse-shadows';

const scene = '.world-scene > .hall-composition';
const surface = '.world-scene .hall-world-stage';
async function open(page: Page, project: 'warehouse-1'|'warehouse-2', works: number, view: string) {
  const p = freshProgress(); p.selectedProject = project;
  p.settings.sound = false; p.settings.reducedMotion = true;
  const prior: ProjectId[] = project === 'warehouse-1' ? ['shop-1'] : ['shop-1','warehouse-1'];
  for (const id of prior) {
    p.completed.push(...projectOrders(id).map(order=>order.id));
    p.campaign.completedTasks.push(...projectTasks(id).map(task=>task.id));
  }
  p.campaign.completedTasks.push(...projectTasks(project).slice(0,works).map(task=>task.id));
  await page.goto('/');
  await page.evaluate(({key,p})=>localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});
  await page.reload();
  if (await page.locator(scene).getAttribute('data-scene-view') !== view) {
    await page.locator('.world-hud [data-action="world-navigation"]').click();
    await page.locator(`.navigation-view-card[data-view="${view}"]`).click();
  }
  await expect(page.locator(scene)).toHaveAttribute('data-scene-ready','true');
}
async function mean(page: Page, x: number, y: number) {
  const pixels = await sceneSourcePixels(page,surface,[x-3,y-3,6,6]);
  return [0,1,2].map(channel=>pixels.filter((_,i)=>i%4===channel).reduce((sum,p)=>sum+p,0)/36);
}

for (const renderer of ['default','canvas2d'] as const) test(`Reconstructed warehouse tables have complete feet and floor contacts (${renderer})`,async({page},info)=>{
  if (renderer === 'canvas2d') await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  const faults:string[]=[]; page.on('pageerror',error=>faults.push(error.message));
  page.on('response',response=>{if(response.status()>=400)faults.push(`${response.status()} ${response.url()}`);});
  await open(page,'warehouse-1',18,'warehouse');
  if(renderer==='canvas2d')await expect(page.locator(scene)).toHaveAttribute('data-renderer','canvas2d');
  // Include the recovered rear leg below the old donor's y505 cutoff.
  for (const [x,y] of [[410,548],[479,581],[640,543],[568,520]]) {
    const rgb=await mean(page,x,y);
    expect(rgb[1]-rgb[0],`complete table foot at ${x},${y}`).toBeGreaterThan(12);
    expect(rgb[2]-rgb[0],`complete table foot at ${x},${y}`).toBeGreaterThan(12);
  }
  await expect(page.locator('[data-layer-id="storage-inspection-table-shadow"]')).toHaveCount(1);
  await page.screenshot({path:`docs/screenshots/warehouse-contacts-v6-table-${info.project.name}-${renderer}.png`});
  await open(page,'warehouse-1',24,'warehouse');
  for(const [x,y] of [[620,486],[715,508],[798,486]]) {
    const rgb=await mean(page,x,y);
    expect(rgb[1]-rgb[0],`complete packing foot at ${x},${y}`).toBeGreaterThan(12);
    expect(rgb[2]-rgb[0],`complete packing foot at ${x},${y}`).toBeGreaterThan(12);
  }
  // Donor-floor fragments cannot be part of a contact effect: every texture has
  // real transparency, a warm contact at the foot, and zero alpha far away.
  const contactChecks=[
    ['storage-inspection-table',479,594],['storage-pallet',943,653],['storage-trolley',316,858],
    ['cold-cabinet',351,718],['cold-rack',913,705],['cold-fruit',1450,853],
    ['exterior-wash-basin',1190,628],
  ] as const;
  for(const [id,x,y] of contactChecks) {
    const alpha=await page.evaluate(async({id,x,y})=>{
      const image=new Image();image.src=`/assets/warehouse-shadow-${id}-v8.svg`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;
      const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
      return {contact:context.getImageData(x,y,1,1).data[3],background:context.getImageData(20,20,1,1).data[3],
        above:context.getImageData(x,y-12,1,1).data[3],below:context.getImageData(x,y+12,1,1).data[3]};
    },{id,x,y});
    expect(alpha.contact,`warm contact ${id}`).toBeGreaterThan(10);expect(alpha.background).toBe(0);
    expect(alpha.above,`No tall silhouette above ${id}`).toBe(0);
    expect(alpha.below,`No broad stain below ${id}`).toBe(0);
  }
  const directory=`artifacts/warehouse-contacts-v6/${info.project.name}-${renderer}`;
  await mkdir(directory,{recursive:true});
  for(const [project,works,name] of [
    ['warehouse-1',26,'warehouse'],['warehouse-2',12,'warehouse-cold'],['warehouse-2',20,'warehouse-receiving'],
  ] as const) {
    await open(page,project,works,name);
    const shadows=name==='warehouse'?STORAGE_SHADOWS:name==='warehouse-cold'?COLD_SHADOWS:EXTERIOR_SHADOWS;
    const plan=await page.locator(`${scene} .hall-canvas-plan`).textContent();
    const layers=JSON.parse(plan!).layers as {id:string;kind:string;alpha:number;source:string}[];
    for(const shadow of shadows) {
      const layer=layers.find(layer=>layer.id===shadow.id);
      expect(layer?.kind).toBe('shadow');expect(layer?.alpha).toBe(1);
      expect(new URL(layer!.source,'http://127.0.0.1:4190/').pathname).toBe(`/assets/${shadow.source}`);
    }
    await writeFile(`${directory}/${name}.png`,await scenePNG(page,surface));
    if(renderer==='default')await page.screenshot({path:`docs/screenshots/warehouse-contacts-v6-${name}-${info.project.name}.png`});
  }
  expect(faults).toEqual([]);
});

for(const renderer of ['default','canvas2d'] as const) test(`Cans, table contours and all parking corners remain complete (${renderer})`,async({page},info)=>{
  test.setTimeout(120_000);
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  const faults:string[]=[];page.on('pageerror',error=>faults.push(error.message));
  page.on('response',response=>{if(response.status()>=400)faults.push(`${response.status()} ${response.url()}`);});
  const reference = async(source:string,points:number[][])=>page.evaluate(async({source,points})=>{
    const image=new Image();image.src=source;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;
    const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
    return points.map(([x,y])=>{
      const pixels=[...context.getImageData(x-3,y-3,6,6).data];
      return [0,1,2].map(channel=>pixels.filter((_,i)=>i%4===channel).reduce((sum,p)=>sum+p,0)/36);
    });
  },{source,points});
  await open(page,'warehouse-1',18,'warehouse');
  // Exposed floor beside each turned support used to contain imported brown
  // donor pixels along the whole leg. Only the bottom contact belongs there.
  const floorPoints=[[426,497],[495,520],[656,492]];
  const floor=await reference('/assets/warehouse-room-storage-clean.webp',floorPoints);
  for(const [index,[x,y]] of floorPoints.entries()){
    const actual=await mean(page,x,y);
    expect(actual.reduce((sum,value,c)=>sum+Math.abs(value-floor[index][c]),0)/3,
      `clean floor beside the leg at ${x},${y}`).toBeLessThan(14);
  }
  await open(page,'warehouse-1',23,'warehouse');
  const canPoints=[[451,535],[534,551],[586,545]];
  const cans=await reference('/assets/warehouse-room-storage-cans-bare.webp',canPoints);
  for(const [index,[x,y]] of canPoints.entries()){
    const actual=await mean(page,x,y);
    expect(actual.reduce((sum,value,c)=>sum+Math.abs(value-cans[index][c]),0)/3,
      `whole metal can at ${x},${y}`).toBeLessThan(22);
    // Metal legitimately reflects warm flooring; teal's green/blue dominance
    // was the old table-post artefact, rather than any non-neutral colour.
    expect(actual[1]-actual[0],'can body has no old teal post inside').toBeLessThan(20);
    expect(actual[2]-actual[0],'can body has no old teal post inside').toBeLessThan(20);
  }
  await page.screenshot({path:`docs/screenshots/warehouse-v6-cans-${info.project.name}-${renderer}.png`});
  const directory=`artifacts/warehouse-contacts-v6/${info.project.name}-${renderer}`;
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/cans.png`,await scenePNG(page,surface));
  await open(page,'warehouse-1',24,'warehouse');
  const plan=JSON.parse((await page.locator(`${scene} .hall-canvas-plan`).textContent())!);
  for(const id of ['storage-packing-bench','storage-packing-kit']){
    expect(plan.layers.find((layer:{id:string})=>layer.id===id).source)
      .toContain('warehouse-room-storage-packing-station-v6.webp');
  }
  await page.screenshot({path:`docs/screenshots/warehouse-v6-workstation-${info.project.name}-${renderer}.png`});
  await writeFile(`${directory}/workstation.png`,await scenePNG(page,surface));
  const corners=[[132,682],[491,663],[673,806],[206,838]];
  await open(page,'warehouse-1',19,'warehouse-receiving');
  const before:number[][]=[];
  for(const [x,y] of corners)before.push(await mean(page,x,y));
  await open(page,'warehouse-1',20,'warehouse-receiving');
  for(const [index,[x,y]] of corners.entries()){
    const actual=await mean(page,x,y);
    expect(actual[2]-before[index][2],`paint survives at parking corner ${x},${y}`).toBeGreaterThan(20);
  }
  await page.screenshot({path:`docs/screenshots/warehouse-v6-parking-${info.project.name}-${renderer}.png`});
  await writeFile(`${directory}/parking.png`,await scenePNG(page,surface));
  expect(faults).toEqual([]);
});

for(const renderer of ['default','canvas2d'] as const) test(`Step 16 has the whole right crate before the foreground delivery crate exists (${renderer})`,async({page},info)=>{
  test.setTimeout(300_000);
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  const faults:string[]=[];page.on('pageerror',error=>faults.push(error.message));
  page.on('response',response=>{if(response.status()>=400)faults.push(`${response.status()} ${response.url()}`);});
  const directory=`artifacts/warehouse-contacts-v6/${info.project.name}-${renderer}`;
  await mkdir(directory,{recursive:true});
  // Independent intact donor, not the general plate with a later crate hiding
  // its foot. These two sites had a 27–28 RGB error in the old real screenshot.
  await open(page,'warehouse-1',16,'warehouse');
  const reference=await page.evaluate(async()=>{
    const image=new Image();image.src='/assets/warehouse-room-storage-dry-crates-bare.webp';await image.decode();
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;
    const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
    return [[1280,704],[1328,733]].map(([x,y])=>{
      const data=context.getImageData(x-3,y-3,6,6).data;
      return [0,1,2].map(channel=>[...data].filter((_,i)=>i%4===channel).reduce((sum,value)=>sum+value,0)/36);
    });
  });
  for(let works=16;works<=26;works++){
    if(works>16)await open(page,'warehouse-1',works,'warehouse');
    await expect(page.locator(scene)).toHaveAttribute('data-art-version','warehouse-rooms-8');
    if(works<24){
      for(const [index,[x,y]] of [[1280,704],[1328,733]].entries()){
        const actual=await mean(page,x,y);
        expect(actual.reduce((sum,value,channel)=>sum+Math.abs(value-reference[index][channel]),0)/3,
          `Whole right-crate front/foot ${x},${y} at ${works}/26`).toBeLessThan(22);
      }
    }
    await writeFile(`${directory}/storage-${works}.png`,await scenePNG(page,surface));
    // At 24 the next delivery crate is a legitimate transparent preview; at
    // 25 it owns its complete silhouette. Neither may be a stray clipped rim.
    if([16,22].includes(works)&&renderer==='default')
      await page.screenshot({path:`docs/screenshots/warehouse-contacts-v6-${works}-${info.project.name}.png`});
  }
  expect(faults).toEqual([]);
});
