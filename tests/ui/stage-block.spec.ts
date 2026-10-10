import {enterMapBuilding} from './hall-frame';
import { finishScenePurchase } from './scene-purchase';
import { test, expect, type Page } from "@playwright/test";
import { CHAPTER } from "../../src/content";
import { offlineChapterLevel } from "../../src/content-offline";
import { PROJECTS, TASKS, projectTasks, projectOrders, taskBalance, orderCurrency, type ProjectId } from "../../src/campaign";
import { orderSummary } from "../../src/order-supplies";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";
import { clone, initial, applyMove } from "../../src/engine";

const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = []; failures.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
  page.on("response", response => { if (response.status() >= 400) messages.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });
async function seed(page: Page, data: Progress) {
  await page.goto("/");
  await page.evaluate(({key, data}) => localStorage.setItem(key, JSON.stringify(data)), {key: STORAGE_KEY, data});
  await page.reload();
}
function firstStageComplete() {
  const p = freshProgress();
  p.completed = CHAPTER.filter(o => ["shop-1", "warehouse-1"].includes(o.phaseId)).map(o => o.id);
  p.campaign.completedTasks = TASKS.filter(t => ["shop-1", "warehouse-1"].includes(t.phaseId)).map(t => t.id);
  p.renovations = { sign: "coral", counter: "honey" }; p.renovation = "coral";
  p.coins = p.completed.length * 60; return p;
}
async function chooseProject(page: Page, id: ProjectId) {
  const project = PROJECTS.find(p => p.id === id)!;
  if (!await page.locator(".world.on-map").count()) await page.locator('[data-action="show-map"]').first().click();
  await enterMapBuilding(page,project.areaId);
  if(await page.locator('.world').getAttribute('data-project')!==id){
    await page.locator('[data-action="show-map"]').first().click();
    await page.locator(`.world-pin[data-area="${project.areaId}"]`).click();
    await page.locator(`.modal-navigation .navigation-view-card[data-project="${id}"]`).first().click();
  }
  await expect(page.locator(".world")).toHaveAttribute("data-project", id);
}
async function playPinnedOrder(page: Page, number: number) {
  const def = offlineChapterLevel(number);
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[number - 1].id).title);
  // Actual DOM click handlers perform all legal transfers, saving after every
  // move. Pointer/keyboard input and animation geometry have separate tests.
  await page.evaluate(path => {
    for (const [index, [from, to]] of path.entries()) {
      const source = document.querySelector<HTMLButtonElement>(`[data-slot="${from.join(",")}"]`);
      const target = () => document.querySelector<HTMLButtonElement>(`[data-slot="${to.join(",")}"]`);
      if (!source || source.disabled) throw new Error(`Missing source at move ${index + 1}`);
      source.click();
      if (!target() || target()!.disabled) throw new Error(`Missing target at move ${index + 1}`);
      target()!.click();
    }
  }, def.verifiedSolution);
  await expect(page.locator(".modal-result")).toBeVisible();
  const p = await saved(page);
  expect(p.attempt!.board.used).toBe(def.verifiedSolution.length);
  expect(p.attempt!.reward).toEqual({coins: 60, stars: orderCurrency(def.id) === "stars" ? 1 : 0, repairKits: orderCurrency(def.id) === "repairKits" ? 1 : 0, fresh: true});
}

