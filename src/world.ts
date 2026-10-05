import { icon } from "./icons";
import { won } from "./engine";
import { completedCount, CHAPTER } from "./content";
import { CAMPAIGN_AREAS, SHOP_STEPS, nextShopTask, shopComplete, type CampaignAreaId, type ShopTaskId } from "./campaign";
import { shopSceneHTML } from "./campaign-scene";
import type { Progress } from "./storage";

const targets: Record<ShopTaskId, [number, number]> = {
  "first-shelf": [71, 53], "display-baskets": [71, 58], "first-stock": [70, 42],
  "order-counter": [49, 78], "shop-opening": [66, 21],
};
const mapTargets: Record<CampaignAreaId, [number, number]> = {
  shop: [43, 44], warehouse: [83, 17], "fruit-yard": [15, 59],
  bakery: [83, 51], terrace: [65, 84], restaurant: [39, 12],
};
export function taskArtwork(id: ShopTaskId, assets: string) {
  const file = id === "first-shelf" ? "campaign-shelving" : id === "display-baskets" ? "campaign-basket"
    : id === "first-stock" ? "jam" : id === "order-counter" ? "counter" : null;
  return file ? `<img src="${assets}${file}.webp" alt="" draggable="false" />`
    : `<span class="task-sign">${icon("shell")}</span>`;
}
export function worldHTML(progress: Progress, assets: string, mode: "home" | "shop" | "finish" | "map",
  selectedArea: CampaignAreaId, justBuilt?: ShopTaskId) {
  const complete = shopComplete(progress.completed, progress.campaign);
  const task = nextShopTask(progress.campaign);
  const affordable = task && progress.stars >= task.cost;
  const unfinished = progress.attempt && !won(progress.attempt.board);
  const map = mode === "map";
  const finale = mode === "finish";
  const action = affordable ? "buy-task" : complete ? "show-map" : "play";
  const label = affordable ? "Поставить" : complete ? "Участок" : unfinished ? "Продолжить" : "Играть";
  const title = map ? "Ваш участок" : complete ? "Лавка открыта!" : "Откроем лавку!";
  const targetAttrs = `data-action="${action}" ${affordable ? `data-task-id="${task.id}"` : ""}`;
  const wallet = `<div class="world-wallet"><span class="world-currency" aria-label="${progress.stars} звёзд">${icon("star")}<b>${progress.stars}</b></span><span class="world-currency" aria-label="${progress.coins} монет">${icon("coin")}<b>${progress.coins}</b></span></div>`;
  const hud = `<header class="world-hud"><button class="world-round" data-action="${map ? "home" : "show-map"}" aria-label="${map ? "Вернуться в лавку" : "Участок"}">${icon(map ? "home" : "wave")}</button>${wallet}<button class="world-round world-store" data-action="tools-shop" aria-label="Магазин помощи">${icon("store")}<span>Магазин</span></button><button class="world-round" data-action="levels" aria-label="Заказы">${icon("reserve")}</button><button class="world-round" data-action="settings" aria-label="Настройки">${icon("settings")}</button></header>`;
  const controls = task ? (() => {
    const [x, y] = targets[task.id];
    return `<button class="world-target ${affordable ? "ready" : ""}" ${targetAttrs} aria-label="${affordable ? `Поставить: ${task.name} за ${task.cost} звёзд` : `Играть для цели: ${task.name}`}" style="left:${x}%;top:${y}%"><span class="target-plus">+</span><span class="target-price">${icon("star")}${task.cost}</span><span class="target-hand">${icon("hand")}</span></button>`;
  })() : "";
  const edit = mode === "shop" ? Object.entries(progress.renovations).map(([id]) => {
    const [x, y] = id === "sign" ? [66, 21] : id === "counter" ? [49, 78] : [14, 79];
    return `<button class="world-edit" data-repair="${id}" aria-label="Оформление: ${id === "sign" ? "вывеска" : id === "counter" ? "прилавок" : "цветы"}" style="left:${x}%;top:${y}%">${icon("palette")}</button>`;
  }).join("") : "";
  const progressIcons = `<div class="world-progress" role="img" aria-label="${progress.campaign.completedTasks.length} из пяти изменений">${SHOP_STEPS.map(step => `<span class="world-step ${progress.campaign.completedTasks.includes(step.id) ? "done" : step.id === task?.id ? "current" : ""}">${taskArtwork(step.id, assets)}${progress.campaign.completedTasks.includes(step.id) ? icon("check") : ""}</span>`).join("")}</div>`;
  const scene = shopSceneHTML(progress.campaign.completedTasks, assets, progress.renovations,
    { pending: task?.id, justBuilt, controls: controls + edit });
  let stage = `<div class="world-scene">${scene}</div>`;
  let dock = `<div class="world-mission" aria-live="polite"><div class="world-mission-art">${task ? taskArtwork(task.id, assets) : icon(complete ? "reserve" : "shell")}</div><div><h2>${task?.name ?? (complete ? "Дальше — склад" : "Открытие лавки")}</h2><span class="world-mission-cost">${task ? `${icon("star")} ${Math.min(progress.stars, task.cost)} / ${task.cost}` : `${icon("check")} ${completedCount(progress.completed)} / ${CHAPTER.length}`}</span></div></div><button class="primary world-main-action ${affordable ? "build-action" : ""}" ${targetAttrs}>${label}${affordable ? `<span>${task.cost} ${icon("star")}</span>` : icon(complete ? "arrow" : "play")}</button>${progressIcons}`;
  if (map) {
    const area = CAMPAIGN_AREAS.find(a => a.id === selectedArea)!;
    stage = `<div class="world-scene world-map" role="group" aria-label="Карта участка"><img class="scene-background" src="${assets}campaign-map.webp" width="1536" height="1024" alt="Лавка и склад у набережной" />${CAMPAIGN_AREAS.map(a => `<button class="world-pin ${a.id === "shop" ? "open" : "locked"} ${a.id === "warehouse" && complete ? "next-area" : ""}" data-area="${a.id}" aria-label="${a.name}: ${a.id === "shop" ? "войти" : "скоро"}" aria-pressed="${a.id === selectedArea}" style="left:${mapTargets[a.id][0]}%;top:${mapTargets[a.id][1]}%"><span>${a.id === "shop" ? icon("home") : icon("lock")}</span><b>${a.shortName}</b></button>`).join("")}</div>`;
    dock = `<div class="world-mission" aria-live="polite"><div class="world-mission-art">${icon(area.id === "shop" ? "home" : "lock")}</div><div><h2>${area.shortName}</h2><span>${area.id === "shop" ? `${progress.campaign.completedTasks.length} / 5 ${icon("star")}` : "Скоро"}</span></div></div><button class="primary world-main-action" data-action="${area.id === "shop" ? "show-shop" : "home"}">В лавку${icon("arrow")}</button><div class="world-map-status">${area.id === "warehouse" && complete ? "Следующая цель" : "Лавка → склад → пекарня → ресторан"}</div>`;
  } else if (mode === "shop" && Object.keys(progress.renovations).length) {
    dock += `<button class="world-appearance world-round" data-action="appearance" aria-label="Сменить оформление">${icon("palette")}</button>`;
  }
  return `<main class="world ${map ? "on-map" : "in-shop"} ${finale ? "world-finale" : ""}">${hud}<section class="world-stage" aria-labelledby="world-heading"><h1 class="world-heading" id="world-heading">${title}</h1>${finale ? `<div class="world-victory" aria-hidden="true">${icon("star")}${icon("star")}${icon("star")}</div>` : ""}${stage}</section><footer class="world-dock">${dock}</footer></main>`;
}
