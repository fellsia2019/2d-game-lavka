import { finishScenePurchase } from './scene-purchase';
import { test, expect, type Page } from "@playwright/test";
import { chooseWorldView, expectWholeHallFrame, hallPixelFingerprint, enterMapBuilding } from "./hall-frame";
import { projectTasks } from "../../src/campaign";
import { CHAPTER } from "../../src/content";
import { offlineChapterLevel } from "../../src/content-offline";
import { initial } from "../../src/engine";
import { freshProgress, STORAGE_KEY, type Progress } from "../../src/storage";

const hallTasks = projectTasks("shop-1");
function hallProgress(step: number, fundNext = false): Progress {
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
  const story = orders[spent + credit];
  if (story) {
    const definition = offlineChapterLevel(CHAPTER.indexOf(story) + 1);
    progress.attempt = {
      id: "scene-reset-pinned", definition, board: initial(definition), undo: [],
      solution: definition.verifiedSolution, mixCount: 0, hints: {}, reward: null,
    };
    progress.attempts["shop-1"] = progress.attempt;
  }
  return progress;
}
const saved = (page: Page): Promise<Progress> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function seed(page: Page, progress: Progress) {
  await page.goto("/");
  await page.evaluate(({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)), { key: STORAGE_KEY, progress });
  await page.reload();
  await expect(page.locator(".world-scene .hall-composition")).toBeVisible();
}
test("Room views show the full native frame and preserve the pinned order", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await seed(page, hallProgress(5, true));
  const before = await saved(page);
  for (const view of ["hall", "hall-prep", "hall"]) {
    await chooseWorldView(page, view);
    await expect(page.locator(".world-scene .hall-composition")).toHaveAttribute("data-scene-view", view);
    await expectWholeHallFrame(page);
    expect(await saved(page)).toEqual(before);
  }
  expect(errors).toEqual([]);
});

test("Buying stock keeps a complete room frame and leaves the pinned order intact", async ({ page }) => {
  await seed(page, hallProgress(4, true));
  const before = await saved(page);
  await expectWholeHallFrame(page);
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await finishScenePurchase(page);
  await expectWholeHallFrame(page);
  const after = await saved(page);
  expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks, "shop-s1-r05"]);
  expect(after.stars).toBe(before.stars - hallTasks[4].cost);
  expect(after.coins).toBe(before.coins);
  expect(after.attempt).toEqual(before.attempt);
  expect(after.attempts).toEqual(before.attempts);
});

test("Show target selects the packing room and focuses an in-scene game control", async ({ page }) => {
  await seed(page, hallProgress(10, true));
  const before = await saved(page);
  await chooseWorldView(page, "hall");
  await page.locator('.world-main-action[data-action="show-target"]').click();
  await expect(page.locator(".world-scene .hall-composition")).toHaveAttribute("data-scene-view", "hall-prep");
  await expect(page.locator(".world-scene .hall-composition .world-target")).toBeFocused();
  await expectWholeHallFrame(page);
  expect(await saved(page)).toEqual(before);
});