test("The full 600-order block plays through construction, independent branches, all purchases and reload", async ({ page }, info) => {
  test.setTimeout(900_000);
  await page.goto("/");
  let count = 0, repairRewards = 0, starRewards = 0;
  // Fruit first in Stage 2 proves that neither shop II nor warehouse II is an
  // obligatory first branch. Its extension starts before those sibling phases.
  const route: ProjectId[] = ["shop-1", "warehouse-1", "fruit-yard-1", "fruit-yard-2", "warehouse-2", "shop-2"];
  for (const id of route) {
    if (id !== "shop-1") await chooseProject(page, id);
    const tasks = projectTasks(id), project = PROJECTS.find(p => p.id === id)!;
    let taskIndex = 0;
    await page.locator('.world-main-action[data-action="play"]').click();
    for (const story of projectOrders(id)) {
      const number = CHAPTER.indexOf(story) + 1;
      await playPinnedOrder(page, number);
      const p = await saved(page);
      expect(p.completed).toHaveLength(++count);
      expect(p.coins).toBe(count * 60);
      repairRewards += p.attempt!.reward!.repairKits;
      starRewards += p.attempt!.reward!.stars;
      const task = tasks[taskIndex];
      if (task && taskBalance(p, task) >= task.cost) {
        await page.locator('.modal-result [data-action="buy-task"]').click();
        await finishScenePurchase(page);
        taskIndex++;
        const purchased = await saved(page);
        expect(purchased.campaign.completedTasks).toEqual([...p.campaign.completedTasks, task.id]);
        expect(purchased.campaign.completedTasks.filter(id => id === task.id)).toHaveLength(1);
        expect(purchased[task.currency]).toBe(p[task.currency] - task.cost);
        const otherCurrency = task.currency === "stars" ? "repairKits" : "stars";
        expect(purchased[otherCurrency]).toBe(p[otherCurrency]);
        expect(purchased.coins).toBe(p.coins);
        expect(purchased.inventory).toEqual(p.inventory);
        expect(purchased.attempt).toEqual(p.attempt);
        // After a view-changing purchase, the next click deliberately directs
        // the camera to the new goal before starting its order.
        if (story.localNumber < project.orderTarget) {
          if (await page.locator('.world-main-action[data-action="show-target"]').count())
            await page.locator('.world-main-action[data-action="show-target"]').click();
          await page.locator('.world-main-action[data-action="play"]').click();
        }
      } else if (story.localNumber < project.orderTarget) await page.locator('.modal-result [data-action="next"]').click();
      else await page.locator('.modal-result [data-action="home"]').click();
    }
    expect(taskIndex).toBe(tasks.length);
    expect((await saved(page)).stars).toBe(0);
    expect((await saved(page)).repairKits).toBe(0);
    await page.reload();
    const heading = page.getByRole("heading", {name: id === "shop-2" ? "Торговый двор ожил!" : "Этап выполнен!", exact:true});
    if (id === "shop-1") {
      await expect(heading).toHaveCount(1);
      await expect(page.locator(".world-mission")).toContainText("Склад");
    } else await expect(heading).toBeVisible();
    if (id === "shop-2") await expect(page.locator(".world-block-finale")).toContainText("600 заказов · 126 работ");
    else {
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(tasks.length));
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", String(tasks.length));
    }
    await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode())); });
    await page.screenshot({path: info.outputPath(`${id}-complete.png`)});
  }
  const final = await saved(page);
  expect(final.completed).toHaveLength(600);
  expect(final.campaign.completedTasks).toHaveLength(126);
  expect(final.coins).toBe(36000);
  expect(final.stars).toBe(0);
  expect(final.repairKits).toBe(0);
  expect(repairRewards).toBe(179);
  expect(starRewards).toBe(421);
  expect(final.renovations).toEqual({sign: "sea", counter: "sea"});
  await expect(page.locator(".world")).toHaveAttribute("data-global-stage", "3");
  await page.screenshot({path: `docs/screenshots/stage-2-finale-${info.project.name}.png`});
});

test("Switching projects and reloading preserves each exact attempt, undo, paid hint and cosmetics", async ({ page }) => {
  const initialSave = firstStageComplete(); initialSave.inventory.hint = 3;
  await seed(page, initialSave);
  for (const id of ["fruit-yard-1", "warehouse-2", "shop-2"] as ProjectId[]) {
    await chooseProject(page, id);
    await page.locator('.world-main-action[data-action="play"]').click();
    await expect(page.locator("#order-heading")).toBeVisible();
    const before = (await saved(page)).attempt!;
    const move = before.definition.verifiedSolution[0];
    await page.locator(`[data-slot="${move[0].join(",")}"]`).click();
    await page.locator(`[data-slot="${move[1].join(",")}"]`).click();
    await page.locator('[data-action="hint"]').click();
    await expect(page.locator(".gentle-source")).toBeVisible();
    const pinned = clone((await saved(page)).attempt!);
    await page.locator('[data-action="home"]').click();
    await page.reload();
    expect((await saved(page)).attempt).toEqual(pinned);
  }
  const stored = await saved(page);
  expect(Object.keys(stored.attempts).sort()).toEqual(["fruit-yard-1", "shop-2", "warehouse-2"]);
  expect(stored.renovations).toEqual({sign:"coral",counter:"honey"});
  for (const id of ["warehouse-2", "fruit-yard-1", "shop-2"] as ProjectId[]) {
    await chooseProject(page,id);
    expect((await saved(page)).attempt).toEqual(stored.attempts[id]);
    await page.locator('.world-main-action[data-action="play"]').click();
    await expect(page.locator(".gentle-source")).toHaveCount(0);
    await page.locator('[data-action="undo"]').click();
    expect((await saved(page)).attempt!.board.used).toBe(0);
    await page.locator('[data-action="home"]').click();
  }
});

