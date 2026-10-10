import { test, expect } from "@playwright/test";
import { chooseWorldView, expectWholeHallFrame, enterMapBuilding } from "./hall-frame";
import { CHAPTER } from "../../src/content";
import { SHOP_STEPS, TASKS } from "../../src/campaign";
import { freshProgress, STORAGE_KEY } from "../../src/storage";

// Chromium viewport emulation; browser contexts never share player storage.
const viewports = [
  [1280, 900], [1870, 1324],
  [768, 1024], [1024, 768], [820, 1180], [1180, 820],
  [360, 640], [390, 844], [430, 932],
  [640, 360], [844, 390], [932, 430], [360, 400],
] as const;
const states = ["stage7", "stage11", "map", "finish"] as const;

for (const [width, height] of viewports) {
  test(`Hall stays aligned and dock gives the play button clear space at ${width}×${height}`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name === "mobile-360", "Explicit viewport matrix runs once.");
    for (const state of states) {
      const progress = freshProgress();
      const stage = state === "stage7" ? 7 : 11;
      const owned = SHOP_STEPS.slice(0, stage);
      const wins = owned.reduce((sum, step) => sum + step.cost, 0);
      progress.settings.reducedMotion = true;
      progress.campaign.completedTasks = owned.map(step => step.id);
      progress.completed = CHAPTER.slice(0, wins).map(order => order.id);
      progress.coins = wins * 60;
      progress.renovations = { sign: "sea", counter: "sea" };
      progress.renovation = "sea";
      if (state === "finish") {
        progress.campaign.completedTasks = TASKS.map(task => task.id);
        progress.completed = CHAPTER.map(order => order.id);
        progress.coins = 36000;
      }
      const context = await browser.newContext({
        baseURL, viewport: { width, height }, reducedMotion: "reduce",
        hasTouch: width < 1200, isMobile: width < 600 || height < 500,
      });
      try {
        await context.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
          { key: STORAGE_KEY, data: progress });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => {
          if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        await page.goto("/");
        await expect(page.locator(".world-main-action")).toBeVisible();
        if (state === "map") await page.locator('.world-scene-back[data-action="show-map"]').click();
        if (state === "stage7" || state === "stage11") {
          await page.locator('.world-scene-back[data-action="show-map"]').click();
          await enterMapBuilding(page,'shop');
          await chooseWorldView(page, "hall");
          await expect(page.locator('.world-scene [data-scene-view="hall"]')).toBeVisible();
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
        });
        await expect(page.locator(".world-room-selector")).toHaveCount(0);
        if (state === "stage7" || state === "stage11") {
          for (const angle of ["hall", "hall-prep"]) {
            await chooseWorldView(page, angle);
            await expect(page.locator(`.world-scene [data-scene-view="${angle}"]`)).toBeVisible();
            await expect(page.locator('.world-scene .hall-composition')).toHaveClass(new RegExp(`hall-angle-${angle === "hall" ? 1 : 2}`));
            await page.evaluate(async () => {
              await Promise.all([...document.images].map(image => image.decode()));
            });
            await expectWholeHallFrame(page);
            expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(JSON.stringify(progress));
            await page.screenshot({ path: `artifacts/spacing-${width}x${height}-${state}-${angle}-${info.project.name}.png`, fullPage: true });
          }
          await expect(page.locator('.world-room-switch')).toHaveCount(0);
        }
        const layout = await page.evaluate(() => {
          const rect = (element: Element) => {
            const box = element.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
          };
          const dock = document.querySelector(".world-dock")!;
          const action = dock.querySelector(".world-main-action")!;
          const actionBox = rect(action);
          // The global appearance palette floats outside the panel's content tracks.
          const rows = [...dock.children].filter(element => !element.classList.contains('world-appearance') &&
            getComputedStyle(element).clipPath === "none" && element.getBoundingClientRect().height > 1);
          const followers = rows.map(rect).filter(box => box.top >= actionBox.bottom - 1);
          return {
            dock: rect(dock), action: actionBox,
            nextGap: Math.min(...followers.map(box => box.top)) - actionBox.bottom,
            bottomGap: innerHeight - Math.max(...rows.map(element => rect(element).bottom)),
            controls: [...dock.querySelectorAll(".world-main-action, .world-view-selector button")].map(button => ({
              ...rect(button),
              labels: [...button.querySelectorAll('.room-switch-label,.hall-view-number,.hall-view-label')]
                .map(rect).filter(label => label.width > 0 && label.height > 0),
            })),
            side: getComputedStyle(dock).display === "flex",
            overflowX: document.documentElement.scrollWidth - innerWidth,
            overflowY: document.documentElement.scrollHeight - innerHeight,
          };
        });
        const resetSideDock = (state === 'stage7' || state === 'stage11') && width >= 600 && height <= 500;
        expect(layout.nextGap, `${state}: action must not crowd the camera/progress`).toBeGreaterThanOrEqual(resetSideDock ? 9 : 13);
        expect(layout.bottomGap, `${state}: dock content needs a clear screen-edge gap`).toBeGreaterThanOrEqual(resetSideDock ? 15 : 23);
        expect(layout.overflowX).toBeLessThanOrEqual(1);
        expect(layout.overflowY).toBeLessThanOrEqual(1);
        expect(layout.side).toBe(width >= 600 && height <= 500);
        for (const control of layout.controls) {
          expect(control.width).toBeGreaterThanOrEqual(44 - 1);
          expect(control.height).toBeGreaterThanOrEqual(44 - 1);
          expect(control.left).toBeGreaterThanOrEqual(layout.dock.left - 1);
          expect(control.right).toBeLessThanOrEqual(layout.dock.right + 1);
          expect(control.bottom).toBeLessThanOrEqual(height - (resetSideDock ? 14 : 20));
          for (const label of control.labels) {
            expect(label.left).toBeGreaterThanOrEqual(control.left);
            expect(label.right).toBeLessThanOrEqual(control.right);
            expect(label.top).toBeGreaterThanOrEqual(control.top);
            expect(label.bottom).toBeLessThanOrEqual(control.bottom);
          }
        }
        expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(JSON.stringify(progress));
        expect(errors).toEqual([]);
        await page.screenshot({ path: `artifacts/spacing-${width}x${height}-${state}-${info.project.name}.png`, fullPage: true });
      } finally {
        await context.close();
      }
    }
  });
}
