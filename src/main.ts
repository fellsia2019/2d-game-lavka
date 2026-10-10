import "./style.css";
import "./campaign-game.css";
import "./scene-navigation.css";
import { CAMPAIGN_AREAS, nextProjectTask, nextProjectOrder, projectTasks, taskBalance,
  isProjectOrderUnlocked, blockComplete, projectById,phaseStatus,
  type CampaignAreaId, type ProjectId } from "./campaign";
import { campaignSceneHTML, sceneTaskView, type CampaignView } from "./campaign-scene";
import {buildingRooms,projectRoomEntry,type BuildingRoom} from './building-rooms';
import { hallSceneHTML, hallCounterPreviewHTML } from "./hall-scene";
import { mountHallCanvases, retainHallScene, prepareHallScene } from "./hall-canvas";
import { worldHTML } from "./world";
import { navigationState,projectSpaceName } from "./world-navigation";
import {
  addReserve,
  applyMove,
  clone,
  initial,
  hasMoves,
  validateDefinition,
  won,
  type Board,
  type Good,
  type Move,
  type Position,
  type SearchResult,
} from "./engine";
import {
  CHAPTER,
  chapterNumber,
  completedCount,
  isCompleted,
  loadChapterLevel,
} from "./content";
import { structuralKey } from "./generator";
import { RENOVATIONS, COLORS, type RenovationId } from "./renovations";
import { track, downloadEvents } from "./telemetry";
import { job } from "./jobs";
import { guidanceMode, hiddenStock } from "./guidance";
import {
  STORAGE_KEY,
  completeAttempt,
  loadProgress,
  renovate,
  renovationOwned,
  purchaseProjectTask,
  selectProject,
  saveProgress,
  cachedHint,
  finishes,
  rememberHint,
  validateAttempt,
  type RenovationColor,
  type Settings,
} from "./storage";
import { audio } from "./audio";
import { icon } from "./icons";
import { TOOLS, purchaseTool, toolUnlocked, type ToolKind } from "./tools";
import "./tool-shop.css";
import "./debug.css";
import { debugSceneHTML, applyDebugSceneState, readDebugSceneState, updateDebugSceneFields, addDebugCurrency, readDebugCurrency, type DebugScenePreset } from './debug-scene';
import './debug-scene.css';
import { sceneShopHTML, sceneShopDecorations, purchaseSceneItem, equipSceneItem, type SceneShopSlot } from './scene-shop';
import './scene-shop.css';
import { presentSceneReveal, finishSceneReveal, retainSpriteScene, decodeSpriteScene, type SceneReveal } from './scene-reveal';
import './scene-reveal.css';
import { DebugAutoPlayer } from "./debug-auto";
import { createOrderAppearance, orderItem, orderSummary } from "./order-supplies";
import "./economy-ui.css";
import "./world-navigation.css";
import './journey-ui.css';
import { compactAmount, currencyIcon } from "./economy-ui";

const app = document.querySelector<HTMLDivElement>("#app")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const toastElement = document.querySelector<HTMLDivElement>("#toast")!;
const coach = document.createElement("div");
coach.id = "coach";
document.body.append(coach);
// Access the storage getter inside the persistence functions' try/catch as well:
// some embedded/privacy modes throw even when obtaining window.localStorage.
const storage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};
const loaded = loadProgress(storage);
const progress = loaded.progress;
type Screen = "home" | "game" | "finish" | "shop" | "map" | "tools-shop";
let screen: Screen = "home";
let toolShopReturn: Screen = "home";
let shopTool: ToolKind | null = null;
let renderedScreen: Screen | null = null;
let selected: Position | null = null;
let highlighted: Move | null = null;
let gentleBoard: Board | null = null;
let gentleStep: Move | null = null;
let gentlePending = false;
let busy = false;
let modal: string | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let lastFocus: HTMLElement | null = null;
let storageWarned = false;
let externalChanged = !!loaded.readOnly;
let repairTarget: RenovationId = "counter";
let selectedArea: CampaignAreaId = projectById(progress.selectedProject)!.areaId;
let justBuilt: string | undefined;
let buildReveal: SceneReveal | undefined;
let sceneShopPreview: string | undefined;
let hallResizeObserver: ResizeObserver | null = null;
let pendingLevel: number | null = null;
let toolLesson = false;
let drag: {
  from: Position;
  x: number;
  y: number;
  active: boolean;
  element: HTMLElement | null;
  pointer: number;
} | null = null;
let suppressClick = false;
const assets = `${import.meta.env.BASE_URL}assets/`;
const currentAppearance = () => progress.attempt
  ? progress.attempt.appearance ??= createOrderAppearance(progress.attempt.definition)
  : undefined;
const itemFor = (good: Good) => orderItem(currentAppearance(), good);
const goodImage = (good: Good, cls = "") =>
  `<img class="good ${cls}" src="${assets}${itemFor(good).file}.webp" alt="" draggable="false" />`;
const samePosition = (a: Position | null, b: Position) =>
  !!a && a[0] === b[0] && a[1] === b[1];
