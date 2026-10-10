import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { CHAPTER, chapterNumber } from "../../src/content";
import { OFFLINE_CHAPTER_DEFINITIONS } from "../../src/content-offline";
import { PROJECTS, TASKS, projectById, orderCurrency } from "../../src/campaign";
import { orderSummary } from "../../src/order-supplies";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";

function progressForOrder(number: number): Progress {
  const story = CHAPTER[number - 1], project = projectById(story.phaseId)!;
  const p = freshProgress(); p.selectedProject = project.id;
  p.completed = CHAPTER.slice(0,number-1).map(o => o.id);
  const previous = PROJECTS.filter(candidate => candidate.id !== project.id && CHAPTER.filter(o => o.phaseId === candidate.id).every(o => p.completed.includes(o.id)));
  p.campaign.completedTasks = TASKS.filter(t => previous.some(project => project.id === t.phaseId)).map(t => t.id);
  if (project.construction && story.localNumber > project.construction.projectOrders)
    p.campaign.completedTasks.push(...project.construction.taskIds);
  if (p.campaign.completedTasks.includes("shop-s1-r14")) p.renovation = p.renovations.sign = "sea";
  if (p.campaign.completedTasks.includes("shop-s1-r09")) p.renovations.counter = "sea";
  p.coins = p.completed.length * 60;
  for (const currency of ["repairKits", "stars"] as const)
    p[currency] = p.completed.filter(id => orderCurrency(id) === currency).length - TASKS.filter(t => t.currency === currency && p.campaign.completedTasks.includes(t.id)).reduce((sum,t) => sum+t.cost,0);
  return p;
}
async function seed(page: Page, p: Progress) {
  await page.goto("/");
  await page.evaluate(({key,p}) => localStorage.setItem(key,JSON.stringify(p)),{key:STORAGE_KEY,p});
  await page.reload();
}

test("Initial interaction stays below five MB and does not fetch every project's Definitions", async ({page},info) => {
  const requests: Promise<{url:string;bytes:number}>[] = [];
  page.on("response", response => {
    if (response.url().startsWith("http://127.0.0.1:4190")) requests.push(response.body().then(body => ({url:response.url(),bytes:body.byteLength})));
  });
  await page.goto("/");
  await expect(page.locator(".world-target")).toBeVisible();
  await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); });
  const bodies = await Promise.all(requests);
  expect(bodies.reduce((sum,response) => sum+response.bytes,0)).toBeLessThanOrEqual(5_000_000);
  expect(bodies.filter(response => /(?:shop|warehouse|fruit-yard)-[12]-[^/]+\.json/.test(response.url))).toHaveLength(0);
  await writeFile(info.outputPath("initial-download.json"),JSON.stringify(bodies,null,2));
});

test("Every new recipe fits portrait and short landscape with four goods and expanded stock", async ({page},info) => {
  test.setTimeout(240_000);
  const representatives = new Map<string,number>();
  for (const definition of OFFLINE_CHAPTER_DEFINITIONS) if (definition.recipe && !representatives.has(definition.recipe)) representatives.set(definition.recipe,chapterNumber(definition.id)!);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [recipe,number] of representatives) {
    await seed(page,progressForOrder(number));
    await page.locator('[data-action="levels"]').click();
    await page.locator(`[data-level="${number}"]`).click();
    await expect(page.locator("#order-heading")).toHaveText(orderSummary(CHAPTER[number-1].id).title);
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())); });
    for (const [width,height] of [[360,640],[640,360]]) {
      await page.setViewportSize({width,height});
      const geometry = await page.evaluate(() => {
        const rect = (el:Element) => { const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
        return {bodyOverflow:document.documentElement.scrollWidth-innerWidth, appOverflow:document.querySelector("#app")!.scrollHeight-document.querySelector("#app")!.clientHeight,
          headings:[...document.querySelectorAll("#order-heading,.level-title > span")].map(rect), slots:[...document.querySelectorAll(".slot")].map(rect), controls:[...document.querySelectorAll(".tool,.utility-bar button")].map(rect),
          stock:[...document.querySelectorAll(".shelf-footer")].map(el => ({...rect(el),overflow:el.scrollWidth-el.clientWidth})),
          badImages:[...document.images].filter(image => !image.naturalWidth).map(image => image.src)};
      });
      expect(geometry.bodyOverflow,`${recipe} ${width} horizontal`).toBeLessThanOrEqual(1);
      expect(geometry.appOverflow,`${recipe} ${width} vertical`).toBeLessThanOrEqual(1);
      expect(geometry.badImages).toEqual([]);
      for (const slot of geometry.slots) { expect(slot.width).toBeGreaterThanOrEqual(44); expect(slot.height).toBeGreaterThanOrEqual(44); }
      for (const control of [...geometry.headings,...geometry.slots,...geometry.controls]) {
        expect(control.left).toBeGreaterThanOrEqual(-1); expect(control.right).toBeLessThanOrEqual(width+1);
        expect(control.top).toBeGreaterThanOrEqual(-1); expect(control.bottom).toBeLessThanOrEqual(height+1);
      }
      for (const stock of geometry.stock) expect(stock.overflow,`${recipe} stock`).toBeLessThanOrEqual(1);
    }
    if (recipe === "mixed-triple-crate") await page.screenshot({path:info.outputPath("three-supplies.png")});
  }
  expect(representatives.size).toBe(34);
  expect(errors).toEqual([]);
});
