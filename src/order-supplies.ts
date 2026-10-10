import { GOOD_IDS, GOODS, isGood, type Good } from "./catalog";
import { orderCurrency, projectTasks, type CampaignTask } from "./campaign";
import { CHAPTER, canonicalLevelId } from "./content";
import type { Definition } from "./engine";

export const MATERIALS = {
  paint: { name: "Краска", file: "material-paint", color: "#35a7aa" },
  boards: { name: "Доски", file: "material-boards", color: "#bf844b" },
  bricks: { name: "Кирпичи", file: "material-bricks", color: "#c86e4c" },
  tiles: { name: "Плитка", file: "material-tiles", color: "#558fa5" },
  nails: { name: "Гвозди", file: "material-nails", color: "#8796a5" },
  cement: { name: "Цемент", file: "material-cement", color: "#b5ad98" },
  glass: { name: "Стекло", file: "material-glass", color: "#84cddd" },
  gears: { name: "Шестерёнки", file: "material-gears", color: "#bd9254" },
  wire: { name: "Провод", file: "material-wire", color: "#de9258" },
  toolbox: { name: "Инструменты", file: "material-toolbox", color: "#da6551" },
} as const;
export type MaterialId = keyof typeof MATERIALS;
export interface OrderAppearance {
  version: 1;
  kind: "repair" | "food";
  items: Partial<Record<Good, MaterialId>>;
  taskId?: string;
  title: string;
  customer: string;
  line: string;
}
const palettes = {
  floor: ["boards", "nails", "paint", "tiles"],
  stoneFloor: ["tiles", "cement", "paint", "toolbox"],
  wall: ["paint", "cement", "tiles", "toolbox"],
  openings: ["boards", "glass", "nails", "toolbox"],
  foundation: ["bricks", "cement", "boards", "toolbox"],
  roof: ["tiles", "boards", "nails", "toolbox"],
  equipment: ["gears", "wire", "glass", "toolbox"],
  clearing: ["toolbox", "boards", "paint", "nails"],
} as const satisfies Record<string, readonly MaterialId[]>;
type Briefing = readonly [keyof typeof palettes, string, string];
const siteBriefings: readonly Briefing[] = [
  ["clearing", "Расчистка участка", "Подготовьте инструменты и настил для вывоза мусора с участка."],
  ["clearing", "Разбор руин", "Соберите комплект для разборки сгнивших конструкций и безопасного прохода."],
  ["clearing", "Удаление зарослей", "Подготовьте инструменты для удаления кустов и лиан вдоль будущей стройки."],
  ["clearing", "Деревья и пни", "Соберите инструменты и доски для вывоза тяжёлых остатков деревьев."],
  ["foundation", "Ровная площадка", "Подготовьте материалы для выравнивания и укрепления основания площадки."],
  ["clearing", "Разметка", "Соберите доски, крепёж и краску для разметки будущих стен и проходов."],
  ["foundation", "Фундамент", "Подготовьте кирпичи, цемент и опалубку для нового фундамента."],
  ["wall", "Каркас и стены", "Соберите материалы для возведения и защиты стен новой постройки."],
  ["roof", "Крыша", "Подготовьте покрытие, доски и крепёж для крыши."],
  ["openings", "Вход и проёмы", "Соберите рамы, стекло и крепёж для безопасного входа и окон."],
  ["floor", "Пол и отделка", "Подготовьте доски и отделочные материалы для внутреннего пола."],
  ["equipment", "Освещение входа", "Соберите провод и монтажный комплект для света и безопасного входа."],
];
const briefings: Record<string, readonly Briefing[]> = {
  "shop-1": [
    ["floor", "Пол лавки", "Соберите доски, крепёж и покрытие для восстановления пола лавки."],
    ["wall", "Стены лавки", "Подготовьте краску и отделочные материалы для стен лавки."],
    ["openings", "Дверь и окно", "Соберите доски, стекло и крепёж для обновления двери и окна."],
  ],
  "warehouse-1": siteBriefings.map((briefing, index): Briefing => index === 8 ? [briefing[0], "Крыша склада", briefing[2]] : briefing),
  "fruit-yard-1": siteBriefings.map((briefing, index): Briefing => index === 8 ? [briefing[0], "Крыша павильона", briefing[2]] : briefing),
  "bakery-1": siteBriefings.map((briefing, index): Briefing => index === 8
    ? [briefing[0], "Крыша пекарни", briefing[2]] : index === 10
      ? ["stoneFloor", "Пол пекарни", "Соберите каменную плитку, раствор и инструмент для отделки помещений пекарни."] : briefing),
  "shop-2": [
    ["clearing", "Ниша лавки", "Подготовьте инструменты и временный настил для расчистки боковой ниши."],
    ["floor", "Пол в нише", "Соберите доски и покрытие для ремонта пола нового отдела."],
    ["wall", "Стены отдела", "Подготовьте плитку, краску и раствор для стены нового отдела."],
  ],
  "warehouse-2": [
    ["wall", "Стена склада", "Подготовьте отделочные материалы для стены будущей холодной зоны."],
    ["wall", "Теплоизоляция", "Соберите материалы и инструмент для монтажа теплоизоляции."],
    ["equipment", "Холодильник", "Подготовьте провод и монтажные детали для холодильного модуля."],
  ],
  "fruit-yard-2": [
    ["clearing", "Расчистка", "Подготовьте инструменты и настил для расчистки площадки пристройки."],
    ["foundation", "Цоколь зала", "Соберите кирпичи и раствор для прочного цоколя пристройки."],
    ["foundation", "Фундамент зала", "Подготовьте материалы и опалубку для фундамента нового зала."],
    ["openings", "Каркас пристройки", "Соберите доски и крепёж для каркаса пристройки."],
    ["wall", "Наружные стены", "Подготовьте материалы для закрытия и защиты наружных стен."],
    ["openings", "Окна зала", "Соберите рамы, стекло и крепёж для окон нового зала."],
    ["roof", "Крыша пристройки", "Подготовьте покрытие, доски и крепёж для крыши пристройки."],
    ["openings", "Входная дверь", "Соберите детали и инструмент для установки входной двери."],
    ["wall", "Проход в лавку", "Подготовьте отделочные материалы для прохода между пристройкой и лавкой."],
    ["floor", "Пол нового зала", "Соберите покрытие и крепёж для пола нового торгового зала."],
  ],
};
const stories = new Map(CHAPTER.map(order => [order.id, order]));
const storyFor = (id: string) => stories.get(canonicalLevelId(id));
function fundingTask(id: string): CampaignTask | undefined {
  const story = storyFor(id);
  if (!story || orderCurrency(id) !== "repairKits") return undefined;
  let threshold = 0;
  return projectTasks(story.phaseId).filter(task => task.currency === "repairKits").find(task => {
    threshold += task.cost;
    return story.localNumber <= threshold;
  });
}
const presentGoods = (definition: Definition): Good[] => {
  const present = new Set(definition.shelves.flatMap(shelf => [...shelf.front, ...shelf.rear.flat()]));
  return GOOD_IDS.filter(good => present.has(good)).sort();
};
export type OrderSummary = Pick<OrderAppearance, "kind" | "title" | "customer" | "line" | "taskId">;
/** Lightweight order-list metadata, independent of loading the puzzle Definition. */
export function orderSummary(orderId: string): OrderSummary {
  const story = storyFor(orderId);
  const task = fundingTask(orderId);
  if (!task) return { kind: "food", title: story?.name ?? "Заказ", customer: story?.customer ?? "Покупатель",
    line: story?.line ?? "Соберите заказ покупателя." };
  const briefing = briefings[task.phaseId]?.[task.index - 1];
  if (!briefing) throw new Error(`Missing repair briefing: ${task.id}`);
  return { kind: "repair", taskId: task.id, title: briefing[1], customer: "Мастерская ремонта", line: briefing[2] };
}
/** Pin once when issuing an attempt. Logical goods and the verified puzzle remain unchanged. */
export function createOrderAppearance(definition: Definition): OrderAppearance {
  const summary = orderSummary(definition.id);
  const task = fundingTask(definition.id);
  if (!task) return { version: 1, ...summary, items: {},
    ...(!storyFor(definition.id) ? { title: definition.name, line: definition.note } : {}) };
  const palette = briefings[task.phaseId][task.index - 1][0];
  const goods = presentGoods(definition);
  if (goods.length > 4) throw new Error(`Too many repair item kinds: ${definition.id}`);
  return { version: 1, ...summary,
    items: Object.fromEntries(goods.map((good, index) => [good, palettes[palette][index]])) };
}
export function orderItem(appearance: OrderAppearance | undefined, good: Good) {
  const material = appearance?.kind === "repair" ? appearance.items[good] : undefined;
  return material && Object.hasOwn(MATERIALS, material) ? MATERIALS[material] : GOODS[good];
}
/** Validate saved presentation without rewriting its pinned text or material assignment. */
export function validOrderAppearance(value: unknown, definition: Definition): value is OrderAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const appearance = value as OrderAppearance;
  if (appearance.version !== 1 || !["repair", "food"].includes(appearance.kind)) return false;
  if (![appearance.title, appearance.customer, appearance.line].every(text => typeof text === "string" && text.trim().length > 0 && text.length <= 1000)) return false;
  if (!appearance.items || typeof appearance.items !== "object" || Array.isArray(appearance.items)) return false;
  const task = fundingTask(definition.id);
  if (appearance.kind !== (task ? "repair" : "food")) return false;
  const entries = Object.entries(appearance.items);
  if (!task) return appearance.taskId === undefined && entries.length === 0;
  if (appearance.taskId !== task.id || entries.length > 4) return false;
  const goods = presentGoods(definition);
  if (entries.length !== goods.length || !goods.every(good => Object.hasOwn(appearance.items, good))) return false;
  return entries.every(([good, material]) => isGood(good) && typeof material === "string" && Object.hasOwn(MATERIALS, material)) &&
    new Set(entries.map(([, material]) => material)).size === entries.length;
}