test("Owned counter without a saved color previews and applies paint for free, preserving hidden preferences", async ({ page }) => {
  const progress = hallProgress(14);
  progress.renovations = { sign: "coral", window: "honey" };
  progress.renovation = "coral";
  await seed(page, progress);
  await page.locator('.world-scene-back[data-action="show-map"]').click();
  await enterMapBuilding(page,'shop');
  const before = await saved(page);
  await page.locator('[data-action="appearance"]').click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Прилавок", exact: true })).toHaveCount(1);
  await page.getByRole("radio", { name: "Коралловый закат", exact: true }).check();
  const preview = page.locator("#sign-preview");
  await expect(preview.locator(".hall-color-coral image[clip-path]")).toHaveCount(1);
  expect(await preview.locator("svg > image").evaluate(image => getComputedStyle(image).filter)).toBe("none");
  await expect(page.getByRole("button", { name: "Применить цвет", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  expect(await saved(page)).toEqual(before);
  await page.locator('[data-action="appearance"]').click();
  await page.getByRole("radio", { name: "Коралловый закат", exact: true }).check();
  await page.getByRole("button", { name: "Применить цвет", exact: true }).click();
  const after = await saved(page);
  expect(after.renovations).toEqual({ ...before.renovations, counter: "coral" });
  expect(after.renovation).toBe(before.renovation);
  expect(after.stars).toBe(before.stars);
  expect(after.coins).toBe(before.coins);
  expect(after.attempts).toEqual(before.attempts);
  expect(after.campaign).toEqual(before.campaign);
});

test("Ready orders change the installed rack while preserving its frame and pinned attempt", async ({ page }, info) => {
  await seed(page, hallProgress(12, true));
  const frame = await expectWholeHallFrame(page);
  const before = await saved(page);
  const pixels = await hallPixelFingerprint(page);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/hall-corner-game-rack-preview-${info.project.name}.png` });
  await page.locator('.world-main-action[data-action="buy-task"]').click();
  await finishScenePurchase(page);
  const afterFrame = await expectWholeHallFrame(page);
  expect(afterFrame.frame).toEqual(frame.frame);
  expect(await hallPixelFingerprint(page)).not.toBe(pixels);
  const after = await saved(page);
  expect(after.campaign.completedTasks).toEqual([...before.campaign.completedTasks, "shop-s1-r13"]);
  expect(after.stars).toBe(before.stars - hallTasks[12].cost);
  expect(after.coins).toBe(before.coins);
  expect(after.attempt).toEqual(before.attempt);
  expect(after.attempts).toEqual(before.attempts);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/hall-corner-game-rack-filled-${info.project.name}.png` });
});

test("Finished rooms supply complete desktop and mobile game frames", async ({ page }, info) => {
  await seed(page, hallProgress(14));
  for (const view of ["hall", "hall-prep"]) {
    await chooseWorldView(page, view);
    await expectWholeHallFrame(page);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `docs/screenshots/hall-corner-game-final-${view}-${info.project.name}.png` });
  }
});

test("Renovation checkpoints supply complete room frames in both views", async ({ page }, info) => {
  for (const step of [0, 3, 8, 13]) {
    await seed(page, hallProgress(step));
    const before = await saved(page);
    for (const view of ["hall", "hall-prep"]) {
      await chooseWorldView(page, view);
      await expectWholeHallFrame(page);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `docs/screenshots/hall-corner-game-checkpoint-${step}-${view}-${info.project.name}.png` });
      expect(await saved(page)).toEqual(before);
    }
  }
});

test("Whole room frames fit tablets and short screens without introducing viewing modes", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "mobile-360", "Explicit viewport matrix runs once.");
  for (const [width, height] of [[768, 1024], [1024, 768], [640, 360], [360, 400]]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height }, reducedMotion: "reduce",
      hasTouch: true, isMobile: width < 600 || height <= 500 });
    try {
      const page = await context.newPage();
      await seed(page, hallProgress(14));
      const before = await saved(page);
      for (const view of ["hall", "hall-prep"]) {
        await chooseWorldView(page, view);
        const frame = await expectWholeHallFrame(page);
        const geometry = await page.evaluate(() => {
          const action = document.querySelector(".world-main-action")!.getBoundingClientRect();
          const nav = document.querySelector(".world-progress")!.getBoundingClientRect();
          const rows = [...document.querySelectorAll('.world-dock > *')].filter(element =>
            getComputedStyle(element).clipPath === "none" && element.getBoundingClientRect().height > 1);
          const controls = [...document.querySelectorAll(".world button")].map(button => {
            const r = button.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { width: r.width, height: r.height, reachable: !!hit && button.contains(hit) };
          });
          return { actionGap: nav.top - action.bottom,
            bottomGap: innerHeight - Math.max(...rows.map(element => element.getBoundingClientRect().bottom)), controls };
        });
        const side = width >= 600 && height <= 500;
        expect(geometry.actionGap).toBeGreaterThanOrEqual(side ? 9 : 13);
        expect(geometry.bottomGap).toBeGreaterThanOrEqual(side ? 15 : 23);
        if (width === 360 && height === 400) expect(frame.frame.height).toBeGreaterThanOrEqual(140);
        for (const control of geometry.controls) {
          expect(control.width).toBeGreaterThanOrEqual(44);
          expect(control.height).toBeGreaterThanOrEqual(44);
          expect(control.reachable).toBe(true);
        }
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `docs/screenshots/hall-corner-game-final-${view}-${width}x${height}.png` });
        expect(await saved(page)).toEqual(before);
      }
    } finally { await context.close(); }
  }
});
