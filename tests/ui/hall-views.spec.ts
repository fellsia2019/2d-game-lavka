import { finishScenePurchase } from './scene-purchase';
import { test, expect, type Page } from "@playwright/test";
import { chooseWorldView, expectWholeHallFrame, settleHallFrame, enterMapBuilding } from "./hall-frame";
import { CHAPTER } from "../../src/content";
import { offlineChapterLevel } from "../../src/content-offline";
import { projectTasks } from "../../src/campaign";
import { initial } from "../../src/engine";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";

const hallTasks = projectTasks("shop-1");
const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
function hallProgress(step: number, fundNext = false, pinAttempt = false) {
  const progress = freshProgress();
  progress.settings.reducedMotion = true;
  progress.settings.sound = false;
  const owned = hallTasks.slice(0, step);
  const spent = owned.reduce((sum, task) => sum + task.cost, 0);
  const credit = fundNext ? hallTasks[step]?.cost ?? 0 : 0;
  const orders = CHAPTER.filter(order => order.phaseId === "shop-1");
  progress.campaign.completedTasks = owned.map(task => task.id);
  progress.completed = orders.slice(0, spent + credit).map(order => order.id);
  progress.stars = credit;
  progress.coins = progress.completed.length * 60;
  if (step >= 9) progress.renovations.counter = "honey";
  if (step >= 14) progress.renovation = progress.renovations.sign = "coral";
  if (pinAttempt) {
    const story = orders[spent + credit];
    const definition = offlineChapterLevel(CHAPTER.indexOf(story) + 1);
    progress.attempt = { id: "hall-view-pinned-attempt", definition, board: initial(definition),
      undo: [], solution: definition.verifiedSolution, mixCount: 0, hints: {}, reward: null };
    progress.attempts["shop-1"] = progress.attempt;
  }
  return progress;
}
async function seed(page: Page, progress: Progress) {
  await page.goto("/");
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload();
  await expect(page.locator(".world-main-action")).toBeVisible();
}
async function settleImages(page: Page) {
  await settleHallFrame(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
}
async function selectHallView(page: Page, view: "hall" | "hall-prep") {
  await chooseWorldView(page, view);
}

test("Two direct room views preserve the pinned attempt, colors and unique purchases", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await seed(page, hallProgress(10, true, true));
  await expect(page.locator(".world-scene .shop-composition")).toHaveAttribute("data-scene-view", "hall-prep");
  const before = await saved(page);
  for (const view of ["hall", "hall-prep", "hall"] as const) await selectHallView(page, view);
  expect(await saved(page)).toEqual(before);
  await expect(page.locator(".world-room-switch")).toHaveCount(0);
  await expect(page.locator(".world-dock .world-hall-view")).toHaveCount(0);
  await page.locator('.world-main-action[data-action="show-target"]').click();
  await expect(page.locator(".world-scene .shop-composition")).toHaveAttribute("data-scene-view", "hall-prep");
  await expect(page.locator(".world-target")).toBeFocused();
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await finishScenePurchase(page);
  await expect(page.locator(".world-scene .shop-composition")).toHaveAttribute("data-scene-view", "hall-prep");
  const bought = await saved(page);
  expect(bought.campaign.completedTasks).toEqual([...before.campaign.completedTasks, hallTasks[10].id]);
  expect(bought.stars).toBe(before.stars - hallTasks[10].cost);
  expect(bought.coins).toBe(before.coins);
  expect(bought.attempt).toEqual(before.attempt);
  expect(bought.renovations).toEqual(before.renovations);
  for (const view of ["hall", "hall-prep", "hall"] as const) await selectHallView(page, view);
  expect(await saved(page)).toEqual(bought);
  await settleImages(page);
  await page.screenshot({ path: info.outputPath("two-views-shared-progress.png") });
  expect(errors).toEqual([]);
});