test("The interior gate offers funded construction purchases before the first internal order", async ({ page }, info) => {
  const p = firstStageComplete();
  p.selectedProject = "fruit-yard-1";
  p.completed.push(...projectOrders("fruit-yard-1").slice(0,38).map(o => o.id));
  p.coins += 38 * 60; p.repairKits = 32; p.stars = 6;
  await seed(page,p);
  await page.locator('[data-action="levels"]').click();
  const firstInterior = CHAPTER.findIndex(o => o.phaseId === "fruit-yard-1" && o.localNumber === 39) + 1;
  await expect(page.locator(`[data-level="${firstInterior}"]`)).toBeDisabled();
  await page.getByRole("button",{name:"Закрыть",exact:true}).click();
  for (const task of projectTasks("fruit-yard-1").slice(0,14)) {
    if (await page.locator('.world-main-action[data-action="show-target"]').count()) await page.locator('.world-main-action[data-action="show-target"]').click();
    await page.locator('.world-main-action[data-action="buy-task"]').click();
    await finishScenePurchase(page);
    expect((await saved(page)).campaign.completedTasks).toContain(task.id);
    await page.reload();
  }
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(0);
  await page.locator('[data-action="levels"]').click();
  await expect(page.locator(`[data-level="${firstInterior}"]`)).toBeEnabled();
  await page.locator(`[data-level="${firstInterior}"]`).click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[firstInterior - 1].id).title);
  await page.screenshot({path:info.outputPath("fruit-first-interior.png")});
});


test("Legacy cross-funded construction credit leads to other projects when the remaining interior is gated", async ({page}) => {
  const p = firstStageComplete();
  p.selectedProject = "fruit-yard-1";
  p.completed.push(...projectOrders("fruit-yard-1").slice(0,38).map(o => o.id), ...projectOrders("shop-2").slice(0,3).map(o => o.id));
  p.campaign.completedTasks.push(...projectTasks("fruit-yard-1").slice(0,13).map(t => t.id), projectTasks("shop-2")[0].id);
  p.coins += 41 * 60;
  // This valid old shared-wallet route spent all 41 units across branches.
  // Schema 8 preserves the owned repair despite its historic cross-funding.
  const legacy: any = p; legacy.schema = 7; legacy.campaign.version = "coastal-campaign-5"; delete legacy.repairKits;
  await seed(page,legacy);
  await expect(page.locator('.world-main-action[data-action="show-map"]')).toHaveText(/Карта двора/);
  await page.locator('.world-main-action[data-action="show-map"]').click();
  await expect(page.locator('.world-pin[data-area="warehouse"]')).toHaveClass(/open/);
  await enterMapBuilding(page,'warehouse');
  await expect(page.locator('.world')).toHaveAttribute('data-project','warehouse-2');
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(projectOrders("warehouse-2")[0].id).title);
});

test("Earlier local phases remain inspectable and replayable while their successor is available", async ({page}) => {
  const p = firstStageComplete(); p.selectedProject = "warehouse-2";
  await seed(page,p);
  await page.locator('[data-action="show-map"]').click();
  await page.locator('.world-pin[data-area="warehouse"]').click();
  await expect(page.locator('.navigation-view-card[data-project="warehouse-1"]')).not.toHaveCount(0);
  await page.locator('.navigation-view-card[data-project="warehouse-1"]').first().click();
  await expect(page.locator(".world")).toHaveAttribute("data-project", "warehouse-1");
  await page.locator('[data-action="levels"]').click();
  const number = CHAPTER.findIndex(o => o.phaseId === "warehouse-1") + 1;
  await page.locator(`[data-level="${number}"]`).click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[number-1].id).title);
  expect((await saved(page)).selectedProject).toBe("warehouse-1");
  expect((await saved(page)).completed).toHaveLength(160);
  const firstMove = offlineChapterLevel(number).verifiedSolution[0];
  await page.locator(`[data-slot="${firstMove[0].join(",")}"]`).click();
  await page.locator(`[data-slot="${firstMove[1].join(",")}"]`).click();
  const attempt = (await saved(page)).attempt!;
  await page.locator('[data-action="home"]').click();
  await page.reload();
  await expect(page.locator('.world-main-action[data-action="play"]')).toContainText("Продолжить");
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[number-1].id).title);
  expect((await saved(page)).attempt).toEqual(attempt);
});


