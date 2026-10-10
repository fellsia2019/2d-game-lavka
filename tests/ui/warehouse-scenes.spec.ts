import {enterMapBuilding} from './hall-frame';
import { finishScenePurchase } from './scene-purchase';
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { CHAPTER } from "../../src/content";
import { offlineChapterLevel } from "../../src/content-offline";
import { orderCurrency, projectOrders, projectTasks, type ProjectId } from "../../src/campaign";
import { sceneTaskView } from "../../src/campaign-scene";
import { WAREHOUSE_FOOTPRINT, WAREHOUSE_ASSETS } from "../../src/warehouse-scene";
import { COASTAL_MAP_VERSION } from "../../src/coastal-map-scene";
import { applyMove, clone, initial } from "../../src/engine";
import { createOrderAppearance } from "../../src/order-supplies";
import { freshProgress, rememberHint, STORAGE_KEY, type Progress } from "../../src/storage";

const projects = ["warehouse-1", "warehouse-2"] as const;
const builtViews = ["warehouse", "warehouse-cold", "warehouse-receiving"] as const;
const sizes = [[1280,900], [360,640], [768,1024], [1024,768], [640,360], [360,400]] as const;
const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const failures = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; failures.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(({ page }) => { expect(failures.get(page)).toEqual([]); });

/** Exact earned-minus-owned wallets; no currency, task or project is force-unlocked. */
function fixture(projectId: typeof projects[number], step: number, fundNext = false, pinned = true): Progress {
  const p = freshProgress(); p.selectedProject = projectId;
  p.settings.reducedMotion = true; p.settings.sound = false;
  const prior: ProjectId[] = projectId === "warehouse-1" ? ["shop-1"] : ["shop-1", "warehouse-1"];
  for (const id of prior) {
    p.completed.push(...projectOrders(id).map(order => order.id));
    p.campaign.completedTasks.push(...projectTasks(id).map(task => task.id));
  }
  const tasks = projectTasks(projectId), owned = tasks.slice(0, step);
  const spent = owned.reduce((sum, task) => sum + task.cost, 0);
  const count = spent + (fundNext ? tasks[step]?.cost ?? 0 : 0);
  p.completed.push(...projectOrders(projectId).slice(0, count).map(order => order.id));
  p.campaign.completedTasks.push(...owned.map(task => task.id));
  for (const currency of ["repairKits", "stars"] as const)
    p[currency] = p.completed.filter(id => orderCurrency(id) === currency).length - [...prior, projectId]
      .flatMap(id => projectTasks(id)).filter(task => task.currency === currency && p.campaign.completedTasks.includes(task.id))
      .reduce((sum, task) => sum + task.cost, 0);
  p.coins = p.completed.length * 60;
  p.renovations = { sign: "coral", counter: "honey", window: "sea" }; p.renovation = "coral";
  if (pinned) {
    // An unfinished replay also protects the exact attempt when all project orders are complete.
    const number = CHAPTER.findIndex(order => order.id === projectOrders(projectId)[0].id) + 1;
    const definition = offlineChapterLevel(number), board = initial(definition);
    p.attempt = { id: `warehouse-pinned-${projectId}`, definition, appearance: createOrderAppearance(definition),
      board: applyMove(board, ...definition.verifiedSolution[0])!, undo: [board],
      solution: clone(definition.verifiedSolution.slice(1)), mixCount: 0, hints: {}, reward: null };
    expect(rememberHint(p.attempt, p.attempt.solution!)).toBe(true);
    p.attempts[projectId] = p.attempt;
  }
  return p;
}

