import { expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

/**
 * Capture composited pixels through Chromium. Reading a WebGL canvas directly
 * after drawing can return a cleared buffer even while the visible scene is correct.
 * Hide only working controls; their focus/hand animation is outside the art contract.
 */
export async function scenePNG(page: Page, selector: string): Promise<Buffer> {
  const surface = page.locator(selector);
  await expect.poll(() => surface.evaluate(element => element.closest<HTMLElement>(".hall-composition")?.dataset.sceneReady)).toBe("true");
  await page.evaluate(async () => { await document.fonts.ready; });
  return surface.screenshot({ animations: "disabled", style: ".hall-goal-layer,.world-heading,.world-hud,.world-scene-back,.world-room-appearance{visibility:hidden!important}" });
}

/** Compare the same composed art with tolerance for Chromium's subpixel sampling. */
export async function scenePNGVisualDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(async ({ before, after }) => {
    const samples = async (encoded: string) => {
      const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const copy = document.createElement("canvas"); copy.width = 1536; copy.height = 1024;
      const context = copy.getContext("2d")!;
      context.drawImage(bitmap, 0, 0, copy.width, copy.height);
      bitmap.close();
      return context.getImageData(0, 0, copy.width, copy.height).data;
    };
    const a = await samples(before), b = await samples(after);
    let difference = 0;
    for (let index = 0; index < a.length; index += 4)
      difference += Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
    return difference / (a.length / 4 * 3);
  }, { before: before.toString("base64"), after: after.toString("base64") });
}

export async function scenePNGHash(page: Page, selector: string): Promise<string> {
  return createHash("sha256").update(await scenePNG(page, selector)).digest("hex");
}

/** Return a source-frame ROI after decoding the visible screenshot, never GL's backing buffer. */
export async function sceneSourcePixels(page: Page, selector: string, box: [number, number, number, number]): Promise<number[]> {
  const png = await scenePNG(page, selector);
  return page.evaluate(async ({ encoded, box }) => {
    const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const copy = document.createElement("canvas"); copy.width = 1536; copy.height = 1024;
    const context = copy.getContext("2d")!;
    context.drawImage(bitmap, 0, 0, 1536, 1024);
    bitmap.close();
    return [...context.getImageData(...box).data];
  }, { encoded: png.toString("base64"), box });
}
