import { CHAPTER, isCompleted } from "./content";
import phasePlan from "./campaign-plan.json" with { type: "json" };

export const CAMPAIGN_VERSION = "coastal-campaign-2";
export const SHOP_STEPS = [
  { id: "first-shelf", name: "Первая полка", cost: 1, icon: "reserve", result: "Есть место для первого ассортимента." },
  { id: "display-baskets", name: "Корзины", cost: 2, icon: "reserve", result: "Полка готова для хлеба и фруктов." },
  { id: "first-stock", name: "Первые товары", cost: 2, icon: "check", result: "В лавке появились хлеб, молоко, варенье и фрукты." },
  { id: "order-counter", name: "Прилавок", cost: 2, icon: "reserve", result: "Покупателям есть где получить заказ." },
  { id: "shop-opening", name: "Открытие лавки", cost: 3, icon: "shell", result: "Лавка открыта. Теперь добавим вторую выкладку." },
  { id: "shop-s1-t06", name: "Второй стеллаж", cost: 3, icon: "reserve", result: "У окна появился стеллаж для новой выкладки." },
  { id: "shop-s1-t07", name: "Новые корзины", cost: 3, icon: "reserve", result: "Вторая выкладка получила свои корзины." },
  { id: "shop-s1-t08", name: "Вторая выкладка", cost: 4, icon: "check", result: "На втором стеллаже появились новые запасы для покупателей." },
] as const;
export type ShopTaskId = (typeof SHOP_STEPS)[number]["id"];
export const CAMPAIGN_AREAS = [
  { id: "shop", name: "Маленькая лавка", shortName: "Лавка", chapter: 1, x: 44, y: 36,
    goal: "Открыть магазин: поставить полку, наполнить её и подготовить место выдачи.",
    result: "Из пустого помещения появляется ваша первая лавка." },
  { id: "warehouse", name: "Склад и поставки", shortName: "Склад", chapter: 2, x: 79, y: 18,
    goal: "Открыть закрытую постройку, установить стеллажи и принять большую поставку.",
    result: "Появляются оборудованный склад и новая группа заказов." },
  { id: "fruit-yard", name: "Большая лавка и фруктовый двор", shortName: "Фрукты", chapter: 3, x: 24, y: 50,
    goal: "Расширить торговлю и обустроить открытый фруктовый уголок.",
    result: "Магазин становится больше, а пустой участок — новой витриной." },
  { id: "bakery", name: "Пекарня", shortName: "Пекарня", chapter: 4, x: 76, y: 36,
    goal: "Построить пекарню, поставить печь, рабочий стол и витрину.",
    result: "У лавки появляется собственная выпечка." },
  { id: "terrace", name: "Терраса у моря", shortName: "Терраса", chapter: 5, x: 70, y: 60,
    goal: "Подготовить настил, столики, навес и свет для первых гостей.",
    result: "Торговый двор получает место отдыха с видом на море." },
  { id: "restaurant", name: "Второй этаж и ресторан", shortName: "2-й этаж", chapter: 6, x: 43, y: 17,
    goal: "Достроить второй этаж лавки и оборудовать ресторан.",
    result: "Открытие сезона завершает первую кампанию прибрежного двора." },
] as const;
export type CampaignAreaId = (typeof CAMPAIGN_AREAS)[number]["id"];

// Planned goals are separate from the orders and scene layers actually produced.
export const CAMPAIGN_PHASES = phasePlan;
export const FIRST_SHOP_PHASE = CAMPAIGN_PHASES.find(phase => phase.id === "shop-1")!;
export const CAMPAIGN_CHAPTERS = CAMPAIGN_AREAS.map(area => ({
  id: `chapter-${area.id}`,
  areaId: area.id,
  name: area.name,
  orderIds: area.id === "shop" ? CHAPTER.map(order => order.id) : [],
  taskIds: area.id === "shop" ? SHOP_STEPS.map(task => task.id) : [],
  phaseIds: CAMPAIGN_PHASES.filter(phase => phase.areaId === area.id).map(phase => phase.id),
  orderTarget: 300,
  taskTarget: 80,
}));
export interface CampaignProgress {
  version: typeof CAMPAIGN_VERSION;
  completedTasks: ShopTaskId[];
}
export const freshCampaign = (): CampaignProgress => ({ version: CAMPAIGN_VERSION, completedTasks: [] });
export function nextShopTask(campaign: CampaignProgress) {
  return SHOP_STEPS.find(task => !campaign.completedTasks.includes(task.id));
}
export function shopComplete(completed: string[], campaign: CampaignProgress): boolean {
  return phaseStatus("shop-1", completed, campaign) === "complete";
}
export function phaseStatus(id: string, completed: string[], campaign: CampaignProgress): "planned" | "locked" | "available" | "complete" {
  const phase = CAMPAIGN_PHASES.find(p => p.id === id);
  if (!phase) return "planned";
  const orders = CHAPTER.filter(order => order.phaseId === id);
  const tasks = id === "shop-1" ? SHOP_STEPS : [];
  // A partially produced phase cannot open its successor or close its chapter.
  if (orders.length === phase.orderTarget && tasks.length === phase.taskTarget &&
    orders.every(order => isCompleted(completed, CHAPTER.indexOf(order) + 1)) &&
    tasks.every(task => campaign.completedTasks.includes(task.id))) return "complete";
  if (!orders.length || !tasks.length) return "planned";
  if (phase.requiresCompletedPhases.some(required => phaseStatus(required, completed, campaign) !== "complete")) return "locked";
  return "available";
}
export function areaStatus(id: CampaignAreaId, completed: string[], campaign: CampaignProgress) {
  return id === "shop" ? shopComplete(completed, campaign) ? "complete" : "available" : "planned";
}

// Match exactly the stars spent on each old repair (3 / 3 / 4).
// Previously owned tasks can be out of sequence; missing tasks retain their
// normal order, and no currency or chapter rewards are minted by migration.
export function migrateCampaign(renovations: Record<string, unknown>): CampaignProgress {
  const tasks = new Set<ShopTaskId>();
  if (renovations.sign) tasks.add("shop-opening");
  if (renovations.counter) { tasks.add("first-shelf"); tasks.add("order-counter"); }
  if (renovations.window) { tasks.add("display-baskets"); tasks.add("first-stock"); }
  return { version: CAMPAIGN_VERSION, completedTasks: SHOP_STEPS.filter(task => tasks.has(task.id)).map(task => task.id) };
}
export function validCampaign(value: unknown): value is CampaignProgress {
  if (!value || typeof value !== "object") return false;
  const c = value as CampaignProgress;
  return c.version === CAMPAIGN_VERSION && Array.isArray(c.completedTasks) &&
    new Set(c.completedTasks).size === c.completedTasks.length &&
    c.completedTasks.every(id => SHOP_STEPS.some(task => task.id === id)) &&
    SHOP_STEPS.slice(5).every((task, index) => !c.completedTasks.includes(task.id) ||
      SHOP_STEPS.slice(0, index + 5).every(previous => c.completedTasks.includes(previous.id)));
}
// Schema 3 knows only the five published purchases. Never accept newly invented
// ownership in an old save, and never recompute its currency from current prices.
export function validLegacyCampaign(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const c = value as { version?: string; completedTasks?: unknown[] };
  return c.version === "coastal-campaign-1" && Array.isArray(c.completedTasks) &&
    new Set(c.completedTasks).size === c.completedTasks.length &&
    c.completedTasks.every(id => SHOP_STEPS.slice(0, 5).some(task => task.id === id));
}
