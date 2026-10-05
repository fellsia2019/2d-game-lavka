import { SHOP_STEPS, type ShopTaskId } from "./campaign";
import type { RenovationColor, RenovationId } from "./renovations";
export { SHOP_STEPS, CAMPAIGN_AREAS, type CampaignAreaId } from "./campaign";

export const SCENE_ASSETS = ["campaign-shop-empty.webp", "campaign-map.webp",
  "campaign-shelving.webp", "campaign-basket.webp", "counter.webp",
  "jam.webp", "milk.webp", "honey.webp", "bread.webp", "pear.webp"] as const;

export function sceneDescription(stage: number): string {
  if (stage === 0) return "Пустая лавка";
  return SHOP_STEPS[stage - 1].name;
}

export function completedOrders(stage: number): number {
  return SHOP_STEPS.slice(0, stage).reduce((sum, step) => sum + step.cost, 0);
}

export function shopSceneHTML(stage: number | readonly ShopTaskId[], assets: string,
  decorations: Partial<Record<RenovationId, RenovationColor>> = {},
  options: { pending?: ShopTaskId; justBuilt?: ShopTaskId; controls?: string } = {}): string {
  const tasks = typeof stage === "number" ? SHOP_STEPS.slice(0, stage).map(task => task.id) : stage;
  const has = (id: ShopTaskId) => tasks.includes(id) || options.pending === id;
  const state = (id: ShopTaskId) => options.pending === id ? "scene-planned" : options.justBuilt === id ? "scene-built-pop" : "";
  const label = tasks.length === 0 ? "Пустая лавка" : `Лавка: ${tasks.length} из ${SHOP_STEPS.length} изменений`;
  const goods = has("first-stock") ? [
    ["jam", 18, 73.5, 20], ["milk", 36, 73.5, 25],
    ["honey", 54, 73.5, 20], ["milk", 73, 73.5, 25],
    ["bread", 27, 50, 18], ["pear", 65, 50, 20],
  ].map(([file, left, bottom, height]) =>
    `<img class="scene-good ${state("first-stock")}" src="${assets}${file}.webp" alt="" style="left:${left}%;bottom:${bottom}%;height:${height}%" />`).join("") : "";
  const baskets = has("display-baskets") ? [15, 53].map(left =>
    `<img class="scene-basket ${state("display-baskets")}" src="${assets}campaign-basket.webp" width="640" height="188" alt="" style="left:${left}%" />`).join("") : "";
  return `<div class="shop-composition" role="${options.controls ? "group" : "img"}" aria-label="${label}">
    <img class="scene-background" src="${assets}campaign-shop-empty.webp" width="1536" height="1024" alt="" />
    ${(has("first-shelf") || has("display-baskets") || has("first-stock")) ? `<div class="scene-shelving" aria-hidden="true"><img class="shelving-base ${state("first-shelf")}" src="${assets}campaign-shelving.webp" width="1000" height="590" alt="" />${baskets}${goods}</div>` : ""}
    ${has("order-counter") ? `<img class="scene-counter ${decorations.counter ?? "sea"} ${state("order-counter")}" src="${assets}counter.webp" width="1400" height="698" alt="" />` : ""}
    ${has("shop-opening") ? `<div class="scene-sign ${decorations.sign ?? "sea"} ${state("shop-opening")}" aria-hidden="true"><span>Лавка<br />у моря</span></div>` : ""}
    ${decorations.window ? `<img class="scene-garden ${decorations.window}" src="${assets}garden.webp" width="878" height="600" alt="" aria-hidden="true" />` : ""}
    ${options.controls ?? ""}
  </div>`;
}