async function seed(page: Page, p: Progress) {
  await page.goto("/");
  await page.evaluate(({ key, p }) => localStorage.setItem(key, JSON.stringify(p)), { key: STORAGE_KEY, p });
  await page.reload();
  await expect(page.locator(".world")).toHaveAttribute("data-project", p.selectedProject);
  expect(await saved(page)).toEqual(p);
}
async function selectView(page: Page, view: string) {
  const scene = page.locator(".world-scene > .shop-composition");
  if (await scene.getAttribute("data-scene-view") !== view) {
    await page.locator('.world-hud [data-action="world-navigation"]').click();
    await page.locator(`.navigation-view-card[data-view="${view}"]`).click();
  }
  await expect(scene).toHaveAttribute("data-scene-view", view);
}
async function settle(page: Page) {
  const scene = page.locator(".world-scene > .shop-composition");
  await expect(scene).toHaveAttribute("data-scene-ready", "true");
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
}
async function fingerprint(page: Page) {
  await settle(page);
  return createHash("sha256").update(await page.locator(".world-scene .hall-world-stage").screenshot()).digest("hex");
}
async function geometry(page: Page, tag: string) {
  await settle(page);
  const data = await page.evaluate(() => {
    const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    const scene = document.querySelector<HTMLElement>(".world-scene > .shop-composition")!;
    const stage = document.querySelector(".world-stage")!;
    const canvas = scene.querySelector<HTMLCanvasElement>("canvas")!;
    const source = canvas.parentElement!;
    const matrix = new DOMMatrix(getComputedStyle(source).transform);
    const plan = JSON.parse(scene.querySelector('script[type="application/json"]')!.textContent!);
    return { width:innerWidth, height:innerHeight, horizontal:document.documentElement.scrollWidth-innerWidth,
      vertical:document.querySelector("#app")!.scrollHeight-document.querySelector("#app")!.clientHeight,
      frame:rect(scene), available:rect(stage), canvas:rect(canvas), native:{width:canvas.width,height:canvas.height}, density:devicePixelRatio,
      matrix:{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e,f:matrix.f},
      plan, renderer:scene.dataset.renderer,
      controls:[...document.querySelectorAll<HTMLButtonElement>(".world button")].map(button => {
        const box=button.getBoundingClientRect(), hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
        return {...rect(button),hit:!!hit&&button.contains(hit),label:button.getAttribute("aria-label")??button.textContent};
      }),
      labels:[...document.querySelectorAll(".target-price,.world-mission h2,.world-progress")].map(rect),
    };
  });
  expect(data.horizontal, tag).toBeLessThanOrEqual(1);
  expect(data.vertical, tag).toBeLessThanOrEqual(1);
  const sampling=Math.min(1,data.canvas.width*data.density/1536,data.canvas.height*data.density/1024);
  expect(Math.abs(data.native.width-Math.round(1536*sampling)),tag).toBeLessThanOrEqual(1);
  expect(Math.abs(data.native.height-Math.round(1024*sampling)),tag).toBeLessThanOrEqual(1);
  expect(data.frame.width/data.frame.height, tag).toBeCloseTo(1.5,3);
  expect(["pixi-webgl","canvas2d"], tag).toContain(data.renderer);
  expect(data.matrix.a, tag).toBeGreaterThan(0);
  expect(data.matrix.a, tag).toBeCloseTo(data.matrix.d,5);
  expect([data.matrix.b,data.matrix.c,data.matrix.e,data.matrix.f], tag).toEqual([0,0,0,0]);
  for (const edge of ["left","right","top","bottom"] as const) expect(data.canvas[edge],`${tag} canvas ${edge}`).toBeCloseTo(data.frame[edge],0);
  expect(data.frame.left,tag).toBeGreaterThanOrEqual(data.available.left-1);
  expect(data.frame.right,tag).toBeLessThanOrEqual(data.available.right+1);
  expect(data.frame.top,tag).toBeGreaterThanOrEqual(data.available.top-1);
  expect(data.frame.bottom,tag).toBeLessThanOrEqual(data.available.bottom+1);
  for (const control of data.controls) {
    expect(control.width,`${tag} ${control.label}`).toBeGreaterThanOrEqual(44);
    expect(control.height,`${tag} ${control.label}`).toBeGreaterThanOrEqual(44);
    expect(control.hit,`${tag} ${control.label}`).toBe(true);
  }
  for (const box of [...data.controls,...data.labels]) {
    expect(box.left,tag).toBeGreaterThanOrEqual(-1); expect(box.right,tag).toBeLessThanOrEqual(data.width+1);
    expect(box.top,tag).toBeGreaterThanOrEqual(-1); expect(box.bottom,tag).toBeLessThanOrEqual(data.height+1);
  }
  for (const [i,a] of data.controls.entries()) for (const b of data.controls.slice(i+1))
    expect(a.right<=b.left+1 || b.right<=a.left+1 || a.bottom<=b.top+1 || b.bottom<=a.top+1,`${tag}: ${a.label} / ${b.label}`).toBe(true);
  expect(data.plan.base,tag).toMatch(/\/warehouse-room-[\w-]+\.webp$/);
  for (const layer of data.plan.layers) {
    if (layer.source) {
      const source = new URL(layer.source, 'http://127.0.0.1:4190/');
      const file = source.pathname.split('/').at(-1)!;
      expect(source.origin, tag).toBe('http://127.0.0.1:4190');
      expect(source.pathname, tag).toBe(`/assets/${file}`);
      expect(WAREHOUSE_ASSETS, tag).toContain(file);
      if (layer.kind === 'shadow') expect(file, tag).toMatch(/^warehouse-shadow-[\w-]+\.svg$/);
    }
    for (const key of ["x","y","scale","rotation","width","height"]) expect(layer[key],`${tag} per-object ${key}`).toBeUndefined();
  }
  return data;
}
async function snapshot(page: Page, info: TestInfo, name: string) {
  // Reload restores the room before Pixi finishes decoding its paid layers.
  // Keep the captured evidence on the complete source frame rather than its loading bitmap.
  if (await page.locator(".world-scene > .hall-composition").count()) await settle(page);
  else await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({path:info.outputPath(`${name}.png`)});
}
async function mapGeometry(page: Page) {
  const data=await page.evaluate(() => ({
    width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,
    controls:[...document.querySelectorAll<HTMLButtonElement>(".world button")].map(button => {
      const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
        hit:!!hit&&button.contains(hit),label:button.getAttribute("aria-label")??button.textContent};
    }),
  }));
  expect(data.overflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".world-pin")).toHaveCount(6);
  for(const box of data.controls){
    expect(box.width,box.label!).toBeGreaterThanOrEqual(44);expect(box.height,box.label!).toBeGreaterThanOrEqual(44);
    expect(box.left,box.label!).toBeGreaterThanOrEqual(-1);expect(box.right,box.label!).toBeLessThanOrEqual(data.width+1);
    expect(box.top,box.label!).toBeGreaterThanOrEqual(-1);expect(box.bottom,box.label!).toBeLessThanOrEqual(data.height+1);
    expect(box.hit,box.label!).toBe(true);
  }
}