test("Whole room views and game controls fit tablet and short portrait/landscape windows", async ({ browser, baseURL }, info) => {
  // The normal desktop/mobile projects cover the first test; these contexts add orientations.
  test.skip(info.project.name === "mobile-360", "Explicit tablet and landscape contexts run once.");
  for (const [width, height] of [[768, 1024], [1024, 768], [640, 360], [360, 400]]) {
    for (const step of [0, 10, 14]) {
      const context = await browser.newContext({ baseURL, viewport: { width, height }, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await seed(page, hallProgress(step));
        for (const view of ["hall", "hall-prep"] as const) {
          await selectHallView(page, view);
          await settleImages(page);
          await expectWholeHallFrame(page);
          const geometry = await page.evaluate(() => {
            const rect = (element: Element) => {
              const r = element.getBoundingClientRect();
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            const action = document.querySelector(".world-main-action")!.getBoundingClientRect();
            const nav = document.querySelector(".world-progress")!.getBoundingClientRect();
            const visibleDockRows = [...document.querySelectorAll(".world-dock > *")].filter(element =>
              getComputedStyle(element).clipPath === "none" && element.getBoundingClientRect().height > 1);
            return { width: innerWidth, height: innerHeight, overflowX: document.documentElement.scrollWidth - innerWidth,
              overflowY: document.documentElement.scrollHeight - innerHeight, actionGap: nav.top - action.bottom,
              bottomGap: innerHeight - Math.max(...visibleDockRows.map(element => element.getBoundingClientRect().bottom)),
              scene: rect(document.querySelector(".world-scene .shop-composition")!),
              artStage: rect(document.querySelector(".world-scene .hall-world-stage")!),
              controls: [...document.querySelectorAll(".world-main-action,.world-globe,.world-scene-back,.world-room-appearance,.world-target,.world-edit")].map(element => {
                const r = element.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return { ...rect(element), name: element.getAttribute("aria-label") ?? element.textContent,
                  reachable: !!hit && element.contains(hit) };
              }),
            };
          });
          expect(geometry.overflowX).toBeLessThanOrEqual(1);
          expect(geometry.overflowY).toBeLessThanOrEqual(1);
          expect(geometry.actionGap).toBeGreaterThanOrEqual(height <= 500 && width >= 600 ? 9 : 13);
          expect(geometry.bottomGap).toBeGreaterThanOrEqual(height <= 500 && width >= 600 ? 15 : 23);
          expect(geometry.artStage.width / geometry.artStage.height).toBeCloseTo(1.5, 2);
          for (const control of geometry.controls) {
            expect(control.width, control.name ?? "control").toBeGreaterThanOrEqual(43);
            expect(control.height).toBeGreaterThanOrEqual(43);
            expect(control.left).toBeGreaterThanOrEqual(-1);
            expect(control.right).toBeLessThanOrEqual(width + 1);
            expect(control.top).toBeGreaterThanOrEqual(-1);
            expect(control.bottom).toBeLessThanOrEqual(height + 1);
            expect(control.reachable).toBe(true);
          }
          if (step === 14) await page.screenshot({ path: info.outputPath(`hall-${view}-${width}x${height}.png`) });
        }
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    }
  }
});

for (const [width, height] of [[360, 400], [640, 360], [1280, 900], [1870, 1324]]) {
 test(`All hall goals stay clear of HUD and saved-color palettes at ${width}×${height}`, async ({ browser, baseURL }, info) => {
  // Each viewport checks fifteen saved states and thirty full canvas frames.
  test.setTimeout(300_000);
  test.skip(info.project.name === "mobile-360", "Explicit viewport matrix runs once.");
    const context = await browser.newContext({ baseURL, viewport: { width, height }, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      for (let step = 0; step <= hallTasks.length; step++) {
        const progress = hallProgress(step);
        // Older saves also retain the optional recolorable window flowers.
        if (step >= 5) progress.renovations.window = "sea";
        await seed(page, progress);
        await page.locator('.world-scene-back[data-action="show-map"]').click();
        await enterMapBuilding(page,'shop');
        for (const view of ["hall", "hall-prep"] as const) {
          await selectHallView(page, view);
          await expectWholeHallFrame(page);
          const geometry = await page.evaluate(() => {
            const controls = [...document.querySelectorAll(".world button")].map(button => {
              const r = button.getBoundingClientRect();
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return { name: button.getAttribute("aria-label") ?? button.textContent,
                left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
                reachable: !!hit && button.contains(hit) };
            });
            const overlaps = controls.flatMap((a, index) => controls.slice(index + 1)
              .filter(b => !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1))
              .map(b => [a.name, b.name]));
            const price = document.querySelector(".world-target .target-price")?.getBoundingClientRect();
            const dock = document.querySelector(".world-dock")!.getBoundingClientRect();
            return { controls, overlaps, priceBottom: price?.bottom, dockTop: dock.top,
              dockLeft: dock.left, priceRight: price?.right };
          });
          const state = `${width}×${height} step ${step} ${view}`;
          expect(geometry.overlaps, state).toEqual([]);
          for (const control of geometry.controls) {
            expect(control.width, `${state}: ${control.name}`).toBeGreaterThanOrEqual(43);
            expect(control.height, `${state}: ${control.name}`).toBeGreaterThanOrEqual(43);
            expect(control.reachable, `${state}: ${control.name}`).toBe(true);
          }
          if (geometry.priceBottom !== undefined) {
            if (width < 600 || height > 500) expect(geometry.priceBottom, `${state}: goal price`).toBeLessThanOrEqual(geometry.dockTop + 1);
            else expect(geometry.priceRight, `${state}: goal price`).toBeLessThanOrEqual(geometry.dockLeft + 1);
          }
          if ((step === 9 && view === "hall") || (step === 13 && view === "hall-prep")) {
            await settleImages(page);
            await page.screenshot({ path: info.outputPath(`shop-${step}-${view}-${width}x${height}.png`) });
          }
        }
      }
    } finally { await context.close(); }
 });
}
