/** A two-tone wood finish preserves the registered grain, highlights and alpha. */
export interface SceneMaterial { shadow: number; highlight: number; amount: number; }

export function validSceneMaterial(value: unknown): value is SceneMaterial {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const material = value as SceneMaterial;
  return [material.shadow, material.highlight].every(color => Number.isInteger(color) && color >= 0 && color <= 0xffffff) &&
    Number.isFinite(material.amount) && material.amount >= 0 && material.amount <= 1;
}

/** Transform a decoded source once; both renderers use the same resulting pixels. */
export function applySceneMaterial(pixels: Uint8ClampedArray, material: SceneMaterial): void {
  const shadow = [material.shadow >> 16 & 255, material.shadow >> 8 & 255, material.shadow & 255];
  const highlight = [material.highlight >> 16 & 255, material.highlight >> 8 & 255, material.highlight & 255];
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = (pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722) / 255;
    for (let channel = 0; channel < 3; channel++) {
      const finish = shadow[channel] + luminance * (highlight[channel] - shadow[channel]);
      pixels[index + channel] = pixels[index + channel] * (1 - material.amount) + finish * material.amount;
    }
  }
}