test("All 46 warehouse purchases change the registered room once and preserve exact attempts and both wallets", async ({ page }, info) => {
  test.setTimeout(360_000);
  for (const projectId of projects) for (const [step, task] of projectTasks(projectId).entries()) {
    await seed(page,fixture(projectId,step,true));
    await selectView(page,sceneTaskView(task.id));
    await expect(page.locator(`.world-scene [data-scene-task="${task.id}"]:not(.scene-planned)`)).toHaveCount(0);
    const before = await saved(page), oldPixels = await fingerprint(page);
    await page.locator('.world-main-action[data-action="buy-task"]').click();
    await finishScenePurchase(page);
    const after = await saved(page);
    expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks,task.id]);
    expect(after.campaign.completedTasks.filter(id=>id===task.id)).toHaveLength(1);
    expect(after[task.currency]).toBe(before[task.currency]-task.cost);
    const other = task.currency === "stars" ? "repairKits" : "stars";
    expect(after[other]).toBe(before[other]);
    for (const key of ["coins","inventory","completed","attempt","attempts","renovations","renovation"] as const) expect(after[key]).toEqual(before[key]);
    await expect(page.locator(".world-scene > .shop-composition")).toHaveAttribute("data-scene-view",sceneTaskView(task.id));
    expect(await fingerprint(page),task.id).not.toBe(oldPixels);
    if (!(projectId === "warehouse-1" && step<5) && !(projectId === "warehouse-2" && step===0))
      await expect(page.locator(`.world-scene [data-scene-task="${task.id}"]:not(.scene-planned)`)).not.toHaveCount(0);
    await geometry(page,task.id);
    await page.reload();
    expect(await saved(page)).toEqual(after);
    if ([0,6,7,8,11,13,20,projectTasks(projectId).length-1].includes(step)) await snapshot(page,info,`${projectId}-after-${step+1}`);
  }
});

