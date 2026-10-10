import {isFruitView} from './fruit-scene';
import {isBakeryView} from './bakery-scene';
import {isTerraceView} from './terrace-scene';
import { isShopExpansionView } from './shop-expansion-scene';
import { sceneShopDecorations } from "./scene-shop";
import { icon } from "./icons";
import { compactAmount, currencyIcon, currencyLabel } from "./economy-ui";
import { won } from "./engine";
import { taskLabel } from "./campaign-labels";
import { navigationState, destinationForArea,projectSpaceName,projectEntryLabel } from "./world-navigation";
import {projectRoomEntry} from './building-rooms';
import { CHAPTER, isCompleted } from "./content";
import { CAMPAIGN_AREAS, CAMPAIGN_PHASES, PROJECTS, TASKS, nextProjectTask, nextProjectOrder,
  phaseStatus, projectById, currentGlobalStage, blockComplete, taskBalance, type CampaignAreaId } from "./campaign";
import { campaignSceneHTML, campaignMapHTML, sceneTaskView, sceneTaskAnchor,
  sceneTaskArtwork, sceneViews, sceneOverview, sceneDecorationAnchors, type CampaignView } from "./campaign-scene";
import type { Progress } from "./storage";
import type { RenovationId } from "./renovations";
export const taskArtwork = sceneTaskArtwork;
export function isHallView(view: string | undefined): view is "hall" | "hall-prep" {
  return view === "hall" || view === "hall-prep";
}
/** Two viewpoints of the hall share one room and the same purchased objects. */
export function roomViews(areaId: string, completed: readonly string[], currentView?: CampaignView) {
  const views = sceneViews(areaId, completed);
  const hall = views.filter(room => isHallView(room.id));
  const hallView = hall.find(room => room.id === currentView)?.id
    ?? hall.find(room => room.id === "hall")?.id ?? hall[0]?.id;
  let includedHall = false;
  return views.flatMap(room => {
    if (!isHallView(room.id)) return [room];
    if (includedHall) return [];
    includedHall = true;
    return [{ id: hallView!, name: "Торговый зал" }];
  });
}
export function areaProject(progress: Progress, areaId: CampaignAreaId) {
  const projects = PROJECTS.filter(p => p.areaId === areaId);
  return projects.find(p => phaseStatus(p.id, progress.completed, progress.campaign) === "available")
    ?? projects.filter(p => phaseStatus(p.id, progress.completed, progress.campaign) === "complete").at(-1)
    ?? projects[0];
}
const mapTargets: Record<CampaignAreaId, [number, number]> = {
  shop: [43, 43], warehouse: [81, 19], "fruit-yard": [25, 52], bakery: [83, 38], terrace: [73, 57], restaurant: [43, 15],
};
export function worldHTML(progress: Progress, assets: string, mode: "home" | "shop" | "finish" | "map",
  selectedArea: CampaignAreaId, justBuilt?: string, viewOverride?: CampaignView) {
  const project = PROJECTS.find(p => p.id === progress.selectedProject)!;
  const area = CAMPAIGN_AREAS.find(a => a.id === project.areaId)!;
  const navigation = navigationState(progress);
  const destination = navigation.nextDestination;
  const hasNewDestination = navigation.unlockedUnstarted.some(item => item.projectId !== project.id);
  const complete = phaseStatus(project.id, progress.completed, progress.campaign) === "complete";
  const blockDone = blockComplete(progress.completed, progress.campaign);
  const globalStage = currentGlobalStage(progress.completed, progress.campaign);
  const task = nextProjectTask(progress.campaign, project.id);
  const affordable = !!task && taskBalance(progress, task) >= task.cost;
  const unfinished = !!progress.attempt && !won(progress.attempt.board);
  const pendingReward = !!progress.attempt && won(progress.attempt.board) && !progress.attempt.reward;
  const next = nextProjectOrder(project.id, progress.completed, progress.campaign);
  const finale = mode === "finish" && blockDone;
  const map = mode === "map" || finale;
  const mapNotice = map && selectedArea === "warehouse" && navigation.warehouseNotice?.kind === "locked" ? navigation.warehouseNotice : null;
  const orders = CHAPTER.filter(order => order.phaseId === project.id);
  const ordersDone = orders.filter(order => isCompleted(progress.completed, CHAPTER.indexOf(order) + 1)).length;
  const taskCount = project.taskIds.filter(id => progress.campaign.completedTasks.includes(id)).length;
  const targetView = task ? sceneTaskView(task.id) : sceneOverview(area.id, project.id);
  const view = viewOverride ?? (justBuilt ? sceneTaskView(justBuilt) : targetView);
  const showTarget = !!task && view !== targetView && !map;
  const needFunding = !!task && !affordable && !next && !unfinished;
  const action = pendingReward ? "play" : needFunding ? "show-map" : showTarget ? "show-target" : affordable ? "buy-task" : unfinished ? "play" : complete ? blockDone ? "finish" : destination ? "continue-journey" : "show-map" : next ? "play" : task ? "show-target" : "levels";
  const guideBuild = action === "buy-task";
  const guidance = action === "play" ? unfinished ? "continue" : pendingReward ? "reward" : "play" : needFunding ? "funding" : action;
  const label = pendingReward ? "Получить награду" : needFunding ? "Карта двора" : showTarget ? "К цели" : affordable ? "Выполнить" : unfinished ? "Продолжить" : complete ? blockDone ? "Весь двор" : destination?projectEntryLabel(destination.projectId):"Карта двора" : next ? "Играть" : "К цели";
  const title = blockDone ? "Торговый двор ожил!" : complete ? "Здесь всё готово!"
    : project.id === "shop-1" ? "Восстанавливаем лавку"
    : projectSpaceName(project.id);
  const targetAttrs = `data-action="${action}" ${complete && destination && action === "continue-journey" ? `data-project="${destination.projectId}"` : ""} ${affordable ? `data-task-id="${task!.id}"` : ""}`;
  const wallet = `<div class="world-wallet"><span class="world-currency currency-stars" aria-label="${progress.stars} звёзд" title="${progress.stars} звёзд">${currencyIcon("stars")}<b>${compactAmount(progress.stars)}</b></span><span class="world-currency currency-repair" aria-label="${progress.repairKits} ремкомплектов" title="${progress.repairKits} ремкомплектов">${currencyIcon("repairKits")}<b>${compactAmount(progress.repairKits)}</b></span><span class="world-currency currency-coins" aria-label="${progress.coins} монет" title="${progress.coins} монет">${icon("coin")}<b>${compactAmount(progress.coins)}</b></span></div>`;
  const hud = `<header class="world-hud"><button class="world-round world-globe ${hasNewDestination ? "has-destination" : ""}" data-action="world-navigation" aria-label="Навигация по двору" aria-haspopup="dialog">${icon("globe")}${hasNewDestination ? '<i class="navigation-dot" aria-hidden="true"></i>' : ""}</button>${wallet}<button class="world-round world-store" data-action="scene-shop" aria-label="Магазин оформления">${icon("store")}<span>Магазин</span></button><button class="world-round" data-action="levels" aria-label="Заказы">${icon("reserve")}</button><button class="world-round" data-action="settings" aria-label="Настройки">${icon("settings")}</button></header>`;
  const controls = task && !showTarget ? (() => {
    const { x, y } = sceneTaskAnchor(task.id);
    // Registered rooms fit as a whole; only their DOM goal keeps a usable margin.
    const registered = isHallView(view) || isShopExpansionView(view) || isFruitView(view) || isBakeryView(view) || isTerraceView(view) || area.id === "warehouse";
    const clearBack = (area.id === "warehouse" || isShopExpansionView(view) || isFruitView(view) || isBakeryView(view) || isTerraceView(view)) && x < 22 && y < 42;
    const top = registered ? `clamp(36px,${y}%,calc(100% - 56px))` : `${y}%`;
    const left = registered ? `clamp(${clearBack ? 78 : 36}px,${x}%,calc(100% - 36px))` : `${x}%`;
    return `<button class="world-target ${affordable ? "ready" : ""} ${guideBuild ? "game-guidance" : ""}" ${targetAttrs} ${guideBuild ? 'data-guide="build"' : ""} aria-label="${affordable ? `Выполнить: ${task.name} за ${task.cost} ${currencyLabel(task.currency)}` : `Играть для цели: ${task.name}`}" style="left:${left};top:${top}"><span class="target-plus">+</span><span class="target-price" aria-label="Цена: ${task.cost} ${currencyLabel(task.currency)}">${currencyIcon(task.currency)}${task.cost}</span>${guideBuild ? `<span class="target-hand" aria-hidden="true">${icon("hand")}</span>` : ""}</button>`;
  })() : "";
  const decorationAnchors = sceneDecorationAnchors(view);
  const edit = mode === "shop" ? (Object.keys(progress.renovations) as RenovationId[]).flatMap(id => {
    const anchor = decorationAnchors[id];
    if (!anchor) return [];
    // Keep a full-size control clear of the plaque, including on a small scene.
    const top = id === "sign" ? `max(${anchor.y}%, calc(11.5% + 28px))` : `${anchor.y}%`;
    const position = `left:clamp(22px,${anchor.x}%,calc(100% - 22px));top:clamp(22px,${top},calc(100% - 22px))`;
    return [`<button class="world-edit" data-repair="${id}" aria-label="Оформление: ${id === "sign" ? "вывеска" : id === "counter" ? "прилавок" : "цветы"}" style="${position}">${icon("palette")}</button>`];
  }).join("") : "";
  const progressIcons = `<div class="world-progress"><span>Заказы ${ordersDone} / ${project.orderTarget}</span><span class="world-build-progress" role="progressbar" aria-label="Обустройство здания" aria-valuemin="0" aria-valuemax="${project.taskTarget}" aria-valuenow="${taskCount}"><span>Обустройство ${taskCount} / ${project.taskTarget}</span><i style="--built:${taskCount / project.taskTarget * 100}%"></i></span></div>`;
  let stage = `<div class="world-scene">${campaignSceneHTML(progress.campaign.completedTasks, assets, { areaId: area.id, phaseId: project.id, view, pending: task?.id, justBuilt, controls: controls + edit, decorations: progress.renovations, decor: sceneShopDecorations(progress) })}</div>`;
  const appearance = mode === "shop" && area.id === "shop" && !isShopExpansionView(view) && progress.campaign.completedTasks.includes('shop-s1-r09')
    ? `<button class="world-room-appearance world-round" data-action="appearance" aria-label="Сменить оформление">${icon("palette")}</button>` : "";
  const back = `<button class="world-scene-back" data-action="${map ? "home" : "show-map"}" aria-label="${map ? `Вернуться: ${area.shortName}` : "На карту двора"}">${icon("back")}<span>${map ? `К зданию: ${area.shortName}` : "Карта двора"}</span></button>`;
  const debug = `<button class="debug-launch world-debug-control" data-action="debug-menu" aria-haspopup="dialog">Дебаг</button>`;
  const nextRoom=destination&&projectRoomEntry(progress,destination.projectId);
  const nextWork=destination&&nextProjectTask(progress.campaign,destination.projectId);
  const completionTitle=destination?projectSpaceName(destination.projectId):complete?'Здесь всё готово':'Завершить заказы';
  const completionBody=destination?nextWork?`Следующая работа: ${taskLabel(nextWork.id,nextWork.name)}`:`Перейти: ${nextRoom?.name??destination.label}`:blockDone?'Доступные помещения обустроены':projectSpaceName(project.id);
  let dock = `<div class="world-mission" aria-live="polite"><div class="world-mission-art">${task?taskArtwork(task.id,assets):nextWork?taskArtwork(nextWork.id,assets):icon(blockDone?'star':'home')}</div><div class="world-journey-copy"><h2>${task?taskLabel(task.id,task.name):blockDone?'Двор готов':completionTitle}</h2>${task?`<span class="world-mission-cost" aria-label="${taskBalance(progress,task)} из ${task.cost} ${currencyLabel(task.currency)}">${currencyIcon(task.currency)} ${Math.min(taskBalance(progress,task),task.cost)} / ${task.cost}</span>`:`<p>${completionBody}</p>`}</div></div><button class="primary world-main-action game-guidance ${complete&&destination?'next-destination':''} ${affordable&&!showTarget?'build-action':''}" ${targetAttrs} data-guide="${guidance}">${label}${affordable&&!showTarget?`<span aria-label="Цена: ${task!.cost} ${currencyLabel(task!.currency)}">${task!.cost} ${currencyIcon(task!.currency)}</span>`:icon(complete||showTarget?'arrow':'play')}</button>${progressIcons}`;
  if (map) {
    const chosenArea = CAMPAIGN_AREAS.find(a => a.id === selectedArea)!;
    const chosen = areaProject(progress, chosenArea.id);
    const status = chosen ? phaseStatus(chosen.id, progress.completed, progress.campaign) : "planned";
    const selectable = status === "available" || status === "complete";
    // Guide toward a playable project. A deliberately chosen available pin takes
    // precedence; a completed/locked preview retains the next unlocked destination.
    const fundingDestination = needFunding ? navigation.availableDestinations.find(candidate =>
      candidate.status === "available" && candidate.projectId !== project.id &&
      nextProjectOrder(candidate.projectId, progress.completed, progress.campaign)) : null;
    const continueProject=fundingDestination?.projectId??(status==='available'?chosen?.id:destination?.projectId)
      ??(!navigation.currentComplete?project.id:undefined);
    const mapEntry=continueProject&&projectRoomEntry(progress,continueProject);
    const guidedArea=mapEntry?projectById(mapEntry.projectId)!.areaId:undefined;
    const pins = CAMPAIGN_AREAS.map(a => {
      const candidate = areaProject(progress, a.id);
      const state = candidate ? phaseStatus(candidate.id, progress.completed, progress.campaign) : "planned";
      const open = state === "available" || state === "complete";
      const pinDestination = destinationForArea(progress, a.id);
      const current = a.id === area.id;
      const guided = open && a.id === guidedArea;
      const isNew = !!pinDestination?.isNew;
      const hint = !open ? "Пока закрыто" : "Выбрать помещение";
      return `<button class="world-pin ${open ? "open" : "locked"} ${isNew ? "next-area" : ""} ${current ? "current-area" : ""} ${guided ? "game-guidance" : ""}" data-area="${a.id}" ${open ? `data-action="select-project" data-project="${candidate!.id}"` : ""} ${guided ? 'data-guide="map-pin"' : ""} aria-label="${a.name}: ${hint}${guided ? ", следующий шаг" : ""}${current ? ", вы здесь" : ""}" aria-pressed="${a.id === selectedArea}" style="left:${mapTargets[a.id][0]}%;top:${mapTargets[a.id][1]}%"><span>${!open ? icon("lock") : a.id === "warehouse" ? icon("reserve") : a.id === "fruit-yard" ? `<img src="${assets}pear.webp" alt="" />` : icon("home")}</span><b>${a.shortName}</b>${isNew || current || guided ? `<em class="world-pin-badge">${current ? "Вы здесь" : isNew ? "Открыт" : "Дальше"}</em>` : ""}<small class="world-pin-hint">${hint}</small></button>`;
    }).join("");
    stage = `<div class="world-scene world-map" role="group" aria-label="Карта участка">${campaignMapHTML(progress.campaign.completedTasks, assets, { controls: pins })}</div>`;
    const plan = CAMPAIGN_PHASES.find(p => p.areaId === chosenArea.id && p.stage === 1)!;
    const required = CAMPAIGN_PHASES.find(p => p.id === plan.requiresCompletedPhases.find(id => phaseStatus(id, progress.completed, progress.campaign) !== "complete"));
    const requirementArea = CAMPAIGN_AREAS.find(a => a.id === required?.areaId);
    const entryWork=mapEntry&&nextProjectTask(progress.campaign,mapEntry.projectId);
    const statusText=mapNotice?mapNotice.body:!selectable?required?`Завершите заказы и обустройство: ${requirementArea?.shortName}`:'Новая локация готовится':entryWork?`Следующая работа: ${taskLabel(entryWork.id,entryWork.name)}`:'Все помещения обустроены';
    const mapAction=mapEntry?`<button class="primary world-main-action world-map-action game-guidance" data-action="continue-journey" data-project="${mapEntry.projectId}" data-guide="map-continue">${projectEntryLabel(mapEntry.projectId)}${icon('arrow')}</button>`:selectable?`<button class="primary world-main-action world-map-action" data-action="select-project" data-project="${chosen!.id}">Помещения${icon('arrow')}</button>`:'';
    dock=`<div class="world-mission" aria-live="polite"><div class="world-mission-art">${icon(selectable?'home':'lock')}</div><div class="world-journey-copy"><h2>${chosenArea.shortName}</h2><p>${selectable?'Выберите помещение или продолжите работу':'Пока закрыто'}</p></div></div>${mapAction}<div class="world-map-status">${statusText}</div>`;
    if(finale) dock=`<div class="world-mission"><div class="world-mission-art">${icon('star')}</div><div class="world-journey-copy"><h2>Торговый двор ожил!</h2><p>Доступные помещения готовы</p></div></div><button class="primary world-main-action world-map-action" data-action="select-project" data-project="${project.id}">Осмотреть помещения${icon('arrow')}</button><div class="world-map-status world-block-finale">${CHAPTER.length} заказов · ${TASKS.length} работ</div>`;

  }
  return `<main class="world world-unified-navigation ${mapNotice ? "has-map-notice" : ""} ${finale ? "world-block-complete" : ""} ${map ? "on-map" : "in-shop"} ${!map && view === "cold" ? "in-cold" : ""}  ${complete || mode === "finish" ? "world-finale" : ""}" data-project="${project.id}" data-global-stage="${globalStage}">${hud}<section class="world-stage" ${map ? 'aria-label="Карта участка"' : 'aria-labelledby="world-heading"'}>${!map ? `<h1 class="world-heading" id="world-heading">${title}</h1>` : ""}${complete && !map ? `<div class="world-victory" aria-hidden="true">${icon("star")}${icon("star")}${icon("star")}</div>` : ""}${stage}${back}${debug}${!map ? appearance : ""}</section><footer class="world-dock">${dock}</footer></main>`;
}