const positionSelector = (p: Position) => `[data-slot="${p[0]},${p[1]}"]`;
const current = () => progress.attempt!;
const debugControl = document.createElement("button");
debugControl.className = "debug-run-control";
debugControl.dataset.action = "debug-stop";
debugControl.hidden = true;
document.body.append(debugControl);
let debugRequest = 0;
const debugPlayer = new DebugAutoPlayer({
  current: () => progress.attempt,
  allowed: () => screen === "game" && !busy && !modal && !externalChanged && !document.hidden,
  move: ([from, to]) => move(from, to, "debug"),
  solve: (board, path) => job<SearchResult>({ kind: "hint", board, path }),
  report: message => toast(message),
  statusChanged: status => {
    debugControl.hidden = status === "idle";
    debugControl.textContent = "Стоп";
    debugControl.setAttribute("aria-label", status === "checking" ? "Остановить проверку" : "Остановить автопрохождение");
  },
});
function cancelDebugAuto() {
  debugRequest++;
  debugPlayer.cancel();
}
const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const today = () => new Date().toLocaleDateString("sv-SE");
function persist() {
  if (externalChanged) return;
  if (!saveProgress(storage, progress) && !storageWarned) {
    storageWarned = true;
    toast("Браузер не сохраняет прогресс. Оставьте эту вкладку открытой.");
  }
}
function toast(message: string) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add("visible");
  toastTimer = setTimeout(() => toastElement.classList.remove("visible"), 3800);
}
function clearToast() {
  clearTimeout(toastTimer);
  toastElement.classList.remove("visible");
  toastElement.textContent = "";
}
function applySettings() {
  document.documentElement.classList.toggle(
    "reduced-motion",
    progress.settings.reducedMotion,
  );
  audio.configure(progress.settings);
}
function stats() {
  return `<div class="wallet"><span class="currency star" title="Звёзды для обустройства" aria-label="${progress.stars} звёзд для обустройства">${icon("star")}<b>${compactAmount(progress.stars)}</b></span><span class="currency currency-repair" title="Ремкомплекты для ремонта" aria-label="${progress.repairKits} ремкомплектов">${icon("repair")}<b>${compactAmount(progress.repairKits)}</b></span><span class="currency coin" aria-label="${progress.coins} монет">${icon("coin")}<b>${compactAmount(progress.coins)}</b></span></div>`;
}
function focusGame(selector = "#order-heading", reveal = false) {
  if (screen === "game" && !modal && !externalChanged) {
    const target = app.querySelector<HTMLElement>(coachSelector() ?? selector);
    target?.focus({ preventScroll: true });
    if (reveal) target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
function settingsButton() {
  return `<button class="round cream" data-action="settings" aria-label="Настройки">${icon("settings")}</button>`;
}
function debugButton() {
  return '<button class="debug-launch" data-action="debug-menu" aria-haspopup="dialog">Дебаг</button>';
}
function render(preserveRoom = false, preparedRoom?:HTMLElement) {
  const previousScroll = app.scrollTop;
  const changedScreen = renderedScreen !== screen;
  const active = document.activeElement as HTMLElement | null;
  const focusSelector =
    active && app.contains(active)
      ? active.dataset.slot
        ? positionSelector(
            active.dataset.slot.split(",").map(Number) as Position,
          )
        : active.dataset.action
          ? `[data-action="${active.dataset.action}"]${active.dataset.tool ? `[data-tool="${active.dataset.tool}"]` : ""}`
          : active.id === "order-heading"
            ? "#order-heading"
            : null
      : null;
  app.className = screen === "game" ? "game-screen" : screen === "tools-shop" ? "tool-shop-screen" : "campaign-screen";
  const html =
    screen === "home"
      ? homeHTML()
      : screen === "finish"
        ? finishHTML()
        : screen === "shop"
          ? shopHTML()
          : screen === "map" ? mapHTML() : screen === "tools-shop" ? toolsShopHTML() : gameHTML();
  const previousRoom = preserveRoom ? app.querySelector<HTMLElement>('.world-scene > .shop-composition') : null;
  if (previousRoom || preparedRoom) {
    const fragment = document.createElement('template');
    fragment.innerHTML = html;
    const generatedRoom = fragment.content.querySelector<HTMLElement>('.world-scene > .shop-composition');
    const nextRoom = preparedRoom?.dataset.sceneView===generatedRoom?.dataset.sceneView ? preparedRoom : generatedRoom;
    if (generatedRoom && nextRoom) {
      if (previousRoom && (retainHallScene(previousRoom,nextRoom)||retainSpriteScene(previousRoom,nextRoom))) generatedRoom.replaceWith(previousRoom);
      else if(preparedRoom)generatedRoom.replaceWith(preparedRoom);
    }
    app.replaceChildren(fragment.content);
  } else app.innerHTML = html;
  const sceneView = app.querySelector<HTMLElement>(".shop-composition")?.dataset.sceneView;
  if (sceneView) navigationView = sceneView as CampaignView;
  configureHallScene();
  if (focusSelector)
    app
      .querySelector<HTMLElement>(focusSelector)
      ?.focus({ preventScroll: true });
  if (screen === "game") renderSelection();
  else updateCoach();
  if (busy)
    app.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      if ((buildReveal || b.dataset.action !== "settings") && !b.disabled) {
        b.dataset.busyDisabled = "true";
        b.disabled = true;
      }
    });
  else if (!modal && document.activeElement === document.body)
    app
      .querySelector<HTMLElement>(
        screen === "game" ? "#order-heading" : ".primary:not([disabled])",
      )
      ?.focus({ preventScroll: true });
  if (screen !== "game") app.scrollTop = changedScreen ? 0 : previousScroll;
  renderedScreen = screen;
  if (buildReveal) {
    const state=buildReveal;
    const scene=app.querySelector<HTMLElement>('.world-scene > .hall-composition');
    if(state.phase==='revealing'&&scene) {
      scene.dataset.purchasePhase='revealing';
      scene.addEventListener('scene-transition-start',()=>{
        if(buildReveal===state)presentSceneReveal(app,state);
      },{once:true});
    } else presentSceneReveal(app,state);
  }
  void mountHallCanvases(app).catch(error=>console.warn('[scene] Unable to update the painted room:',error));
}
const repairNext = () => nextProjectTask(progress.campaign, progress.selectedProject);
const nextAvailableOrder = () => nextProjectOrder(progress.selectedProject, progress.completed, progress.campaign);
const allDone = () => blockComplete(progress.completed, progress.campaign);
let shopView: CampaignView | undefined;
let navigationView: CampaignView | undefined;
const ownedDecorations = () => RENOVATIONS.filter(r => r.id === "counter" && renovationOwned(progress, r.id));
function homeHTML() { return worldHTML(progress, assets, "home", selectedArea, justBuilt, shopView); }
function shopHTML() { return worldHTML(progress, assets, "shop", selectedArea, justBuilt, shopView); }
function finishHTML() { return worldHTML(progress, assets, "finish", selectedArea, justBuilt); }
function mapHTML() { return worldHTML(progress, assets, "map", selectedArea); }
function configureHallScene() {
  hallResizeObserver?.disconnect();
  hallResizeObserver = null;
  const scene = app.querySelector<HTMLElement>(".world-scene > .hall-composition");
  const stage = scene?.querySelector<HTMLElement>(".hall-world-stage");
  const world = scene?.closest<HTMLElement>(".world");
  const worldStage = world?.querySelector<HTMLElement>(".world-stage");
  if (!scene || !stage || !world || !worldStage) return;
  const viewport = scene.parentElement!;
  world.classList.add("hall-game-world");
  world.classList.toggle('bakery-game-world', scene.classList.contains('bakery-composition'));
  if (scene.classList.contains('bakery-composition')) {
    const plan = JSON.parse(stage.querySelector('script.hall-canvas-plan')!.textContent!);
    world.style.setProperty('--bakery-surround', `url("${new URL(plan.base, document.baseURI).href}")`);
  } else world.style.removeProperty('--bakery-surround');
  // Painting already has a dock button; a second marker crowds the room goal.
  scene.querySelectorAll(".world-edit").forEach(button => button.remove());
  // The entire room shares one frame. Its DOM goals retain their normal hit area.
  const frame = () => {
    if (!scene.isConnected) return;
    const space = getComputedStyle(worldStage);
    const width = worldStage.clientWidth - parseFloat(space.paddingLeft) - parseFloat(space.paddingRight);
    const height = worldStage.clientHeight - parseFloat(space.paddingTop) - parseFloat(space.paddingBottom);
    const scale = Math.min(width / 1536, height / 1024);
    viewport.style.width = `${1536 * scale}px`;
    viewport.style.height = `${1024 * scale}px`;
    stage.style.transform = `scale(${scale})`;
  };
  frame();
  hallResizeObserver = new ResizeObserver(frame);
  hallResizeObserver.observe(worldStage);
}
function toolsShopHTML() {
  return `<main class="tool-shop"><header class="tool-shop-header"><button class="round cream" data-action="leave-tools-shop" aria-label="${toolShopReturn === "game" ? "Вернуться в заказ" : "Вернуться в лавку"}">${icon("undo")}</button><h1 id="tool-shop-heading" tabindex="-1">Магазин помощи</h1><span class="store-wallet" aria-label="${progress.coins} монет">${icon("coin")}<b>${progress.coins}</b></span></header><div class="tool-shop-content"><p class="store-intro">Любой заказ можно пройти без помощи.</p><div class="store-shelves">${TOOLS.map(tool => {
    const unlocked = toolUnlocked(progress, tool.id);
    const affordable = progress.coins >= tool.cost;
    const note = !unlocked ? `С заказа ${tool.afterOrder + 1}` : !affordable ? `Ещё ${tool.cost - progress.coins}${icon("coin")}` : "1 использование";
    const availability = !unlocked ? `Откроется с заказа ${tool.afterOrder + 1}` : !affordable ? `Не хватает ${tool.cost - progress.coins} монет` : "Добавить одно использование в запас";
    return `<article class="store-tool ${shopTool === tool.id ? "store-tool-selected" : ""}" data-store-tool="${tool.id}" aria-labelledby="store-${tool.id}"><div class="store-tool-heading"><span class="tool-circle">${icon(tool.id)}</span><h2 id="store-${tool.id}">${tool.name}</h2></div><p class="store-description">${tool.description}</p><div class="store-purchase"><span class="store-stock">Есть: <b>${progress.inventory[tool.id]}</b></span><button class="primary store-buy" data-action="buy-tool" data-tool="${tool.id}" title="${availability}" aria-label="Купить: ${tool.name} за ${tool.cost} монет. ${availability}" ${!unlocked || !affordable ? "disabled" : ""}>${unlocked ? "Купить" : `Заказ ${tool.afterOrder + 1}`}<span>${tool.cost}${icon("coin")}</span></button></div><small class="store-note" aria-label="${availability}">${note}</small></article>`;
  }).join("")}</div><p class="store-earn">${icon("coin")} За новый заказ +60 монет</p></div><footer class="tool-shop-footer"><button class="primary" data-action="leave-tools-shop">${toolShopReturn === "game" ? "Вернуться в заказ" : "Вернуться в лавку"}${icon("arrow")}</button></footer></main>`;
}
function openToolsShop(kind: ToolKind | null = null) {
  if (screen !== "tools-shop") toolShopReturn = screen;
  closeModal();
  clearToast();
  shopTool = kind;
  screen = "tools-shop";
  render();
  app.querySelector<HTMLElement>("#tool-shop-heading")?.focus({ preventScroll: true });
  if (kind) app.querySelector(`[data-store-tool="${kind}"]`)?.scrollIntoView({ block: "nearest" });
}
function guidedLesson() {
  if (screen !== "game" || won(current().board)) return null;
  return guidanceMode(chapterNumber(current().definition.id), progress.completed,
    progress.tutorialSeen) === "strict" && current().solution?.length ? "transfer" : null;
}
function guided() {
  return !!guidedLesson();
}
function guideMove(): Move | null {
  return guided() ? (current().solution?.[0] ?? null) : null;
}
function activeHint() {
  return guideMove();
}
function gentleGuidance() {
  if (screen !== "game" || externalChanged || won(current().board)) return false;
  const number = chapterNumber(current().definition.id);
  return guidanceMode(number, progress.completed, progress.tutorialSeen) === "gentle";
}
function updateGentleGuide() {
  app.querySelectorAll(".gentle-source,.gentle-dest,.gentle-tool").forEach(el => {
    el.classList.remove("gentle-source", "gentle-dest", "gentle-tool");
    el.removeAttribute("aria-describedby");
  });
  const instruction = app.querySelector<HTMLElement>("#gentle-instruction");
  if (instruction) instruction.textContent = "";
  if (screen !== "game" || externalChanged || modal || busy || won(current().board)) return;
  if (toolLesson) {
    const target = app.querySelector<HTMLElement>('[data-action="hint"]');
    target?.classList.add("gentle-tool");
    target?.setAttribute("aria-describedby", "gentle-instruction");
    if (instruction) instruction.textContent = "Кнопка покажет проверенный ход. Первый показ бесплатный.";
    return;
  }
  const attempt = current(), board = attempt.board;
  const automatic = gentleGuidance();
  if (automatic && gentleBoard !== board) {
    gentleBoard = board;
    gentleStep = null;
    gentlePending = false;
    const path = attempt.solution ?? cachedHint(attempt);
    const number = chapterNumber(attempt.definition.id);
    if ((number === 2 || number === 3) && path?.length && finishes(board, path)) {
      gentleStep = path[0];
    } else if (hasMoves(board)) {
      gentlePending = true;
      // Keep play available while verifying a new path after a free choice or undo.
      void job<SearchResult>({ kind: "hint", board, path }).then(result => {
        if (externalChanged || progress.attempt !== attempt ||
            attempt.board !== board || gentleBoard !== board) return;
        gentlePending = false;
        if (result.status === "solved" && result.path?.length && finishes(board, result.path)) {
          attempt.solution = clone(result.path);
          gentleStep = result.path[0];
          persist();
        }
        updateGentleGuide();
      }).catch(() => {
        if (gentleBoard === board) gentlePending = false;
        // A failed or bounded search supplies no unverified recommendation.
      });
    }
  }
  const step = automatic ? gentleStep : highlighted;
  if (!step) return;
  const placing = samePosition(selected, step[0]);
  const target = app.querySelector<HTMLElement>(positionSelector(step[placing ? 1 : 0]));
  if (!target) return;
  target.classList.add(placing ? "gentle-dest" : "gentle-source");
  target.setAttribute("aria-describedby", "gentle-instruction");
  if (instruction) {
    const good = board.shelves[step[0][0]].front[step[0][1]]!;
    instruction.textContent = placing
      ? `Перенеси предмет в золотую рамку: полка ${step[1][0] + 1}, место ${step[1][1] + 1}.`
      : `Выбери предмет в золотой рамке: ${itemFor(good).name}.`;
  }
}
function startLesson(number: number) {
  if (number > 3) return;
  const key = CHAPTER[number - 1]?.lesson;
  toolLesson = key === "tools" && !isCompleted(progress.completed, number) &&
    !progress.tutorialSeen.includes("spotlight-tools");
  if (!key || progress.tutorialSeen.includes(`spotlight-${key}`)) return;
  if (toolLesson) render();
  updateCoach(true);
  track("lesson_start", current().definition.id, { lesson: key });
}
function completeLesson(key: string) {
  const id = `spotlight-${key}`;
  if (!progress.tutorialSeen.includes(id)) progress.tutorialSeen.push(id);
  toolLesson = false;
  track("lesson_done", current().definition.id, { lesson: key });
  persist();
}
function coachSelector() {
  if (screen !== "game" || modal || busy || externalChanged) return null;
  const step = activeHint();
  return step ? positionSelector(selected ? step[1] : step[0]) : null;
}
function updateCoach(focus = false) {
  // Restore only buttons disabled by coaching; preserve gameplay restrictions.
  app.querySelectorAll<HTMLButtonElement>("[data-coach-disabled]").forEach((el) => {
    el.disabled = false;
    delete el.dataset.coachDisabled;
  });
  app.querySelectorAll('[aria-describedby="coach-instruction"]').forEach(el => el.removeAttribute("aria-describedby"));
  const selector = coachSelector();
  const target = selector ? app.querySelector<HTMLElement>(selector) : null;
  coach.replaceChildren();
  updateGentleGuide();
  if (!target) return;
  app.querySelectorAll<HTMLButtonElement>("button").forEach((el) => {
    if (el !== target && el.dataset.action !== "debug-menu" && !el.disabled) {
      el.dataset.coachDisabled = "true";
      el.disabled = true;
    }
  });
  const port = app.querySelector(".puzzle-layout")!.getBoundingClientRect();
  let r = target.getBoundingClientRect();
  if (r.top < port.top + 4 || r.bottom > port.bottom - 4) {
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    r = target.getBoundingClientRect();
  }
  const label = selected ? "Сюда" : "Возьми";
  const shadeTop = app.querySelector(".game-topbar")!.getBoundingClientRect().bottom - r.top + 4;
  coach.innerHTML = `<div class="coach-spotlight" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;--coach-shade-top:${shadeTop}px" aria-hidden="true"><span class="coach-hand">${icon("hand")}</span></div><div class="coach-label" id="coach-instruction" role="status" style="left:${Math.max(8, Math.min(innerWidth - 140, r.left + r.width / 2 - 66))}px;top:${Math.max(68, r.top - 42)}px">${label}${icon("arrow")}</div><button class="coach-skip" data-action="skip-lesson">Пропустить</button>`;
  target.setAttribute("aria-describedby", "coach-instruction");
  if (focus || (document.activeElement !== target && !coach.contains(document.activeElement)
    && !(document.activeElement as HTMLElement | null)?.closest('[data-action="debug-menu"]')))
    target.focus({ preventScroll: true });
}
function gameHTML() {
  const attempt = current(),
    def = attempt.definition,
    board = attempt.board;
  const goalCount = Object.keys(board.goals).length;
  const stuck = !won(board) && !hasMoves(board);
  const story = CHAPTER[chapterNumber(def.id)! - 1];
  const project = projectById(story.phaseId)!;
  const area = CAMPAIGN_AREAS.find(a => a.id === project.areaId)!;
  const appearance = currentAppearance()!;
  const repairOrder = appearance.kind === "repair";
  const orderLabel = `${repairOrder ? "РЕМОНТ" : area.shortName.toUpperCase()} · ${story.localNumber} / ${project.orderTarget}`;
  const status = stuck ? (board.budget !== null && board.used >= board.budget
    ? "Ходы закончились. Отмени ход или начни заново." : "Нет свободных мест. Отмени ход или начни заново.") : "";
  return `<div class="game-backdrop" aria-hidden="true"></div>
    <header class="topbar game-topbar"><button class="round cream" data-action="home" aria-label="Вернуться в лавку">${icon("home")}</button>${debugButton()}<div class="level-title"><span>${orderLabel}${board.budget !== null ? ` · ХОДЫ ${board.budget - board.used}` : ""}</span><h1 id="order-heading" tabindex="-1" title="${escapeHTML(appearance.line)}" aria-describedby="order-purpose">${escapeHTML(appearance.title)}</h1></div><div class="top-actions">${stats()}${settingsButton()}</div></header>
    <main class="puzzle-layout">
      <section class="puzzle rows-${Math.ceil(def.shelves.length / 2)} ${repairOrder ? "repair-order" : "food-order"}" data-order-kind="${appearance.kind}" aria-label="Игровое поле"><span id="order-purpose" class="visually-hidden">${escapeHTML(appearance.customer)}. ${escapeHTML(appearance.line)} Награда: ${repairOrder ? "1 ремкомплект" : "1 звезда"} и 60 монет за первую победу.</span><div class="orders goals-${goalCount}" aria-label="${repairOrder ? "Материалы для ремонта" : "Товары для заказа"}">${Object.entries(
        board.goals,
      )
        .map(([key, goal]) => {
          const k = key as Good,
            n = board.delivered[k] ?? 0;
          return `<div class="order-card ${n === goal ? "fulfilled" : ""}" data-order="${k}" aria-label="${itemFor(k).name}: ${n} из ${goal}">${goodImage(k)}<div><strong>${n}<small> / ${goal}</small></strong></div>${n === goal ? `<i class="done-icon">${icon("check")}</i>` : ""}</div>`;
        })
        .join("")}</div>
      <div class="board-wrap"><div class="board shelves-${def.shelves.length}" aria-label="Полки">${board.shelves
        .map((sh, i) => {
          if (sh.reserve) return "";
          const events = board.events.filter((e) => e.shelf === i);
          const stock = hiddenStock(sh);
          const stockLabel = stock.map(([good, count]) => `${itemFor(good).name}: ${count}`).join(", ");
          const stockPreview = sh.opened && sh.rear.length ? `<div class="rear-preview" aria-label="Запас во всех скрытых рядах: ${stockLabel}. Освободи полку, чтобы открыть следующий ряд.">${stock.map(([good, count]) => `<span class="rear-stock">${goodImage(good)}<b><span class="stock-times">×</span>${count}</b></span>`).join("")}</div>` : "";
          const rows = sh.rear.length;
          const rowWord = rows % 100 >= 11 && rows % 100 <= 14 ? "рядов"
            : rows % 10 === 1 ? "ряд" : rows % 10 >= 2 && rows % 10 <= 4 ? "ряда" : "рядов";
          const stockBadge = rows ? `<span class="rear-badge" aria-label="Запас: ${rows} ${rowWord}">${icon("layers")}<span><span class="stock-label">Запас · </span>${rows}<span class="stock-label"> ${rowWord}</span></span></span>` : "";
          return `<div class="shelf ${!sh.opened ? "locked" : ""} ${events.some((e) => e.type === "unlock") ? "just-unlocked" : ""}" data-shelf="${i}"><div class="shelf-footer"><span>${i + 1}</span>${stockPreview}${stockBadge}</div>${sh.opened ? `<div class="shelf-tray"></div><div class="slots">${sh.front.map((k, j) => slotHTML(k, [i, j])).join("")}</div>` : `<div class="shelf-tray"></div><div class="crate-cover">${icon("lock")}<span>${board.triples} / ${sh.unlockAfter}</span></div>`}</div>`;
        })
        .join("")}</div></div>
      <div class="tools" aria-label="Дополнительная помощь">${toolHTML("hint", stuck ? "Как выйти" : "Подсказка")}${toolHTML("mix", "Смешать")}${board.shelves.some(sh => sh.reserve) ? `<div class="tool tray-tool" role="group" aria-label="Лоток для одного предмета"><span class="tool-label"><span class="tool-name">Лоток</span></span>${slotHTML(board.shelves[board.shelves.length - 1].front[0], [board.shelves.length - 1, 0])}</div>` : toolHTML("reserve", "Лоток")}</div>
      <div class="utility-bar"><button data-action="undo" ${!attempt.undo.length || won(board) ? "disabled" : ""} class="quiet ${stuck ? "recover-action" : ""}" aria-label="Отмена">${icon("undo")} Отмена</button><button class="quiet" data-action="restart" aria-label="Заново">${icon("restart")} Заново</button><button class="quiet game-store-link" data-action="tools-shop" aria-label="Магазин помощи">${icon("store")} Магазин</button><button class="mobile-help quiet" data-action="help" aria-label="Как играть">${icon("help")}</button>${toolLesson || highlighted ? `<button class="quiet" data-action="skip-lesson" aria-label="${toolLesson ? "Пропустить" : "Скрыть подсказку"}">${icon("close")}${toolLesson ? "Пропустить" : "Скрыть подсказку"}</button>` : ""}</div>
      <span class="visually-hidden" role="status">${status}</span>
      <span id="gentle-instruction" class="visually-hidden" role="status"></span>
      </section>
    </main>`;
}
function slotHTML(good: Good | null, position: Position) {
  const step = activeHint();
  const hintSource = step && samePosition(step[0], position);
  const hintDest = step && samePosition(step[1], position);
  const place = current().board.shelves[position[0]]?.reserve ? "Лоток" : `Полка ${position[0] + 1}, место ${position[1] + 1}`;
  return `<button class="slot ${good ? "occupied" : "empty"} ${samePosition(selected, position) ? "selected" : ""} ${hintSource ? "hint-source" : ""} ${hintDest ? "hint-dest" : ""}" data-slot="${position.join(",")}" aria-label="${place}: ${good ? itemFor(good).name : "свободно"}" aria-pressed="${samePosition(selected, position)}">${good ? goodImage(good) : '<span class="empty-mark">+</span>'}</button>`;
}
function toolHTML(kind: ToolKind, name: string) {
  const tool = TOOLS.find(tool => tool.id === kind)!;
  const count = progress.inventory[kind];
  const locked = !toolUnlocked(progress, kind);
  const board = current().board;
  const unavailable = (kind === "mix" && !hasMoves(board)) ||
    (kind === "reserve" && board.budget !== null && board.used >= board.budget);
  const freeHint = kind === "hint" &&
    (!hasMoves(board) || guided() || gentleGuidance() || toolLesson || !!cachedHint(current()));
  const empty = !locked && !freeHint && !count;
  const stock = locked ? `Заказ ${tool.afterOrder + 1}` : unavailable ? "Нет ходов" : freeHint ? "Бесплатно" : empty ? "В магазине" : `Есть: ${count}`;
  return `<button class="tool ${empty ? "tool-empty" : ""}" data-action="${empty ? "tools-shop" : kind}" ${empty ? `data-tool="${kind}"` : ""} aria-label="${name} ${stock}" title="${tool.description}${empty ? " Купить в магазине помощи." : " Дополнительная помощь: все заказы можно пройти без неё."}" ${locked || unavailable || busy || won(board) ? "disabled" : ""}><span class="tool-circle">${icon(kind)}</span><span class="tool-label"><span class="tool-name">${name}</span><span class="tool-stock">${stock}</span></span></button>`;
}
async function start(number: number, force = false) {
  cancelDebugAuto();
  if (busy || externalChanged || !isProjectOrderUnlocked(progress.completed, progress.campaign, number)) return;
  const projectId = CHAPTER[number - 1].phaseId as ProjectId;
  if (projectId !== progress.selectedProject && !selectProject(progress, projectId)) return;
  if (
    !force &&
    progress.attempt &&
    !won(progress.attempt.board) &&
    chapterNumber(progress.attempt.definition.id) !== number
  ) {
    pendingLevel = number;
    showModal(
      "switch",
      `<h2>Сменить заказ?</h2><p>Текущая попытка будет заменена</p><button class="primary" data-action="confirm-switch">Сменить</button><button class="secondary" data-action="keep-order">Продолжить</button>`,
    );
    return;
  }
  clearTimeout(toastTimer);
  toolLesson = false;
  toastElement.classList.remove("visible");
  toastElement.textContent = "";
  busy = true;
  closeModal();
  if (
    !force &&
    progress.attempt &&
    chapterNumber(progress.attempt.definition.id) === number &&
    !won(progress.attempt.board)
  ) {
    screen = "game";
    selected = null;
    highlighted = null;
    busy = false;
    render();
    focusGame();
    startLesson(number);
    return;
  }
  showModal(
    "loading",
    `<div class="loading-shell">${icon("shell")}</div><h2>Готовим заказ…</h2>`,
    false,
  );
  try {
    const definition = await loadChapterLevel(number);
    if (externalChanged) return;
    validateDefinition(definition);
    if (chapterNumber(definition.id) !== number)
      throw new Error(
        "Получен другой заказ. Попробуйте открыть заказ ещё раз.",
      );
    progress.attempt = {
      id: crypto.randomUUID(),
      definition,
      appearance: createOrderAppearance(definition),
      board: initial(definition),
      undo: [],
      solution: clone(definition.verifiedSolution),
      mixCount: 0,
      hints: {},
      reward: null,
    };
    const key = structuralKey(definition);
    progress.recentStructures = [
      ...progress.recentStructures.filter((k) => k !== key),
      key,
    ].slice(-12);
    track("order_start", definition.id, {
      replay: isCompleted(progress.completed, number),
    });
    persist();
    screen = "game";
    selected = null;
    highlighted = null;
    closeModal();
    render();
    app.querySelector<HTMLElement>("#order-heading")?.focus();
    startLesson(number);
  } catch (error) {
    if (externalChanged) return;
    closeModal();
    toast(error instanceof Error ? error.message : "Не удалось открыть заказ.");
  } finally {
    busy = false;
    render();
  }
}
function selectSlot(position: Position) {
  cancelDebugAuto();
  if (
    externalChanged ||
    busy ||
    screen !== "game" ||
    modal ||
    won(current().board) ||
    document.hidden
  )
    return;
  const sh = current().board.shelves[position[0]];
  if (!sh?.opened) return;
  const step = activeHint();
  if (step && !samePosition(selected ? step[1] : step[0], position)) return;
  if (sh.front[position[1]]) {
    selected = samePosition(selected, position) ? null : position;
    audio.play("take");
    renderSelection();
  } else if (selected) move(selected, position);
  else toast("Выбери предмет");
}
function renderSelection() {
  document.querySelectorAll<HTMLElement>("[data-slot]").forEach((el) => {
    const p = el.dataset.slot!.split(",").map(Number) as Position;
    const active = samePosition(selected, p);
    el.classList.toggle("selected", active);
    el.setAttribute("aria-pressed", String(active));
    el.classList.toggle(
      "available",
      !!selected && el.classList.contains("empty"),
    );
  });
  updateCoach();
}
function move(from: Position, to: Position, source: "player" | "debug" = "player"): boolean {
  if (source === "player") cancelDebugAuto();
  if (externalChanged || busy || modal || document.hidden) return false;
  const lesson = guidedLesson(), step = activeHint();
  if (step && (!samePosition(step[0], from) || !samePosition(step[1], to))) return false;
  const attempt = current();
  const before = attempt.board;
  const next = applyMove(before, from, to);
  if (!next) {
    toast("Нужно свободное место");
    return false;
  }
  const sourceRect = app
    .querySelector(positionSelector(from))
    ?.getBoundingClientRect();
  const targetRect = app
    .querySelector(positionSelector(to))
    ?.getBoundingClientRect();
  const good = before.shelves[from[0]].front[from[1]]!;
  attempt.undo.push(clone(before));
  if (attempt.undo.length > 30) attempt.undo.shift();
  const first = attempt.solution?.[0];
  attempt.solution =
    first && samePosition(first[0], from) && samePosition(first[1], to)
      ? attempt.solution!.slice(1)
      : null;
  attempt.board = next;
  track("move", attempt.definition.id, {
    used: next.used,
    triples: next.triples,
  });
  if (!won(next) && !hasMoves(next)) track("blocked", attempt.definition.id);
  selected = null;
  highlighted = null;
  const victory = won(next);
  const practiceLesson = CHAPTER[chapterNumber(attempt.definition.id)! - 1]?.lesson;
  if (victory && (lesson || practiceLesson === "rear" || practiceLesson === "crate"))
    completeLesson(lesson ?? practiceLesson!);
  if (victory) {
    completeAttempt(progress, today());
    track("order_win", attempt.definition.id, { moves: next.used });
  }
  persist();
  render();
  audio.play(next.events.some((e) => e.type === "triple") ? "ship" : "place");
  if (
    !progress.settings.reducedMotion &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    sourceRect &&
    targetRect
  ) {
    const ghost = document.createElement("div");
    ghost.className = "flying-good";
    ghost.innerHTML = goodImage(good);
    Object.assign(ghost.style, {
      left: `${sourceRect.x}px`,
      top: `${sourceRect.y}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
    });
    document.body.append(ghost);
    const animation = ghost.animate(
      [
        { transform: "translate(0,0) scale(1.08)", opacity: 1 },
        {
          transform: `translate(${targetRect.x - sourceRect.x}px,${targetRect.y - sourceRect.y}px) scale(1)`,
          opacity: 0.3,
        },
      ],
      { duration: 180, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
    animation.onfinish = () => ghost.remove();
    next.events
      .filter((e) => e.type === "triple")
      .forEach((event) => {
        const el = app.querySelector(`[data-order="${event.good}"]`);
        el?.classList.add("just-shipped");
        const shelf = app.querySelector(`[data-shelf="${event.shelf}"]`);
        if (shelf) {
          const sparks = document.createElement("div");
          sparks.className = "shipment";
          sparks.innerHTML = `${icon("check")}<b>+3</b>`;
          shelf.append(sparks);
          setTimeout(() => sparks.remove(), 850);
        }
      });
  }
  const opened = next.events.find((e) => e.type === "unlock");
  if (!victory && !hasMoves(next)) toast("Нет ходов. Отмени ход или начни заново — это бесплатно.");
  else if (opened) toast(`Полка ${opened.shelf + 1} открыта!`);
  else if (next.events.some(e => e.type === "reveal")) toast("Новый ряд!");
  if (victory) {
    audio.play("win");
    showResult();
  }
  return true;
}
function showModal(
  name: string,
  content: string,
  closable = true,
  wide = false,
) {
  cancelDebugAuto();
  endDrag(undefined, true);
  if (!modal) lastFocus = document.activeElement as HTMLElement;
  modal = name;
  audio.pause(document.hidden || !document.hasFocus());
  overlay.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? "wide" : ""} modal-${name}" role="dialog" aria-modal="true" aria-label="${
    (
      {
        settings: "Настройки",
        debug: "Дебаг",
        "scene-shop": "Магазин оформления",
        switch: "Смена заказа",
        unsupported: "Обновление игры",
        result: "Заказ готов",
        navigation: "Помещения и зоны",
        renovation: "Оформление лавки",
        task: "Обустройство лавки",
        levels: "Книжка заказов",
        help: "Как играть",
        restart: "Начать заново",
        loading: "Загрузка",
        needCoins: "Помощь",
      } as Record<string, string>
    )[name] ?? "Лавка у моря"
  }">${closable ? `<button class="modal-close round cream" data-action="close" aria-label="Закрыть">${icon("close")}</button>` : ""}${content}</section></div>`;
  void mountHallCanvases(overlay);
  app.inert = true;
  updateCoach();
  queueMicrotask(() =>
    overlay.querySelector<HTMLElement>("button,input")?.focus(),
  );
}
function closeModal() {
  overlay.innerHTML = "";
  modal = null;
  app.inert = false;
  audio.pause(document.hidden || !document.hasFocus());
  if (lastFocus?.isConnected) lastFocus.focus();
  updateCoach();
}
function dismissModal() { closeModal(); }
function showResult() {
  clearToast();
  const attempt = current(),
    reward = attempt.reward ?? completeAttempt(progress, today())!;
  const next = nextAvailableOrder(),
    node = repairNext(),
    affordable = node && taskBalance(progress, node) >= node.cost;
  const repairOrder = currentAppearance()?.kind === "repair";
  const rewardCurrency = repairOrder ? "repairKits" : "stars";
  const navigation = navigationState(progress);
  const destination = navigation.nextDestination;
  const returnLabel = `К зданию: ${navigation.currentLabel}`;
  const mainAction = affordable ? "buy-task" : allDone() ? "finish" : next ? "next" : destination ? "continue-journey" : "home";
  const mainLabel = affordable ? `Выполнить · ${node.cost} ${currencyIcon(node.currency)}`
    : allDone() ? "Во двор" : next ? "Дальше" : destination ? destination.actionLabel : returnLabel;
  const guidance = affordable ? `Можно выполнить: ${node.name}.` : navigation.remainingOrders === 0
    ? affordable ? "Все заказы выполнены. Завершите обустройство здания, чтобы открыть следующий участок."
      : destination ? `Здесь всё готово. Дальше — ${projectSpaceName(destination.projectId).toLocaleLowerCase("ru-RU")}.` : ""
    : "";
  persist();
  showModal(
    "result",
    `<div class="result-badge">${icon("check")}</div><h2>${repairOrder ? "Материалы собраны!" : "Заказ готов!"}</h2><div class="reward-row"><div>${icon("coin")}<strong>+${reward.coins}</strong><span>монет</span></div><div class="reward-${rewardCurrency}">${currencyIcon(rewardCurrency)}<strong>+${reward[rewardCurrency]}</strong><span>${reward.fresh ? repairOrder ? "на ремонт" : "на обустройство" : "Повтор"}</span></div></div>${guidance ? `<p class="result-next-step">${guidance}</p>` : ""}<button class="primary ${["next", "buy-task", "continue-journey"].includes(mainAction) ? "game-guidance" : ""}" ${["next", "buy-task", "continue-journey"].includes(mainAction) ? 'data-guide="result-next"' : ""} data-action="${mainAction}" ${affordable ? `data-task-id="${node.id}"` : destination && mainAction === "continue-journey" ? `data-project="${destination.projectId}"` : ""}>${mainLabel}${icon("arrow")}</button><button class="quiet" data-action="home">${returnLabel}${icon("home")}</button>`,
    false,
  );
}
const currentSceneViews=()=>buildingRooms(progress,progress.selectedProject);
function roomCards(rooms:BuildingRoom[],currentView?:CampaignView){
  return `<div class="navigation-view-grid">${rooms.map(room=>{
    const current=room.id===currentView&&room.projectId===progress.selectedProject;
    const ready=room.total>0&&room.completed===room.total;
    return `<button class="navigation-view-card ${room.recommended?'room-next':''} ${current?'room-current':''}" data-action="shop-view" data-view="${room.id}" data-project="${room.projectId}" aria-label="${room.name}" aria-pressed="${current}"><span class="navigation-view-preview" aria-hidden="true">${campaignSceneHTML(progress.campaign.completedTasks,assets,{areaId:projectById(room.projectId)!.areaId,phaseId:room.projectId,view:room.id,decorations:progress.renovations,decor:sceneShopDecorations(progress)})}</span><strong>${room.name}</strong><small>${current?'Вы здесь':room.recommended?'Следующая работа':ready?'Обустройство готово':room.kind}</small><span class="room-progress" role="progressbar" aria-label="Обустройство: ${room.name}" aria-valuemin="0" aria-valuemax="${room.total}" aria-valuenow="${room.completed}" style="--room-progress:${room.total?room.completed/room.total*100:0}%"><i></i></span><span class="room-card-action">${room.recommended?'Продолжить':ready?'Осмотреть':'Перейти'}${icon('arrow')}</span></button>`;
  }).join('')}</div>`;
}
function buildingRoomsModal(projectId:ProjectId){
  const project=projectById(projectId),rooms=buildingRooms(progress,projectId);
  if(!project||!rooms.length)return;
  const area=CAMPAIGN_AREAS.find(area=>area.id===project.areaId)!;
  showModal('navigation',`<h2>${area.shortName}</h2><div class="navigation-breadcrumb">${icon('globe')}<span>Карта двора</span>${icon('arrow')}<span class="navigation-current">${area.shortName}</span></div><h3 class="navigation-room-heading">Куда перейти?</h3><p class="navigation-room-description navigation-intro">Помещения и зоны здания</p>${roomCards(rooms)}<button class="quiet" data-action="close">Назад к карте${icon('back')}</button>`);
}
function navigationModal() {
  const navigation = navigationState(progress);
  const project = navigation.currentProject;
  const view = (app.querySelector<HTMLElement>(".shop-composition")?.dataset.sceneView
    ?? shopView ?? navigationView) as CampaignView | undefined;
  const views = currentSceneViews();
  const notice = navigation.warehouseNotice;
  showModal("navigation", `<h2>Двор у моря</h2><div class="navigation-breadcrumb">${icon("globe")}<span>Двор</span>${icon("arrow")}<span class="navigation-current">${navigation.currentLabel}</span></div><button class="navigation-up" data-action="show-map"><img src="${assets}coastal-map-cleared-v1.webp" width="96" height="64" alt=""/><span class="navigation-up-copy"><strong>На карту двора</strong><span>Все здания и новые участки</span></span>${icon("arrow")}</button>${navigation.nextDestination?`<button class="navigation-notice game-guidance" data-guide="next-place" data-action="continue-journey" data-project="${navigation.nextDestination.projectId}">${icon('arrow')}<span><strong>${navigation.nextDestination.actionLabel}</strong><span>Следующее помещение для обустройства</span></span></button>`:notice?.kind==='new'&&project.areaId!=='warehouse'?`<button class="navigation-notice game-guidance" data-guide="new-warehouse" data-action="continue-journey" data-project="warehouse-1">${icon('reserve')}<span><strong>Открыт склад</strong><span>Начните восстановление</span></span>${icon('arrow')}</button>`:''}<h3 class="navigation-room-heading">Помещения и зоны</h3>${roomCards(views,view)}`);
}

function settingsModal() {
  showModal(
    "settings",
    `<h2>Настройки</h2><div class="settings-list">${(["sound", "music", "reducedMotion"] as const).map((key) => `<label class="setting-row"><span>${icon(key === "sound" ? "sound" : key === "music" ? "music" : "wave")}<span><strong>${{ sound: "Звуки", music: "Музыка", reducedMotion: "Меньше движения" }[key]}</strong></span></span><input type="checkbox" data-setting="${key}" ${progress.settings[key] ? "checked" : ""}/><i class="toggle"></i></label>`).join("")}</div><button class="secondary" data-action="close">Готово${icon("check")}</button>${debugButton()}${new URLSearchParams(location.search).has("playtest") ? `<button class="quiet" data-action="export-events">Скачать отчёт этой сессии</button>` : ""}<p class="save-note">${storageWarned ? "Сохранение недоступно — игра работает в этой вкладке." : "Сохранено в браузере"}</p>`,
  );
}
function sceneShopModal() {
  showModal('scene-shop', sceneShopHTML(progress, assets, { previewId:sceneShopPreview,
    renderPreview: decor => hallSceneHTML(progress.campaign.completedTasks,assets,progress.renovations,{view:'hall',decor}),
  }),true,true);
}
const pauseScene=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function buyTaskWithReveal(taskId:string) {
  if(busy||externalChanged||buildReveal)return;
  const task=repairNext();
  if(!task||task.id!==taskId||taskBalance(progress,task)<task.cost)return;
  const reduced=progress.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  busy=true;
  app.querySelectorAll<HTMLButtonElement>('button:not([disabled])').forEach(button=>{
    button.disabled=true;button.dataset.busyDisabled='true';
  });
  closeModal();
  clearToast();
  screen='shop';shopView=sceneTaskView(taskId);justBuilt=undefined;
  buildReveal={taskId,name:task.name,phase:'preparing'};
  try {
    const currentRoom=app.querySelector<HTMLElement>('.world-scene > .shop-composition');
    let prepared:Awaited<ReturnType<typeof prepareHallScene>>|undefined;
    if(!currentRoom||currentRoom.dataset.sceneView!==shopView||(currentRoom.classList.contains('hall-composition')&&currentRoom.dataset.sceneReady!=='true')) {
      const template=document.createElement('template');template.innerHTML=shopHTML();
      const room=template.content.querySelector<HTMLElement>('.world-scene > .shop-composition');
      if(room?.classList.contains('hall-composition'))prepared=await prepareHallScene(room);
      else if(room){await decodeSpriteScene(room);prepared={scene:room,release:()=>{}};}
    }
    try {render(true,prepared?.scene);} finally {prepared?.release();}
    await mountHallCanvases(app);
    const surface=app.querySelector<HTMLElement>('.world-scene > .hall-composition');
    if(surface&&surface.dataset.sceneReady!=='true')throw new Error('Сцена ещё не загрузилась. Попробуйте ещё раз.');
    await pauseScene(reduced?150:650);
    if(externalChanged||!purchaseProjectTask(progress,taskId))throw new Error('Не удалось выполнить работу.');
    persist();
    justBuilt=taskId;
    buildReveal={taskId,name:task.name,phase:'revealing'};
    let spriteRoom:HTMLElement|undefined;
    if(!app.querySelector('.world-scene > .hall-composition')) {
      const template=document.createElement('template');template.innerHTML=shopHTML();
      spriteRoom=template.content.querySelector<HTMLElement>('.world-scene > .shop-composition')??undefined;
      if(spriteRoom)await decodeSpriteScene(spriteRoom);
    }
    render(true,spriteRoom);
    await mountHallCanvases(app);
    audio.play('repair');
    track('campaign_task',undefined,{task:taskId});
    await pauseScene(reduced?180:1450);
    buildReveal=undefined;
    justBuilt=undefined;
    busy=false;
    // Balances and the next goal were already rendered before the effect.
    // Replacing that finished room would expose a blank/new canvas for a frame.
    finishSceneReveal(app);
    app.querySelectorAll<HTMLButtonElement>('button[data-busy-disabled]').forEach(button=>{
      button.disabled=false;
      delete button.dataset.busyDisabled;
    });
    if(!modal&&!externalChanged)app.querySelector<HTMLElement>('.world-main-action')?.focus({preventScroll:true});
  } catch(error) {
    buildReveal=undefined;justBuilt=undefined;busy=false;finishSceneReveal(app);render(true);
    toast(error instanceof Error?error.message:'Не удалось выполнить работу.');
  } finally { busy=false; }
}
function debugModal() {
  const number = progress.attempt && !won(progress.attempt.board)
    ? chapterNumber(progress.attempt.definition.id) : nextAvailableOrder();
  showModal("debug", `<h2>Дебаг</h2><div class="debug-menu"><p>Автопрохождение выполняет обычные ходы по проверенному решению. Помощь не расходуется.</p><p class="debug-status">${number ? escapeHTML(progress.attempt && chapterNumber(progress.attempt.definition.id) === number ? progress.attempt.appearance?.title ?? orderSummary(CHAPTER[number - 1].id).title : orderSummary(CHAPTER[number - 1].id).title) : "Нет открытого незавершённого заказа"}</p><button class="primary" data-action="debug-auto" ${number ? "" : "disabled"}>Пройти уровень</button><button class="secondary" data-action="debug-restart" ${screen === "game" && progress.attempt ? "" : "disabled"}>Заново этот уровень</button><button class="secondary" data-action="debug-orders">Заказы здания</button>${debugSceneHTML(progress)}<button class="quiet" data-action="close">Закрыть</button></div>`);
}
async function debugAutoOrder() {
  if (externalChanged || busy) return;
  closeModal();
  if (progress.attempt && won(progress.attempt.board) && !progress.attempt.reward) {
    screen = "game";
    render();
    showResult();
    return;
  }
  let request = debugRequest;
  if (screen !== "game" || !progress.attempt || won(progress.attempt.board)) {
    const number = progress.attempt && !won(progress.attempt.board)
      ? chapterNumber(progress.attempt.definition.id) : nextAvailableOrder();
    if (!number) return;
    const opening = start(number);
    request = debugRequest;
    await opening;
  }
  if (request !== debugRequest || screen !== "game" || modal || !progress.attempt || won(progress.attempt.board)) return;
  selected = null;
  highlighted = null;
  await debugPlayer.start();
}
function renovationModal(target: RenovationId = ownedDecorations()[0]?.id ?? "counter", focusTab = false) {
  repairTarget = target;
  const node = RENOVATIONS.find((r) => r.id === target)!,
    color = progress.renovations[target] ?? "sea",
    owned = ownedDecorations().some(r => r.id === target);
  if (!owned) return;
  const note = "Смена цвета бесплатна.";
  const preview = hallCounterPreviewHTML(assets, color);
  showModal(
    "renovation",
    `<div class="repair-header"><h2>Оформление лавки</h2></div>
    <div class="repair-tabs" role="tablist" aria-label="Что оформить">${ownedDecorations().map(r =>
      `<button class="repair-tab ${r.id === target ? "active" : ""}" role="tab" id="repair-tab-${r.id}" aria-controls="repair-panel-${r.id}" aria-selected="${r.id === target}" tabindex="${r.id === target ? 0 : -1}" data-repair="${r.id}">${icon(r.icon)}<span>${r.name}</span></button>`).join("")}</div>
    <div class="repair-content" role="tabpanel" id="repair-panel-${target}" aria-labelledby="repair-tab-${target}" tabindex="0">
      <div class="repair-preview preview-${target} ${color}" id="sign-preview" role="img" aria-label="Предпросмотр: ${node.name}, ${COLORS[color]}">${preview}</div>
      <fieldset class="color-choices"><legend>Цвет оформления</legend><div class="color-grid">${(Object.keys(COLORS) as RenovationColor[]).map(c =>
        `<label class="color-choice ${c} ${c === color ? "chosen" : ""}"><input type="radio" name="repair-color" data-color="${c}" value="${c}" ${c === color ? "checked" : ""} /><i aria-hidden="true"></i><span>${COLORS[c]}</span></label>`).join("")}</div></fieldset>
    </div>${ownedDecorations().filter(r => r.id !== target).map(r => `<div role="tabpanel" id="repair-panel-${r.id}" aria-labelledby="repair-tab-${r.id}" hidden></div>`).join("")}
    <div class="repair-footer">${note ? `<p class="repair-note">${note}</p>` : ""}<button class="primary" data-action="close" data-choice="${color}">Готово</button></div>`,
  );
  if (focusTab) queueMicrotask(() => overlay.querySelector<HTMLElement>(`#repair-tab-${target}`)?.focus());
}
function selectRepairColor(color: RenovationColor) {
  overlay.querySelectorAll<HTMLInputElement>("[data-color]").forEach(input => {
    input.closest(".color-choice")?.classList.toggle("chosen", input.checked);
  });
  const preview = overlay.querySelector<HTMLElement>("#sign-preview")!;
  preview.className = `repair-preview preview-${repairTarget} ${color}`;
  preview.innerHTML = hallCounterPreviewHTML(assets, color);
  preview.setAttribute("aria-label", `Предпросмотр: ${RENOVATIONS.find(r => r.id === repairTarget)!.name}, ${COLORS[color]}`);
  const button = overlay.querySelector<HTMLButtonElement>(".repair-footer .primary")!;
  button.dataset.choice = color;
  if (renovationOwned(progress, repairTarget)) {
    const changed = color !== (progress.renovations[repairTarget] ?? "sea");
    button.dataset.action = changed ? "buy-renovation" : "close";
    button.textContent = changed ? "Применить цвет" : "Готово";
  }
}
function levelsModal() {
  const project = projectById(progress.selectedProject)!;
  const entries = CHAPTER.map((level, index) => ({ level, number: index + 1 })).filter(e => e.level.phaseId === project.id);
  const done = entries.filter(e => isCompleted(progress.completed, e.number)).length;
  showModal("levels", `<span class="eyebrow">${projectSpaceName(project.id).toUpperCase()}</span><h2>Заказы</h2>
    <p>Выполнено ${done} из ${project.orderTarget}. Строительные задания дают ремкомплекты для ремонта. Продуктовые заказы — звёзды для обустройства.</p>
    <div class="level-list">${entries.map(({level, number}) => {
      const completed = isCompleted(progress.completed, number);
      const unlocked = isProjectOrderUnlocked(progress.completed, progress.campaign, number, project.id);
      const summary = orderSummary(level.id);
      const construction = summary.kind === "repair";
      const previousKind = level.localNumber > 1 ? orderSummary(entries[level.localNumber - 2].level.id).kind : null;
      const block = previousKind !== summary.kind ? construction ? "Материалы для ремонта" : "Заказы покупателей" : "";
      return `${block ? `<h3 class="level-block-heading">${block}</h3>` : ""}<button class="level-entry ${completed ? "complete" : ""}" data-level="${number}" ${unlocked ? "" : "disabled"}><span class="level-number">${completed ? icon("check") : level.localNumber}</span><span><strong>${escapeHTML(summary.title)}</strong><small>${construction ? "Ремонт" : "Обустройство"} · +1 ${currencyIcon(construction ? "repairKits" : "stars")}</small></span>${icon(unlocked ? "arrow" : "lock")}</button>`;
    }).join("")}</div><button class="secondary" data-action="show-map">Карта двора${icon("globe")}</button>`, true, true);
}
function helpModal() {
  const appearance = currentAppearance();
  const exampleGoods = progress.attempt ? Object.keys(current().board.goals) as Good[] : ["m", "j"] as Good[];
  const [first, second = first] = exampleGoods;
  showModal(
    "help",
    `<h2>Собери тройку</h2>${appearance ? `<p class="order-brief">${escapeHTML(appearance.line)}</p><p class="order-reward">${currencyIcon(appearance.kind === "repair" ? "repairKits" : "stars")} Первая победа: +1 ${appearance.kind === "repair" ? "ремкомплект на ремонт" : "звезда на обустройство"} и 60 монет.</p>` : ""}<div class="visual-help"><div class="help-transfer">${goodImage(first)}${icon("arrow")}<span class="help-empty">+</span></div><span>Предмет → место</span><div class="help-goods">${goodImage(second)}${goodImage(second)}${goodImage(second)}${icon("arrow")}${icon("check")}</div><span>Три в ряд — готово</span><div class="help-shortcuts"><span>${icon("undo")} Отмена</span><span>${icon("restart")} Заново</span></div></div><div class="help-tools"><p>Все заказы можно пройти обычными переносами. Инструменты — дополнительная помощь.</p><p><strong>${icon("mix")} Смешать</strong> — помогает сменить неудобную расстановку открытых предметов. Запас и выполненная часть заказа сохраняются.</p><p><strong>${icon("reserve")} Лоток</strong> — если предмет мешает собрать тройку, временно убери его в лоток на месте кнопки. Позже верни предмет на полку.</p><p>Помощь пополняется в магазине. Покупка добавляет использование в запас; чтобы применить его, нажми кнопку в заказе.</p></div><button class="primary" data-action="close">Играть${icon("arrow")}</button>`,
  );
}
function hasTool(kind: ToolKind): boolean {
  if (progress.inventory[kind] > 0) return true;
  openToolsShop(kind);
  return false;
}
function consumeTool(kind: ToolKind) {
  progress.inventory[kind]--;
}
async function hint(teaching = false) {
  cancelDebugAuto();
  if (busy || won(current().board)) return;
  if (!hasMoves(current().board)) {
    toast(
      "↶ Отмена или ↻ Заново — бесплатно",
    );
    focusGame(
      current().undo.length
        ? '[data-action="undo"]'
        : '[data-action="restart"]',
    );
    return;
  }
  if (gentleGuidance()) {
    selected = null;
    highlighted = null;
    if (!gentleStep && !gentlePending) gentleBoard = null;
    renderSelection();
    if (gentleStep) focusGame(positionSelector(gentleStep[0]), true);
    else toast(gentlePending ? "Ищем следующий шаг…" : "Шаг не подтверждён. ↶ Отмена");
    return;
  }
  const cached = cachedHint(current());
  if (!cached && !guided() && !teaching && !hasTool("hint")) return;
  const attempt = current(),
    id = attempt.id;
  busy = true;
  toast("Ищем следующий шаг…");
  render();
  try {
    const solution = (await job<SearchResult>({
      kind: "hint", board: attempt.board, path: cached ?? attempt.solution,
    })).path;
    if (externalChanged || progress.attempt?.id !== id) return;
    if (!solution?.length) {
      toast(
        "Шаг не найден. Помощь не потрачена. ↶ Отмена",
      );
      return;
    }
    if (!rememberHint(attempt, solution))
      throw new Error("Шаг не найден. Помощь не потрачена");
    highlighted = solution[0];
    selected = null;
    if (!cached && !guided() && !teaching) consumeTool("hint");
    track("help", attempt.definition.id, { kind: "hint", free: !!cached || guided() || teaching });
    persist();
    clearToast();
  } catch (error) {
    toast(
      error instanceof Error
        ? error.message
        : "Подсказка недоступна. Помощь не потрачена",
    );
  } finally {
    busy = false;
    render();
    renderSelection();
    focusGame(
      highlighted ? positionSelector(highlighted[0]) : '[data-action="hint"]',
      true,
    );
  }
}
async function mix() {
  cancelDebugAuto();
  if (
    busy ||
    !isCompleted(progress.completed, 3) ||
    !hasMoves(current().board) ||
    won(current().board) ||
    !hasTool("mix")
  )
    return;
  const attempt = current(),
    id = attempt.id;
  busy = true;
  toast("Проверяем новую расстановку…");
  render();
  try {
    const result = await job<{ board: Board; solution: Move[] } | null>({
      kind: "mix",
      board: attempt.board,
      seed: `${attempt.definition.seed}:${attempt.id}:${attempt.mixCount}`,
    });
    if (externalChanged || progress.attempt?.id !== id) return;
    if (!result) {
      toast(
        "Не удалось смешать. Помощь не потрачена. ↶ Отмена",
      );
      return;
    }
    if (
      !validateAttempt({
        ...attempt,
        board: result.board,
        solution: result.solution,
        undo: [],
      })
    )
      throw new Error(
        "Новая расстановка не прошла проверку. Помощь не потрачена.",
      );
    consumeTool("mix");
    track("help", attempt.definition.id, { kind: "mix" });
    attempt.board = result.board;
    attempt.solution = result.solution;
    attempt.undo = [];
    attempt.mixCount++;
    selected = null;
    highlighted = null;
    persist();
    audio.play("place");
    toast("Товары смешаны");
  } catch (error) {
    toast(
      error instanceof Error
        ? error.message
        : "Не удалось перемешать. Помощь не потрачена.",
    );
  } finally {
    busy = false;
    render();
    focusGame('[data-action="mix"]');
  }
}
function reserve() {
  cancelDebugAuto();
  if (busy || !isCompleted(progress.completed, 6) || won(current().board))
    return;
  if (
    current().board.budget !== null &&
    current().board.used >= current().board.budget!
  )
    return;
  const next = addReserve(current().board);
  if (!next || !hasTool("reserve")) return;
  consumeTool("reserve");
  track("help", current().definition.id, { kind: "reserve" });
  current().board = next;
  current().undo = [];
  selected = null;
  highlighted = null;
  persist();
  render();
  focusGame(positionSelector([next.shelves.length - 1, 0]));
  clearToast();
}
function undo() {
  cancelDebugAuto();
  const attempt = current();
  if (won(attempt.board)) return;
  const previous = attempt.undo.pop();
  if (!previous) return;
  clearToast();
  attempt.board = previous;
  attempt.solution = null;
  selected = null;
  highlighted = null;
  track("undo", attempt.definition.id);
  persist();
  render();
  if (!attempt.undo.length)
    focusGame(highlighted ? positionSelector(highlighted[0]) : "[data-slot]");
  audio.play("place");
}
function action(name: string, button: HTMLElement) {
  if (externalChanged && name !== "refresh") return;
  if (busy && (buildReveal || !["settings", "close"].includes(name))) return;
  cancelDebugAuto();
  audio.play("button");
  switch (name) {
    case "debug-menu":
      debugModal();
      break;
    case "debug-scene-preset":
      if (["start","middle","built","complete"].includes(button.dataset.preset!)) updateDebugSceneFields(overlay, progress, button.dataset.preset as DebugScenePreset);
      break;
    case "debug-scene-apply": {
      const state=readDebugSceneState(overlay);
      if(!state){toast("Проверьте выбранный этап и числа.");break;}
      // Rewind just the selected work, then use the ordinary purchase/reveal.
      const task=state.works ? projectTasks(state.projectId)[state.works-1] : undefined;
      const result=applyDebugSceneState(progress,{...state,works:state.works-(task?1:0)});
      if(!result.ok){toast(result.message);break;}
      // Closing a game modal refreshes its coach. Leave the order screen before
      // that refresh, since applying a scene deliberately removes its attempt.
      screen="shop";
      selectedArea=projectById(progress.selectedProject)!.areaId;
      shopView=undefined;justBuilt=undefined;buildReveal=undefined;
      selected=null;highlighted=null;gentleBoard=null;gentleStep=null;toolLesson=false;
      persist();closeModal();clearToast();
      if(task)void buyTaskWithReveal(task.id);
      else render();
      break;
    }
    case "debug-scene-currency": {
      const credit=readDebugCurrency(overlay);
      if(!credit||!addDebugCurrency(progress,credit.currency,credit.amount)){toast("Укажите положительное целое количество.");break;}
      persist();render();debugModal();toast("Валюта добавлена");break;
    }
    case "scene-shop":
      sceneShopPreview=undefined;sceneShopModal();break;
    case "scene-shop-preview":
      sceneShopPreview=button.dataset.item;sceneShopModal();break;
    case "scene-shop-buy": {
      const result=purchaseSceneItem(progress,button.dataset.item);
      if(!result.ok){toast(result.reason==='coins'?"Не хватает монет":"Этот вариант сейчас недоступен");break;}
      persist();render();sceneShopPreview=result.item.id;sceneShopModal();audio.play("repair");toast(`Оформление куплено: ${result.item.name}`);break;
    }
    case "scene-shop-equip":
    case "scene-shop-reset": {
      const reset=name==='scene-shop-reset';
      if(!equipSceneItem(progress,reset?null:button.dataset.item,reset?button.dataset.slot as SceneShopSlot:undefined))break;
      persist();render();sceneShopPreview=undefined;sceneShopModal();toast("Оформление применено");break;
    }
    case "debug-auto":
      void debugAutoOrder();
      break;
    case "debug-stop":
      toast("Автопрохождение остановлено");
      break;
    case "debug-restart":
      if (screen === "game" && progress.attempt) action("confirm-restart", button);
      break;
    case "debug-orders":
      levelsModal();
      break;
    case "skip-lesson": {
      const key = toolLesson ? "tools" : guidedLesson();
      if (key) completeLesson(key);
      selected = null;
      highlighted = null;
      render();
      focusGame();
      break;
    }
    case "refresh":
      window.location.reload();
      break;
    case "play":
      if (progress.attempt && won(progress.attempt.board) && !progress.attempt.reward) {
        screen = "game"; render(); showResult();
      } else if (progress.attempt && !won(progress.attempt.board))
        void start(chapterNumber(progress.attempt.definition.id)!);
      else if (allDone()) {
        screen = "finish";
        render();
      } else if (nextAvailableOrder()) void start(nextAvailableOrder()!);
      else { screen = "home"; render(); }
      break;
    case "world-navigation":
    case "room-views":
      navigationModal();
      break;
    case "continue-journey":
    case "shop-view": {
      const projectId=(button.dataset.project??progress.selectedProject) as ProjectId;
      const entry=name==='continue-journey'?projectRoomEntry(progress,projectId):undefined;
      const roomView=entry?.id??button.dataset.view;
      if(name==='continue-journey'&&phaseStatus(projectId,progress.completed,progress.campaign)!=='available')return;
      if (!buildingRooms(progress,projectId).some(v => v.id === roomView&&v.projectId===projectId)) return;
      if(!selectProject(progress,projectId))return;
      shopView = roomView as CampaignView;
      justBuilt = undefined;
      screen = "shop";
      selectedArea=projectById(projectId)!.areaId;
      selected=null;highlighted=null;gentleBoard=null;gentleStep=null;toolLesson=false;
      persist();
      if (modal) closeModal();
      render();
      app.querySelector<HTMLElement>(name==='continue-journey'?'.world-main-action':'[data-action="world-navigation"]')?.focus({ preventScroll: true });
      break;
    }
    case "show-target":
      shopView = undefined;
      justBuilt = undefined;
      render();
      app.querySelector<HTMLElement>(".world-target")?.focus({ preventScroll: true });
      break;
    case "tools-shop":
      openToolsShop(TOOLS.some(tool => tool.id === button.dataset.tool) ? button.dataset.tool as ToolKind : null);
      break;
    case "leave-tools-shop":
      screen = toolShopReturn;
      shopTool = null;
      render();
      if (screen === "game") focusGame();
      break;
    case "buy-tool": {
      const kind = button.dataset.tool!;
      if (screen !== "tools-shop" || !purchaseTool(progress, kind)) return;
      shopTool = kind as ToolKind;
      persist();
      render();
      track("tool_purchase", undefined, { kind });
      break;
    }
    case "show-map":
      closeModal();
      screen = "map";
      selectedArea = CAMPAIGN_AREAS.some(area => area.id === button.dataset.area)
        ? button.dataset.area as CampaignAreaId : projectById(progress.selectedProject)!.areaId;
      render();
      app.querySelector<HTMLElement>(`.world-pin[data-area="${selectedArea}"]`)?.focus({ preventScroll: true });
      break;
    case "select-project": {
      if(screen==='map'||screen==='finish'&&allDone()){buildingRoomsModal(button.dataset.project as ProjectId);break;}
      if (!selectProject(progress, button.dataset.project as ProjectId)) return;
      selectedArea = projectById(progress.selectedProject)!.areaId;
      shopView = undefined;
      justBuilt = undefined;
      selected = null;
      highlighted = null;
      gentleBoard = null;
      gentleStep = null;
      toolLesson = false;
      persist();
      screen = "shop";
      closeModal();
      render();
      track("project_select", undefined, { project: progress.selectedProject });
      break;
    }
    case "show-shop":
      closeModal();
      screen = "shop";
      render();
      break;
    case "finish":
      closeModal();
      screen = allDone() ? "finish" : "home";
      render();
      track("chapter_finish");
      break;
    case "keep-order":
      closeModal();
      pendingLevel = null;
      void start(chapterNumber(current().definition.id)!);
      break;
    case "confirm-switch":
      if (pendingLevel !== null) {
        const number = pendingLevel;
        pendingLevel = null;
        void start(number, true);
      }
      break;
    case "export-events":
      downloadEvents();
      toast("Отчёт этой сессии сохранён. Данные никуда не отправлялись.");
      break;
    case "home":
      closeModal();
      screen = "home";
      toolLesson = false;
      selected = null;
      highlighted = null;
      clearTimeout(toastTimer);
      toastElement.classList.remove("visible");
      toastElement.textContent = "";
      render();
      break;
    case "next":
      closeModal();
      if (nextAvailableOrder())
        void start(nextAvailableOrder()!);
      else {
        screen = allDone() ? "finish" : "home";
        render();
      }
      break;
    case "settings":
      settingsModal();
      break;
    case "close":
      dismissModal();
      break;
    case "levels":
      levelsModal();
      break;
    case "appearance":
      renovationModal();
      break;
    case "buy-task":
      void buyTaskWithReveal(button.dataset.taskId!);
      break;
    case "help":
      helpModal();
      break;
    case "hint": {
      const teaching = toolLesson;
      if (teaching) completeLesson("tools");
      void hint(teaching);
      break;
    }
    case "mix":
      void mix();
      break;
    case "reserve":
      reserve();
      break;
    case "undo":
      undo();
      break;
    case "restart":
      showModal(
        "restart",
        `<h2>Начать заново?</h2><p>Помощь не вернётся</p><button class="primary" data-action="confirm-restart">Заново${icon("restart")}</button><button class="quiet" data-action="close">Продолжить</button>`,
      );
      break;
    case "confirm-restart": {
      clearToast();
      const def = current().definition;
      const hints = clone(current().hints);
      const appearance = clone(current().appearance ?? createOrderAppearance(def));
      progress.attempt = {
        id: crypto.randomUUID(),
        definition: clone(def),
        appearance,
        board: initial(def),
        undo: [],
        solution: clone(def.verifiedSolution),
        mixCount: 0,
        hints,
        reward: null,
      };
      selected = null;
      highlighted = null;
      persist();
      closeModal();
      render();
      focusGame();
      break;
    }
    case "buy-renovation": {
      const color = button.dataset.choice as RenovationColor;
      if (
        !["sea", "honey", "coral"].includes(color) ||
        !renovate(progress, color, repairTarget)
      )
        return;
      persist();
      closeModal();
      track("renovation", undefined, { node: repairTarget, color });
      screen = "shop";
      render();
      app.scrollTop = 0;
      audio.play("repair");
      toast("Готово!");
      break;
    }
  }
}
document.addEventListener("click", (event) => {
  if (suppressClick) {
    suppressClick = false;
    event.preventDefault();
    return;
  }
  const target = (event.target as HTMLElement).closest<HTMLElement>("button");
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target.dataset.action) action(target.dataset.action, target);
  else if (target.dataset.level) void start(Number(target.dataset.level));
  else if (target.dataset.slot)
    selectSlot(target.dataset.slot.split(",").map(Number) as Position);
  else if (target.dataset.area && (screen === "map" || screen === "finish")) {
    const area = CAMPAIGN_AREAS.find(a => a.id === target.dataset.area);
    if (area) {
      screen = "map";
      selectedArea = area.id;
      render();
      app.querySelector<HTMLElement>(`.world-pin[data-area="${area.id}"]`)?.focus({ preventScroll: true });
    }
  }
  else if (target.dataset.repair)
    renovationModal(target.dataset.repair as RenovationId, modal === "renovation");
});
document.addEventListener("change", (event) => {
  if (externalChanged) return;
  const input = event.target as HTMLInputElement;
  if (input.dataset.debugField === "project") updateDebugSceneFields(overlay, progress);
  if (input.dataset.color && input.checked) selectRepairColor(input.dataset.color as RenovationColor);
  if (input.dataset.setting) {
    progress.settings[input.dataset.setting as keyof Settings] = input.checked;
    applySettings();
    persist();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && debugPlayer.status !== "idle") {
    cancelDebugAuto();
    toast("Автопрохождение остановлено");
    event.preventDefault();
    return;
  }

  const tab = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"][data-repair]');
  if (modal === "renovation" && tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const tabs = ownedDecorations();
    const index = tabs.findIndex(r => r.id === tab.dataset.repair);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    renovationModal(tabs[next].id, true);
    return;
  }
  if (event.key === "Escape") {
    endDrag(undefined, true);
    if (modal && overlay.querySelector('[data-action="close"]')) dismissModal();
    else {
      const refresh = !!highlighted || toolLesson;
      if (toolLesson) completeLesson("tools");
      selected = null;
      highlighted = null;
      if (refresh) render();
      else renderSelection();
    }
  }
  if (event.key === "Tab" && modal) {
    const items = [
      ...overlay.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]),input:not(:disabled):not([type="radio"]),input[type="radio"]:checked,select:not(:disabled),textarea:not(:disabled),[role="tabpanel"]:not([hidden])'),
    ];
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0],
      last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  if (event.key === "Tab" && coachSelector()) {
    const target = app.querySelector<HTMLElement>(coachSelector()!)!,
      skip = coach.querySelector<HTMLElement>("button")!;
    event.preventDefault();
    const debug = app.querySelector<HTMLElement>('[data-action="debug-menu"]');
    const items = [target, skip, debug].filter((item): item is HTMLElement => !!item);
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus({ preventScroll: true });
  }
});
document.addEventListener("pointerdown", (event) => {
  void audio.unlock();
  if (
    event.button !== 0 ||
    screen !== "game" ||
    modal ||
    busy ||
    document.hidden
  )
    return;
  const slot = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-slot]",
  );
  if (!slot?.classList.contains("occupied") || won(current().board)) return;
  cancelDebugAuto();
  const step = activeHint();
  if (step && !samePosition(step[0], slot.dataset.slot!.split(",").map(Number) as Position)) return;
  drag = {
    from: slot.dataset.slot!.split(",").map(Number) as Position,
    x: event.clientX,
    y: event.clientY,
    active: false,
    element: null,
    pointer: event.pointerId,
  };
});
document.addEventListener(
  "pointermove",
  (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7
    ) {
      drag.active = true;
      selected = drag.from;
      renderSelection();
      audio.play("take");
      const good = current().board.shelves[drag.from[0]].front[drag.from[1]];
      if (!good) return;
      const element = document.createElement("div");
      element.className = "drag-good";
      element.innerHTML = goodImage(good);
      const rect = app
        .querySelector(positionSelector(drag.from))!
        .getBoundingClientRect();
      element.style.width = `${Math.max(64, rect.width)}px`;
      element.style.height = `${Math.max(64, rect.height)}px`;
      document.body.append(element);
      drag.element = element;
    }
    if (drag.active) {
      event.preventDefault();
      const element = drag.element;
      if (element) {
        element.style.left = `${event.clientX}px`;
        element.style.top = `${event.clientY - 22}px`;
      }
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-slot]");
      document
        .querySelectorAll(".drop-target")
        .forEach((e) => e.classList.remove("drop-target"));
      if (target?.classList.contains("empty"))
        target.classList.add("drop-target");
    }
  },
  { passive: false },
);
function endDrag(event?: PointerEvent, cancelled = false) {
  if (!drag) return;
  const previous = drag;
  drag = null;
  previous.element?.remove();
  document
    .querySelectorAll(".drop-target")
    .forEach((e) => e.classList.remove("drop-target"));
  if (!previous.active) return;
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
  const target =
    !cancelled && event
      ? document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-slot]")
      : null;
  if (target && !modal && !document.hidden)
    move(
      previous.from,
      target.dataset.slot!.split(",").map(Number) as Position,
    );
  else {
    selected = null;
    renderSelection();
  }
}
document.addEventListener("pointerup", (event) => endDrag(event));
document.addEventListener("pointercancel", (event) => endDrag(event, true));
document.addEventListener("contextmenu", (event) => {
  if ((event.target as HTMLElement).closest("#app,#overlay"))
    event.preventDefault();
});
document.addEventListener("visibilitychange", () => {
  cancelDebugAuto();
  endDrag(undefined, true);
  audio.pause(document.hidden);
});
window.addEventListener("pagehide", cancelDebugAuto);
window.addEventListener("blur", () => {
  cancelDebugAuto();
  endDrag(undefined, true);
  audio.pause(true);
});
window.addEventListener("focus", () => audio.pause(document.hidden));
window.addEventListener("resize", () => updateCoach());
app.addEventListener("scroll", () => updateCoach(), true);
document.addEventListener(
  "keydown",
  () => {
    void audio.unlock();
  },
  { once: true },
);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    cancelDebugAuto();
    externalChanged = true;
    endDrag(undefined, true);
    showModal(
      "sync",
      '<h2>Лавка открыта в двух окнах</h2><p>Прогресс изменился в другой вкладке.<br>Обновим эту страницу, чтобы продолжить с ним.</p><button class="primary" data-action="refresh">Обновить страницу</button>',
      false,
    );
  }
});
applySettings();
if (loaded.migrated) persist();
if (allDone() && (!progress.attempt || (won(progress.attempt.board) && progress.attempt.reward)))
  screen = "finish";
render();
track("session_start", undefined, {
  completed: completedCount(progress.completed),
});
if (loaded.readOnly)
  showModal(
    "unsupported",
    `<h2>Обновите игру</h2><p>${loaded.warning}</p><button class="primary" data-action="refresh">Обновить страницу</button>`,
    false,
  );
else if (loaded.warning) toast(loaded.warning);