for (const [width,height] of sizes) test(`Warehouse frames and controls fit ${width}×${height} through every milestone and map return`, async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This explicit emulated viewport matrix runs once.");
  test.setTimeout(300_000); await page.setViewportSize({width,height});
  for (const projectId of projects) for (let step=0;step<=projectTasks(projectId).length;step++) {
    await seed(page,fixture(projectId,step));
    const before=await saved(page);
    await geometry(page,`${projectId}/${step}/${width}×${height}`);
    expect(await saved(page)).toEqual(before);
    if ([0,7,8,9,14,projectTasks(projectId).length].includes(step)) await snapshot(page,info,`${projectId}-${step}-${width}x${height}`);
  }
  const p=fixture("warehouse-2",20);await seed(page,p);
  for (const view of builtViews) {
    await selectView(page,view);await geometry(page,view);
    expect(await saved(page)).toEqual(p);
    await snapshot(page,info,`warehouse-built-${view}-${width}x${height}`);
  }
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await expect(page.locator(".world.on-map")).toBeVisible();
  await mapGeometry(page);
  await enterMapBuilding(page,'shop');
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await page.locator('.world-pin[data-area="shop"]').click();
  await page.locator('.navigation-view-card[data-project="shop-1"]').first().click();
  await expect(page.locator(".world")).toHaveAttribute("data-project","shop-1");
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await enterMapBuilding(page,'warehouse');
  await expect(page.locator(".world")).toHaveAttribute("data-project","warehouse-2");
  await geometry(page,"return-from-approved-hall");
  expect(await saved(page)).toEqual(p);
});

