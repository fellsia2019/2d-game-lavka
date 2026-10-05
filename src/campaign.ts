import { CHAPTER, isCompleted } from "./content";

export const CAMPAIGN_VERSION = "coastal-campaign-1";
export const SHOP_STEPS = [
  { id: "first-shelf", name: "Первая полка", cost: 1, icon: "reserve", result: "Есть место для первого ассортимента." },
  { id: "display-baskets", name: "Корзины", cost: 2, icon: "reserve", result: "Полка готова для хлеба и фруктов." },
  { id: "first-stock", name: "Первые товары", cost: 2, icon: "check", result: "В лавке появились хлеб, молоко, варенье и фрукты." },
  { id: "order-counter", name: "Прилавок", cost: 2, icon: "reserve", result: "Покупателям есть где получить заказ." },
  { id: "shop-opening", name: "Открытие лавки", cost: 3, icon: "shell", result: "Вывеска на месте. Следующая цель — склад." },
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

// Unbuilt chapters deliberately have no playable orders or purchasable tasks.
export const CAMPAIGN_CHAPTERS = CAMPAIGN_AREAS.map(area => ({
  id: `chapter-${area.id}`,
  areaId: area.id,
  name: area.name,
  orderIds: area.id === "shop" ? CHAPTER.map(order => order.id) : [],
  taskIds: area.id === "shop" ? SHOP_STEPS.map(task => task.id) : [],
  requires: area.chapter === 1 ? null : `chapter-${CAMPAIGN_AREAS[area.chapter - 2].id}`,
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
  return CHAPTER.every((_, index) => isCompleted(completed, index + 1)) &&
    SHOP_STEPS.every(task => campaign.completedTasks.includes(task.id));
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
    c.completedTasks.every(id => SHOP_STEPS.some(task => task.id === id));
}
