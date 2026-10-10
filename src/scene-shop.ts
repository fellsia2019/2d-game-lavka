import type { Progress } from "./storage";
import { icon } from "./icons";
import { compactAmount } from "./economy-ui";

export const SCENE_SHOP_SLOTS = ["counterTop", "floor", "lighting"] as const;
export type SceneShopSlot = (typeof SCENE_SHOP_SLOTS)[number];
export interface SceneDecor {
  owned: string[];
  equipped: Partial<Record<SceneShopSlot, string>>;
}
export interface SceneShopItem {
  id: string;
  slot: SceneShopSlot;
  name: string;
  description: string;
  cost: number;
  requires: string;
  swatch: string;
  /** Relative to the restored sheet. Geometry and wood grain are unchanged. */
  hue?: number;
  brightness?: number;
  saturation?: number;
  glowColor?: number;
  glowStrength?: number;
}
export const SCENE_SHOP_ITEMS: readonly SceneShopItem[] = [
  { id: "counter-smoked-oak", slot: "counterTop", name: "Морёный дуб", description: "Спокойная серая отделка кассовой столешницы.", cost: 600, requires: "shop-s1-r09", swatch: "#776b58", hue: 6, brightness: .82, saturation: .45 },
  { id: "counter-cherry", slot: "counterTop", name: "Вишнёвое дерево", description: "Насыщенный красноватый оттенок столешницы.", cost: 900, requires: "shop-s1-r09", swatch: "#914c35", hue: -12, brightness: 1.05, saturation: 1.22 },
  { id: "floor-weathered", slot: "floor", name: "Дымчатый дуб", description: "Приглушённый настил в обоих углах лавки.", cost: 900, requires: "shop-s1-r01", swatch: "#a19583", hue: 5, brightness: .84, saturation: .42 },
  { id: "floor-honey", slot: "floor", name: "Медовый настил", description: "Солнечная золотистая отделка восстановленного пола.", cost: 1200, requires: "shop-s1-r01", swatch: "#bd9254", hue: 2, brightness: 1.1, saturation: 1.13 },
  { id: "lighting-amber", slot: "lighting", name: "Янтарный вечер", description: "Мягкий янтарный свет уже установленных светильников.", cost: 300, requires: "shop-s1-r14", swatch: "#ffd27a", glowColor: 0xffd27a, glowStrength: .23 },
  { id: "lighting-sea", slot: "lighting", name: "Морской свет", description: "Прохладное бирюзовое свечение светильников.", cost: 600, requires: "shop-s1-r14", swatch: "#9cdeda", glowColor: 0x9cdeda, glowStrength: .17 },
];
const SLOT_NAMES: Record<SceneShopSlot, string> = { counterTop: "Столешница", floor: "Пол лавки", lighting: "Освещение" };
const BASE_NAMES: Record<SceneShopSlot, string> = { counterTop: "Ореховая столешница", floor: "Восстановленный пол", lighting: "Тёплый свет" };
const REQUIRE_NAMES: Record<SceneShopSlot, string> = { counterTop: "Сначала соберите кассовый прилавок", floor: "Сначала восстановите пол", lighting: "Сначала завершите освещение лавки" };
export type SceneShopDecorations = Partial<Record<SceneShopSlot, SceneShopItem>>;
export const freshSceneDecor = (): SceneDecor => ({ owned: [], equipped: {} });
export const sceneShopItem = (id: unknown): SceneShopItem | undefined => SCENE_SHOP_ITEMS.find(item => item.id === id);
export function validSceneDecor(value: unknown): value is SceneDecor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const decor = value as SceneDecor;
  return Array.isArray(decor.owned) && decor.owned.length <= SCENE_SHOP_ITEMS.length &&
    decor.owned.every(id => typeof id === "string" && !!sceneShopItem(id)) && new Set(decor.owned).size === decor.owned.length &&
    !!decor.equipped && typeof decor.equipped === "object" && !Array.isArray(decor.equipped) &&
    Object.entries(decor.equipped).every(([slot, id]) => SCENE_SHOP_SLOTS.includes(slot as SceneShopSlot) &&
      typeof id === "string" && decor.owned.includes(id) && sceneShopItem(id)?.slot === slot);
}
function state(progress: Progress): SceneDecor {
  return validSceneDecor(progress.sceneDecor) ? progress.sceneDecor : freshSceneDecor();
}
export function sceneShopUnlocked(progress: Progress, item: SceneShopItem): boolean {
  return progress.campaign.completedTasks.includes(item.requires);
}
/** Preview never grants ownership, changes the wallet, or touches an Attempt. */
export function sceneShopDecorations(progress: Progress, previewId?: string | null): SceneShopDecorations {
  const decor = state(progress);
  const result: SceneShopDecorations = {};
  for (const slot of SCENE_SHOP_SLOTS) {
    const item = sceneShopItem(decor.equipped[slot]);
    if (item && decor.owned.includes(item.id) && sceneShopUnlocked(progress, item)) result[slot] = item;
  }
  const preview = sceneShopItem(previewId);
  if (preview && sceneShopUnlocked(progress, preview)) result[preview.slot] = preview;
  return result;
}
export type SceneShopPurchase = { ok: true; item: SceneShopItem } | { ok: false; reason: "unknown" | "locked" | "owned" | "coins" | "invalid-wallet" | "invalid-state" };
/** One permanent right per variant. Apply it immediately after a successful buy. */
export function purchaseSceneItem(progress: Progress, id: unknown): SceneShopPurchase {
  const item = sceneShopItem(id);
  if (!item) return { ok: false, reason: "unknown" };
  if (progress.sceneDecor !== undefined && !validSceneDecor(progress.sceneDecor)) return { ok: false, reason: "invalid-state" };
  const decor = state(progress);
  if (decor.owned.includes(item.id)) return { ok: false, reason: "owned" };
  if (!sceneShopUnlocked(progress, item)) return { ok: false, reason: "locked" };
  if (!Number.isSafeInteger(progress.coins) || progress.coins < 0) return { ok: false, reason: "invalid-wallet" };
  if (progress.coins < item.cost) return { ok: false, reason: "coins" };
  progress.coins -= item.cost;
  progress.sceneDecor = { owned: [...decor.owned, item.id], equipped: { ...decor.equipped, [item.slot]: item.id } };
  return { ok: true, item };
}
/** Previously bought variants and the restored default can be applied for free. */
export function equipSceneItem(progress: Progress, id: unknown, resetSlot?: SceneShopSlot): boolean {
  if (progress.sceneDecor !== undefined && !validSceneDecor(progress.sceneDecor)) return false;
  const decor = state(progress);
  if (id === null && resetSlot && SCENE_SHOP_SLOTS.includes(resetSlot)) {
    if (!decor.equipped[resetSlot]) return false;
    const equipped = { ...decor.equipped };
    delete equipped[resetSlot];
    progress.sceneDecor = { owned: [...decor.owned], equipped };
    return true;
  }
  const item = sceneShopItem(id);
  if (!item || !decor.owned.includes(item.id) || !sceneShopUnlocked(progress, item) || decor.equipped[item.slot] === item.id) return false;
  progress.sceneDecor = { owned: [...decor.owned], equipped: { ...decor.equipped, [item.slot]: item.id } };
  return true;
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export interface SceneShopOptions {
  previewId?: string | null;
  renderPreview?: (decorations: SceneShopDecorations, item?: SceneShopItem) => string;
}
/** Modal body only. Root owns saving, mounting room canvases and button routing. */
export function sceneShopHTML(progress: Progress, assets: string, options: SceneShopOptions = {}): string {
  const decor = state(progress);
  const preview = sceneShopItem(options.previewId);
  const applicable = preview && sceneShopUnlocked(progress, preview) ? preview : undefined;
  const previewHTML = options.renderPreview?.(sceneShopDecorations(progress, applicable?.id), applicable) ??
    `<img src="${escape(assets)}hall-room-main-master.webp" width="1536" height="1024" alt="Вход и витрины лавки" />`;
  return `<div class="scene-shop"><header class="scene-shop-heading"><div><h2 id="scene-shop-heading">Оформление лавки</h2><p>Новые варианты за монеты. Купленное оформление остаётся у вас.</p></div><span class="scene-shop-wallet" aria-label="${progress.coins} монет">${icon("coin")}<b>${compactAmount(progress.coins)}</b></span></header><div class="scene-shop-layout"><section class="scene-shop-preview" aria-labelledby="scene-shop-preview-title"><div class="scene-shop-preview-frame">${previewHTML}</div><p id="scene-shop-preview-title">${applicable ? `Примерка: <strong>${escape(applicable.name)}</strong>` : "Ваше оформление"}</p><small>Примерка не тратит монеты. Покупка меняет только оформление.</small></section><div class="scene-shop-catalog">${SCENE_SHOP_SLOTS.map(slot => `<section class="scene-shop-section" aria-labelledby="scene-shop-${slot}"><h3 id="scene-shop-${slot}">${SLOT_NAMES[slot]}</h3><div class="scene-shop-default"><span>${BASE_NAMES[slot]} · входит в обустройство</span>${decor.equipped[slot] ? `<button class="quiet" data-action="scene-shop-reset" data-slot="${slot}" aria-label="Вернуть: ${BASE_NAMES[slot]}">Вернуть</button>` : `<span class="scene-shop-applied">${icon("check")}Выбрано</span>`}</div>${SCENE_SHOP_ITEMS.filter(item => item.slot === slot).map(item => {
    const unlocked = sceneShopUnlocked(progress, item), owned = decor.owned.includes(item.id), equipped = decor.equipped[slot] === item.id;
    const label = !unlocked ? REQUIRE_NAMES[slot] : equipped ? "Выбрано" : owned ? "Применить" : `${item.cost} монет`;
    const afford = progress.coins >= item.cost;
    return `<article class="scene-shop-item ${applicable?.id === item.id ? "is-previewed" : ""}" data-shop-item="${item.id}"><span class="scene-shop-swatch" style="--finish-swatch:${item.swatch}" aria-hidden="true">${icon(slot === "lighting" ? "hint" : "palette")}</span><div class="scene-shop-item-copy"><h4>${item.name}</h4><p>${item.description}</p>${!unlocked ? `<small>${REQUIRE_NAMES[slot]}</small>` : !owned && !afford ? `<small>Ещё ${item.cost - progress.coins} монет</small>` : ""}</div><div class="scene-shop-item-actions"><button class="quiet scene-shop-try" data-action="scene-shop-preview" data-item="${item.id}" aria-label="Примерить: ${item.name}" aria-pressed="${applicable?.id === item.id}" ${!unlocked ? "disabled" : ""}>Примерить</button><button class="${owned ? "secondary" : "primary"} scene-shop-buy" data-action="${owned ? "scene-shop-equip" : "scene-shop-buy"}" data-item="${item.id}" aria-label="${owned ? label : `Купить: ${item.name} за ${item.cost} монет`}" ${!unlocked || equipped || (!owned && !afford) ? "disabled" : ""}>${equipped ? icon("check") : !unlocked ? icon("lock") : owned ? icon("palette") : icon("coin")}${!unlocked ? "Закрыто" : owned ? label : String(item.cost)}</button></div></article>`;
  }).join("")}</section>`).join("")}</div></div><footer class="scene-shop-footer"><span>${icon("coin")}За новый заказ +60 монет</span><button class="secondary" data-action="tools-shop">Помощь в заказе${icon("arrow")}</button><button class="primary" data-action="close">В лавку${icon("arrow")}</button></footer></div>`;
}