test("Construction retains one whole-room projection across foundation, walls, roof and openings", async ({ page }, info) => {
  const boxes=[];
  expect(WAREHOUSE_FOOTPRINT.frame).toEqual([1536,1024]);
  for (const step of [6,7,8,9,10,14]) {
    await seed(page,fixture("warehouse-1",step));
    await selectView(page,"warehouse-yard");
    const frame=await geometry(page,`construction-${step}`);boxes.push(frame.frame);
    if(step>=7){
      const foundation=frame.plan.layers.find((layer:{id:string})=>layer.id==='warehouse-foundation');
      expect(foundation,`foundation remains at step${step}`).toBeDefined();
      const points=await page.evaluate(({path,vertices})=>{
        const ctx=document.createElement('canvas').getContext('2d')!,mask=new Path2D(path);
        return vertices.map(([x,y])=>ctx.isPointInPath(mask,x,y));
      },{path:foundation.path,vertices:WAREHOUSE_FOOTPRINT.exterior});
      expect(points,`foundation contact points at step${step}`).toEqual([true,true,true,true]);
    }
    if(step>=8){
      const walls=frame.plan.layers.find((layer:{id:string})=>layer.id==='warehouse-walls');
      expect(walls).toBeDefined();
      const points=await page.evaluate(({path,vertices})=>{
        const ctx=document.createElement('canvas').getContext('2d')!,mask=new Path2D(path);
        return vertices.map(([x,y])=>ctx.isPointInPath(mask,x,y));
      },{path:walls.path,vertices:WAREHOUSE_FOOTPRINT.exterior});
      expect(points,`wall contact points at step${step}`).toEqual([true,true,true,true]);
    }
    await snapshot(page,info,`registered-construction-${step}`);
    await page.locator('.world-scene-back[data-action="show-map"]').click();
    await mapGeometry(page);
    const map=page.locator('.coastal-map-art');
    await expect(map).toHaveAttribute('viewBox','0 0 1536 1024');
    await expect(map).toHaveAttribute('data-art-version',COASTAL_MAP_VERSION);
    const projection=await map.evaluate((svg,vertices)=>{
      const images=[...svg.querySelectorAll<SVGImageElement>('image')];
      const image=svg.querySelector<SVGImageElement>('[data-map-site="warehouse"] image');
      const clip=image?.getAttribute('clip-path')?.match(/url\(#(.+)\)/)?.[1];
      const path=clip?svg.querySelector(`clipPath[id="${clip}"] path`)?.getAttribute('d'):undefined;
      const ctx=document.createElement('canvas').getContext('2d')!;
      return {layers:images.map(node=>({width:node.getAttribute('width'),height:node.getAttribute('height'),
        transform:node.getAttribute('transform'),x:node.getAttribute('x'),y:node.getAttribute('y')})),
        contact:path?vertices.map(([x,y])=>ctx.isPointInPath(new Path2D(path),x,y)):[]};
    },[[1068,152],[1428,170],[1420,245],[1038,222]]);
    for(const layer of projection.layers) expect(layer).toEqual({width:'1536',height:'1024',transform:null,x:null,y:null});
    if(step>=7)expect(projection.contact).toEqual([true,true,true,true]);
    await snapshot(page,info,`registered-map-construction-${step}`);
  }
  for (const box of boxes.slice(1)) for (const key of ["left","top","width","height"] as const)
    expect(Math.abs(box[key]-boxes[0][key]),`whole-frame ${key}`).toBeLessThanOrEqual(1);
  // Mask contact points plus a common projection prevent the old disappearing/rescaled foundation.
  // Bitmap contour coincidence at these points is additionally inspected in the saved source-frame screenshots.
});

test("Interior gate remains closed until work 14, and opening it does not rewrite the pinned puzzle", async ({ page }) => {
  const p=fixture("warehouse-1",13,true,false);
  await seed(page,p);
  const number=CHAPTER.findIndex(order=>order.phaseId==="warehouse-1"&&order.localNumber===39)+1;
  await page.locator('.world-hud [data-action="levels"]').click();
  await expect(page.locator(`[data-level="${number}"]`)).toBeDisabled();
  await page.locator('.modal-levels [data-action="close"]').click();
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await finishScenePurchase(page);
  const built=await saved(page);
  expect(built.campaign.completedTasks).toEqual([...p.campaign.completedTasks,"warehouse-s1-t14"]);
  expect([built.repairKits,built.stars]).toEqual([0,0]);
  await page.locator('.world-hud [data-action="levels"]').click();
  await expect(page.locator(`[data-level="${number}"]`)).toBeEnabled();
  await page.locator(`[data-level="${number}"]`).click();
  await expect(page.locator("#order-heading")).toBeVisible();
  expect((await saved(page)).attempt!.definition).toEqual(offlineChapterLevel(number));
  const issued=clone((await saved(page)).attempt);
  await page.locator('.game-topbar [data-action="home"]').click();
  await page.reload();
  expect((await saved(page)).attempt).toEqual(issued);
});

test("The native Canvas2D fallback renders a nonempty warehouse without altering gameplay", async ({ page }, info) => {
  await page.addInitScript(() => {
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:any[]) {
      return /^(webgl2?|experimental-webgl)$/.test(kind)?null:Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  const p=fixture("warehouse-2",20);await seed(page,p);await selectView(page,"warehouse-cold");
  const data=await geometry(page,"canvas2d-fallback");expect(data.renderer).toBe("canvas2d");
  const opaque=await page.locator('.world-scene canvas').evaluate(canvas => {
    const element=canvas as HTMLCanvasElement, data=element.getContext("2d")!.getImageData(0,0,element.width,element.height).data;
    let count=0;for(let i=3;i<data.length;i+=4)if(data[i]>0)count++;return count;
  });
  expect(opaque).toBeGreaterThan(1536*1024*.9);
  expect(await saved(page)).toEqual(p);
  await snapshot(page,info,"warehouse-native-canvas2d");
});
