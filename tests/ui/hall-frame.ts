import { expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

/** The canvas is ready only after every bitmap in the room has decoded and drawn. */
export async function settleHallFrame(page: Page) {
  await expect(page.locator(".world-scene > .hall-composition")).toHaveAttribute("data-scene-ready", "true");
  await page.evaluate(async () => { await document.fonts.ready; });
}

export async function expectWholeHallFrame(page: Page) {
  await settleHallFrame(page);
  // A viewport resize reaches the room's ResizeObserver after the canvas is ready.
  // Fit the content box; padding reserves space for controls in short windows.
  await expect.poll(() => page.evaluate(() => {
    const frame = document.querySelector(".world-scene > .hall-composition")!.getBoundingClientRect();
    const stage = document.querySelector(".world-stage")!;
    const available = stage.getBoundingClientRect(), space = getComputedStyle(stage);
    const width = available.width - parseFloat(space.paddingLeft) - parseFloat(space.paddingRight);
    const height = available.height - parseFloat(space.paddingTop) - parseFloat(space.paddingBottom);
    const scale = Math.min(width / 1536, height / 1024);
    return Math.max(Math.abs(frame.width - 1536 * scale), Math.abs(frame.height - 1024 * scale));
  }), { message: "The whole source frame fits the resized world stage" }).toBeLessThanOrEqual(1);
  await expect(page.locator('.scene-toolbar,.scene-navigation,.scene-control-strip,[data-action="hall-focus"],[data-scene-focus]')).toHaveCount(0);
  await expect(page.locator(".world-dock .world-hall-view,.world-room-selector")).toHaveCount(0);
  await expect(page.locator('.world-hud [data-action="world-navigation"]')).toBeVisible();
  await expect(page.locator(".hall-world-stage button")).toHaveCount(0);
  await expect(page.locator(".world-scene .hall-world-stage canvas")).toHaveCount(1);
  await expect(page.locator(".world-scene > .hall-composition")).toHaveAttribute("data-renderer", "pixi-webgl");
  const geometry = await page.evaluate(() => {
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const composition = document.querySelector(".world-scene > .hall-composition")!;
    const canvas = composition.querySelector<HTMLCanvasElement>(".hall-world-stage canvas")!;
    const stage = document.querySelector(".world-stage")!;
    const available = rect(stage);
    const space = getComputedStyle(stage);
    const left = parseFloat(space.paddingLeft), right = parseFloat(space.paddingRight);
    const top = parseFloat(space.paddingTop), bottom = parseFloat(space.paddingBottom);
    available.left += left; available.right -= right;
    available.top += top; available.bottom -= bottom;
    available.width -= left + right; available.height -= top + bottom;
    const frame = rect(composition);
    const matrix = new DOMMatrix(getComputedStyle(canvas.parentElement!).transform);
    return { frame, canvas: rect(canvas), available, nativeWidth: canvas.width, nativeHeight: canvas.height,
      renderer: composition.getAttribute("data-renderer"),
      density: devicePixelRatio,
      matrix: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f },
      expectedScale: Math.min(available.width / 1536, available.height / 1024),
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      backdrop: getComputedStyle(document.querySelector(".world")!, "::before").backgroundImage,
      blur: getComputedStyle(document.querySelector(".world")!, "::before").filter };
  });
  const sampling = Math.min(1, geometry.canvas.width * geometry.density / 1536, geometry.canvas.height * geometry.density / 1024);
  expect(Math.abs(geometry.nativeWidth - Math.round(1536 * sampling))).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.nativeHeight - Math.round(1024 * sampling))).toBeLessThanOrEqual(1);
  expect(geometry.frame.width / geometry.frame.height).toBeCloseTo(1.5, 3);
  expect(geometry.frame.width).toBeCloseTo(1536 * geometry.expectedScale, 0);
  expect(geometry.frame.height).toBeCloseTo(1024 * geometry.expectedScale, 0);
  for (const edge of ["left", "right", "top", "bottom"] as const)
    expect(geometry.canvas[edge], `complete source ${edge}`).toBeCloseTo(geometry.frame[edge], 0);
  expect(geometry.frame.left).toBeGreaterThanOrEqual(geometry.available.left - 1);
  expect(geometry.frame.right).toBeLessThanOrEqual(geometry.available.right + 1);
  expect(geometry.frame.top).toBeGreaterThanOrEqual(geometry.available.top - 1);
  expect(geometry.frame.bottom).toBeLessThanOrEqual(geometry.available.bottom + 1);
  expect(geometry.matrix.a).toBeCloseTo(geometry.matrix.d, 5);
  expect(geometry.matrix.b).toBe(0);
  expect(geometry.matrix.c).toBe(0);
  expect(geometry.matrix.e).toBe(0);
  expect(geometry.matrix.f).toBe(0);
  expect(geometry.overflowX).toBeLessThanOrEqual(1);
  expect(geometry.overflowY).toBeLessThanOrEqual(1);
  expect(geometry.backdrop).toContain("url(");
  expect(geometry.blur).toContain("blur(");
  const backdropURL=geometry.backdrop.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
  expect(backdropURL).toBeDefined();
  expect(await page.evaluate(async src=>{
    const image=new Image();image.src=src!;
    try{await image.decode();return image.naturalWidth>0&&image.naturalHeight>0;}catch{return false;}
  },backdropURL),'The blurred surround decodes as an image rather than a missing asset or SPA fallback').toBe(true);
  return geometry;
}

export async function hallPixelFingerprint(page: Page) {
  await settleHallFrame(page);
  const pixels = await page.locator('.world-scene .hall-world-stage canvas').screenshot();
  return createHash("sha256").update(pixels).digest("hex");
}

/** Room navigation is a deliberate globe → whole-view card choice. */
export async function chooseWorldView(page: Page, view: string, keyboard = false) {
  await page.locator('.world-hud [data-action="world-navigation"]').click();
  const card = page.locator(`.modal-navigation .navigation-view-card[data-view="${view}"]`);
  await expect(card).toBeVisible();
  if (keyboard) await card.press("Enter"); else await card.click();
  await expect(page.locator('.modal-navigation')).toHaveCount(0);
  await expect(page.locator('.world-scene > .shop-composition')).toHaveAttribute('data-scene-view', view);
  await expect(page.locator('.world-hud [data-action="world-navigation"]')).toBeFocused();
}

/** Map entry deliberately chooses a room before changing the active project. */
export async function enterMapBuilding(page:Page,area:string,keyboard=false){
  const pin=page.locator(`.world-pin[data-area="${area}"]`),project=await pin.getAttribute('data-project');
  if(keyboard)await pin.press('Enter');else await pin.click();
  if(!project)return;
  const modal=page.locator('.modal-navigation');await expect(modal).toBeVisible();
  const card=modal.locator(`.navigation-view-card[data-project="${project}"]`).first();
  await expect(card).toBeVisible();await card.click();await expect(modal).toHaveCount(0);
}
