// Visual catalog for the first campaign scene. It does not read or alter progress.
export const SHOP_STEPS = [
  { id: "first-shelf", name: "Первая полка", cost: 1, result: "Есть место для первого ассортимента." },
  { id: "display-baskets", name: "Корзины", cost: 2, result: "Полка готова для хлеба и фруктов." },
  { id: "first-stock", name: "Первые товары", cost: 2, result: "В лавке появились хлеб, молоко, варенье и фрукты." },
  { id: "order-counter", name: "Прилавок", cost: 2, result: "Покупателям есть где получить заказ." },
  { id: "shop-opening", name: "Открытие лавки", cost: 3, result: "Вывеска на месте. Следующая цель — склад." },
] as const;

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

export function shopSceneHTML(stage: number, assets: string): string {
  const goods = stage >= 3 ? [
    ["jam", 18, 73.5, 20], ["milk", 36, 73.5, 25],
    ["honey", 54, 73.5, 20], ["milk", 73, 73.5, 25],
    ["bread", 27, 50, 18], ["pear", 65, 50, 20],
  ].map(([file, left, bottom, height]) =>
    `<img class="scene-good" src="${assets}${file}.webp" alt="" style="left:${left}%;bottom:${bottom}%;height:${height}%" />`).join("") : "";
  const baskets = stage >= 2 ? [15, 53].map(left =>
    `<img class="scene-basket" src="${assets}campaign-basket.webp" width="640" height="188" alt="" style="left:${left}%" />`).join("") : "";
  return `<div class="shop-composition" role="img" aria-label="${sceneDescription(stage)}: ${stage === 0 ? "пустое помещение с видом на море" : SHOP_STEPS[stage - 1].result}">
    <img class="scene-background" src="${assets}campaign-shop-empty.webp" width="1536" height="1024" alt="" />
    ${stage >= 1 ? `<div class="scene-shelving" aria-hidden="true"><img class="shelving-base" src="${assets}campaign-shelving.webp" width="1000" height="590" alt="" />${baskets}${goods}</div>` : ""}
    ${stage >= 4 ? `<img class="scene-counter" src="${assets}counter.webp" width="1400" height="698" alt="" />` : ""}
    ${stage >= 5 ? `<div class="scene-sign" aria-hidden="true"><span>Лавка<br />у моря</span></div>` : ""}
  </div>`;
}