test("A migrated won attempt without reward restores its exact board and pays once", async ({page}) => {
  const p = freshProgress(); p.completed = CHAPTER.slice(0,3).map(o => o.id); p.coins = 180; p.stars = 3;
  const definition = offlineChapterLevel(4); let board = initial(definition);
  for (const move of definition.verifiedSolution) board = applyMove(board,...move)!;
  p.attempt = {id:"won-recovery",definition,board,undo:[],solution:[],hints:{},mixCount:0,reward:null};
  const legacy:any = p; legacy.schema = 5; legacy.campaign.version = "coastal-campaign-3";
  await seed(page,legacy);
  await expect(page.locator('.world-main-action[data-action="play"]')).toContainText("Получить награду");
  expect((await saved(page)).attempt!.board).toEqual(board);
  await page.locator('.world-main-action[data-action="play"]').click();
  await expect(page.locator(".modal-result")).toBeVisible();
  expect((await saved(page)).coins).toBe(240);
  expect((await saved(page)).stars).toBe(0);
  expect((await saved(page)).repairKits).toBe(4);
  expect((await saved(page)).attempt!.reward).toEqual({ coins: 60, stars: 0, repairKits: 1, fresh: true });
  expect((await saved(page)).attempt!.definition).toEqual(definition);
  await page.reload();
  expect((await saved(page)).coins).toBe(240);
  expect((await saved(page)).completed).toHaveLength(4);
  expect((await saved(page)).repairKits).toBe(4);
});

test("All 126 campaign milestones keep the goal, camera and controls within desktop and phone viewports", async ({page}) => {
  test.setTimeout(180_000);
  for (const [projectIndex,project] of PROJECTS.entries()) {
    const previous = PROJECTS.slice(0,projectIndex);
    const tasks = projectTasks(project.id);
    for (let step=0;step<=tasks.length;step++) {
      const p = freshProgress(); p.selectedProject = project.id;
      const spent = tasks.slice(0,step).reduce((sum,task)=>sum+task.cost,0);
      p.completed = CHAPTER.filter(order => previous.some(project=>project.id===order.phaseId)).map(order=>order.id);
      p.completed.push(...projectOrders(project.id).slice(0,spent).map(order=>order.id));
      p.campaign.completedTasks = TASKS.filter(task => previous.some(project=>project.id===task.phaseId)).map(task=>task.id);
      p.campaign.completedTasks.push(...tasks.slice(0,step).map(task=>task.id));
      if (p.campaign.completedTasks.includes("shop-s1-r14")) p.renovation = p.renovations.sign = "sea";
      if (p.campaign.completedTasks.includes("shop-s1-r09")) p.renovations.counter = "sea";
      p.coins = p.completed.length*60;
      await seed(page,p);
      const next = tasks[step];
      if (next) {
        await expect(page.locator(".world-target")).toHaveCount(1);
        await expect(page.locator(".world-target")).toHaveAttribute("aria-label", `Играть для цели: ${next.name}`);
        await expect(page.locator(".target-price")).toHaveText(String(next.cost));
        await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(step));
        await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", String(tasks.length));
      } else await expect(page.locator(".world-target")).toHaveCount(0);
      for (const [width,height] of [[1280,900],[360,640],[640,360]]) {
        await page.setViewportSize({width,height});
        // Wait for ResizeObserver to apply the complete frame's uniform fit.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const geometry = await page.evaluate(()=>{
          const rect=(el:Element)=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
          return {scroll:document.querySelector("#app")!.scrollHeight-document.querySelector("#app")!.clientHeight,
            controls:[...document.querySelectorAll(".world button,.world select")].map(rect),scene:rect(document.querySelector(".world-scene")!),
            camera:(()=>{ const stage=document.querySelector<HTMLElement>(".hall-world-stage"); if(!stage)return null; const m=new DOMMatrix(getComputedStyle(stage).transform); return{width:stage.clientWidth,height:stage.clientHeight,a:m.a,b:m.b,c:m.c,d:m.d}; })()};
        });
        expect(geometry.scroll,`${project.id}:${step}:${width}`).toBeLessThanOrEqual(1);
        if(geometry.camera){
          expect(geometry.camera.width).toBe(1536);expect(geometry.camera.height).toBe(1024);
          expect(geometry.camera.a).toBeGreaterThan(0);expect(geometry.camera.a).toBeCloseTo(geometry.camera.d,5);
          expect(geometry.camera.b).toBe(0);expect(geometry.camera.c).toBe(0);
        }else expect(geometry.scene.width/geometry.scene.height).toBeCloseTo(1.5,2);
        for(const control of geometry.controls){
          expect(control.width,`${project.id}:${step}:${width}`).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
          expect(control.left).toBeGreaterThanOrEqual(-1);expect(control.right).toBeLessThanOrEqual(width+1);
          expect(control.top).toBeGreaterThanOrEqual(-1);expect(control.bottom).toBeLessThanOrEqual(height+1);
        }
        for(const [index,a] of geometry.controls.entries())for(const b of geometry.controls.slice(index+1))
          expect(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,`${project.id}:${step}:${width}:overlap`).toBe(true);
      }
    }
  }
});
