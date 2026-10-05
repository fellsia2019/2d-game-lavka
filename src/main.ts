import "./style.css";
import {
  GOODS,
  addReserve,
  applyMove,
  clone,
  initial,
  hasMoves,
  validateDefinition,
  won,
  type Board,
  type Definition,
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
  isUnlocked,
  nextOrder,
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
  saveProgress,
  cachedHint,
  finishes,
  rememberHint,
  validateAttempt,
  type Attempt,
  type RenovationColor,
  type Settings,
} from "./storage";
import { audio } from "./audio";
import { icon } from "./icons";

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
let screen: "home" | "game" | "finish" | "shop" = "home";
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
let repairTarget: RenovationId = "sign";
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
const goodImage = (good: Good, cls = "") =>
  `<img class="good ${cls}" src="${assets}${GOODS[good].file}.webp" alt="" draggable="false" />`;
const samePosition = (a: Position | null, b: Position) =>
  !!a && a[0] === b[0] && a[1] === b[1];
const positionSelector = (p: Position) => `[data-slot="${p[0]},${p[1]}"]`;
const current = () => progress.attempt!;
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
  const stars = progress.stars % 100;
  const unit =
    stars >= 11 && stars <= 14
      ? "звёзд"
      : stars % 10 === 1
        ? "звезда"
        : stars % 10 >= 2 && stars % 10 <= 4
          ? "звезды"
          : "звёзд";
  return `<div class="wallet"><span class="currency star" aria-label="${progress.stars} ${unit} ремонта">${icon("star")}<b>${progress.stars}</b></span><span class="currency coin" aria-label="${progress.coins} монет">${icon("coin")}<b>${progress.coins}</b></span></div>`;
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
function render() {
  const active = document.activeElement as HTMLElement | null;
  const focusSelector =
    active && app.contains(active)
      ? active.dataset.slot
        ? positionSelector(
            active.dataset.slot.split(",").map(Number) as Position,
          )
        : active.dataset.action
          ? `[data-action="${active.dataset.action}"]`
          : active.id === "order-heading"
            ? "#order-heading"
            : null
      : null;
  app.className = screen === "game" ? "game-screen" : "home-screen";
  app.innerHTML =
    screen === "home"
      ? homeHTML()
      : screen === "finish"
        ? finishHTML()
        : screen === "shop"
          ? shopHTML()
          : gameHTML();
  if (focusSelector)
    app
      .querySelector<HTMLElement>(focusSelector)
      ?.focus({ preventScroll: true });
  if (screen === "game") renderSelection();
  else updateCoach();
  if (busy)
    app.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      if (b.dataset.action !== "settings") b.disabled = true;
    });
  else if (!modal && document.activeElement === document.body)
    app
      .querySelector<HTMLElement>(
        screen === "game" ? "#order-heading" : ".primary:not([disabled])",
      )
      ?.focus({ preventScroll: true });
  if (screen !== "game") app.scrollTop = 0;
}
const repairNext = () => RENOVATIONS.find((r) => !progress.renovations[r.id]);
const chapterDone = () => completedCount(progress.completed) === CHAPTER.length;
const allDone = () => chapterDone() && !repairNext();
function sceneHTML() {
  return `<header class="topbar"><div class="brand">${icon("shell")}<span>Лавка у моря</span></div><div class="top-actions">${stats()}${settingsButton()}</div></header>
    <div class="shop-display"><div class="shop-scene" aria-hidden="true"></div><div class="home-shade"></div>
    ${progress.renovations.counter ? `<div class="shop-counter ${progress.renovations.counter}" aria-hidden="true"><img src="${assets}counter.webp" width="1400" height="698" alt="" /></div>` : ""}
    ${progress.renovations.window ? `<div class="shop-garden ${progress.renovations.window}" aria-hidden="true"><img src="${assets}garden.webp" width="878" height="600" alt="" /></div>` : ""}
    <div class="shop-sign ${progress.renovation ? "renovated " + progress.renovation : "unrestored"}"><span class="sign-rope left"></span><span class="sign-rope right"></span>${icon(progress.renovation ? "shell" : "wave")}<strong>${progress.renovation ? "Лавка у моря" : "Скоро открытие"}</strong></div></div>`;
}
function homeHTML() {
  const next = nextOrder(progress.completed),
    node = repairNext(),
    count = completedCount(progress.completed);
  const unfinished = progress.attempt && !won(progress.attempt.board);
  const label = unfinished
    ? "Продолжить"
    : next
      ? "Играть"
      : allDone()
        ? "Итоги главы"
        : "Оформить лавку";
  return `${sceneHTML()}<main class="home-content"><section class="welcome"><span class="eyebrow">ГЛАВА 1</span><h1>Лавка у моря</h1><button class="primary play" data-action="play">${label}${icon("arrow")}</button><div class="home-shortcuts"><button class="quiet home-levels" data-action="levels">Заказы <span>${count}/${CHAPTER.length}</span></button>${progress.renovation ? `<button class="quiet" data-action="show-shop">Моя лавка${icon("home")}</button>` : ""}</div></section>
    <section class="renovation-card"><div class="card-kicker">ВАША ЛАВКА · ${Object.keys(progress.renovations).length}/${RENOVATIONS.length}</div><div class="repair-heading"><span class="repair-symbol">${icon(node ? node.icon : "check")}</span><div><h2>${node ? node.name : "Лавка готова!"}</h2></div></div><div class="repair-meter"><span style="width:${node ? Math.min(100, (progress.stars / node.cost) * 100) : 100}%"></span></div><div class="repair-detail"><span>${node ? `★ ${Math.min(progress.stars, node.cost)} / ${node.cost}` : "3 / 3"}</span>${icon("star")}</div><button class="secondary" data-action="renovation">${node ? (progress.stars >= node.cost ? `Обновить · ${node.cost} ★` : "Выбрать") : "Оформление"}${icon("arrow")}</button></section></main>`;
}
function shopHTML() {
  return `${sceneHTML()}<main class="shop-tour" aria-label="Оформление лавки"><div class="shop-repair-actions"><button class="tour-node tour-sign cream" data-repair="sign">${icon("shell")} Вывеска</button><button class="tour-node tour-counter cream" data-repair="counter">${icon("reserve")} Прилавок</button><button class="tour-node tour-window cream" data-repair="window">${icon("wave")} Цветы у окна</button></div><div class="tour-footer"><strong>Ваша лавка у моря</strong><button class="primary" data-action="home">Заказы${icon("arrow")}</button></div></main>`;
}
function finishHTML() {
  return `${sceneHTML()}<main class="chapter-finale"><div class="result-badge">${icon("shell")}</div><span class="eyebrow">ГЛАВА 1 · ГОТОВО</span><h1>Лавка открыта!</h1><div class="final-stats"><span>${icon("check")} ${CHAPTER.length} заказов</span><span>${icon("star")} ${RENOVATIONS.length} улучшения</span></div><button class="primary" data-action="show-shop">Моя лавка${icon("home")}</button><button class="secondary" data-action="levels">Играть ещё${icon("restart")}</button><button class="quiet" data-action="renovation">Сменить оформление</button></main>`;
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
      ? `Перенеси товар в золотую рамку: полка ${step[1][0] + 1}, место ${step[1][1] + 1}.`
      : `Выбери товар в золотой рамке: ${GOODS[good].name}.`;
  }
}
function startLesson(number: number) {
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
    if (el !== target && !el.disabled) {
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
  coach.innerHTML = `<div class="coach-spotlight" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px" aria-hidden="true"><span class="coach-hand">${icon("hand")}</span></div><div class="coach-label" id="coach-instruction" role="status" style="left:${Math.max(8, Math.min(innerWidth - 140, r.left + r.width / 2 - 66))}px;top:${Math.max(68, r.top - 42)}px">${label}${icon("arrow")}</div><button class="coach-skip" data-action="skip-lesson">Пропустить</button>`;
  target.setAttribute("aria-describedby", "coach-instruction");
  if (focus || (document.activeElement !== target && !coach.contains(document.activeElement)))
    target.focus({ preventScroll: true });
}
function gameHTML() {
  const attempt = current(),
    def = attempt.definition,
    board = attempt.board;
  const goalCount = Object.keys(board.goals).length;
  const visible = board.shelves.flatMap(sh => sh.opened ? sh.front : []);
  const readyGoods = Object.keys(board.goals).some(good => visible.filter(k => k === good).length >= 3);
  const hiddenShelf = board.shelves.findIndex(sh => sh.opened && sh.rear.length);
  const rearTip = hiddenShelf >= 0 && !readyGoods
    ? `Освободи полку ${hiddenShelf + 1} — появится следующий ряд из запаса`
    : "";
  const stuck = !won(board) && !hasMoves(board);
  const noSpace =
    board.budget !== null && board.used >= board.budget
      ? "Ходы закончились."
      : "Нет свободных мест.";
  const tooltip = stuck
    ? `${noSpace} ${attempt.undo.length ? "↶ Отмена" : "↻ Заново"}`
    : board.budget !== null
      ? `Ходы: ${board.budget - board.used}`
      : rearTip;
  return `<div class="game-backdrop" aria-hidden="true"></div>
    <header class="topbar game-topbar"><button class="round cream" data-action="home" aria-label="Вернуться в лавку">${icon("home")}</button><div class="level-title"><span>ЗАКАЗ ${chapterNumber(def.id)} / ${CHAPTER.length}</span><h1 id="order-heading" tabindex="-1">${escapeHTML(def.name)}</h1></div><div class="top-actions">${stats()}${settingsButton()}</div></header>
    <main class="puzzle-layout">
      <section class="puzzle rows-${Math.ceil(def.shelves.length / 2)} ${board.shelves.some(sh => sh.reserve) ? "with-reserve" : ""}" aria-label="Игровое поле"><div class="orders goals-${goalCount}" aria-label="Товары для заказа">${Object.entries(
        board.goals,
      )
        .map(([key, goal]) => {
          const k = key as Good,
            n = board.delivered[k] ?? 0;
          return `<div class="order-card ${n === goal ? "fulfilled" : ""}" data-order="${k}" aria-label="${GOODS[k].name}: ${n} из ${goal}">${goodImage(k)}<div><strong>${n}<small> / ${goal}</small></strong></div>${n === goal ? `<i class="done-icon">${icon("check")}</i>` : ""}</div>`;
        })
        .join("")}</div>
      <div class="board-wrap"><div class="board shelves-${def.shelves.length}" aria-label="Полки">${board.shelves
        .map((sh, i) => {
          if (sh.reserve) return "";
          const events = board.events.filter((e) => e.shelf === i);
          const stock = hiddenStock(sh);
          const stockLabel = stock.map(([good, count]) => `${GOODS[good].name}: ${count}`).join(", ");
          return `<div class="shelf ${!sh.opened ? "locked" : ""} ${events.some((e) => e.type === "unlock") ? "just-unlocked" : ""}" data-shelf="${i}"><div class="shelf-top"><span>${i + 1}</span>${sh.rear.length ? `<span class="rear-badge">Запас · ${sh.rear.length} ${sh.rear.length === 1 ? "ряд" : "ряда"}</span>` : ""}</div>${sh.opened ? `${sh.rear.length ? `<div class="rear-preview" aria-label="Запас во всех скрытых рядах: ${stockLabel}. Освободи полку, чтобы открыть следующий ряд.">${stock.map(([good, count]) => `<span class="rear-stock">${goodImage(good)}<b>×${count}</b></span>`).join("")}</div>` : ""}<div class="shelf-tray"></div><div class="slots">${sh.front.map((k, j) => slotHTML(k, [i, j])).join("")}</div>` : `<div class="shelf-tray"></div><div class="crate-cover">${icon("lock")}<span>${board.triples} / ${sh.unlockAfter}</span></div>`}</div>`;
        })
        .join("")}</div></div>
      <div class="game-message ${stuck ? "stuck-message" : ""}" aria-live="polite">${tooltip ? `${icon(stuck ? "undo" : "hint")}<span>${tooltip}</span>` : `<span class="triple-rule" aria-label="Три одинаковых товара на одной полке отправляются в заказ">${goodImage("j")}${goodImage("j")}${goodImage("j")}${icon("arrow")}${icon("check")}</span>`}</div>
      <div class="tools">${toolHTML("hint", stuck ? "Как выйти" : "Подсказка", "hint", 100)}${toolHTML("mix", "Смешать", "mix", 200)}${toolHTML("reserve", "Резерв", "reserve", 300)}</div>
      <div class="utility-bar"><button data-action="undo" ${!attempt.undo.length || won(board) ? "disabled" : ""} class="quiet ${stuck ? "recover-action" : ""}">${icon("undo")} Отмена</button><button class="quiet" data-action="restart">${icon("restart")} Заново</button><button class="mobile-help quiet" data-action="help" aria-label="Как играть">${icon("help")}</button>${toolLesson || highlighted ? `<button class="quiet" data-action="skip-lesson">${toolLesson ? "Пропустить" : "Скрыть подсказку"}</button>` : ""}</div>
      <span id="gentle-instruction" class="visually-hidden" role="status"></span>
      ${board.shelves.some((sh) => sh.reserve) ? `<div class="reserve-slot"><span>Резерв</span>${slotHTML(board.shelves[board.shelves.length - 1].front[0], [board.shelves.length - 1, 0])}</div>` : ""}
      </section>
    </main>`;
}
function slotHTML(good: Good | null, position: Position) {
  const step = activeHint();
  const hintSource = step && samePosition(step[0], position);
  const hintDest = step && samePosition(step[1], position);
  return `<button class="slot ${good ? "occupied" : "empty"} ${samePosition(selected, position) ? "selected" : ""} ${hintSource ? "hint-source" : ""} ${hintDest ? "hint-dest" : ""}" data-slot="${position.join(",")}" aria-label="Полка ${position[0] + 1}, место ${position[1] + 1}: ${good ? GOODS[good].name : "свободно"}" aria-pressed="${samePosition(selected, position)}">${good ? goodImage(good) : '<span class="empty-mark">+</span>'}</button>`;
}
function toolHTML(
  kind: "hint" | "mix" | "reserve",
  name: string,
  symbol: string,
  cost: number,
) {
  const count = progress.inventory[kind];
  const locked =
    kind === "mix" && !isCompleted(progress.completed, 3)
      ? "Заказ 4"
      : kind === "reserve" && !isCompleted(progress.completed, 6)
        ? "Заказ 7"
        : null;
  const board = current().board;
  const unavailable =
    (kind === "mix" && !hasMoves(board)) ||
    (kind === "reserve" && board.budget !== null && board.used >= board.budget);
  const freeHint =
    kind === "hint" &&
    (!hasMoves(current().board) || guided() || gentleGuidance() || toolLesson || !!cachedHint(current()));
  const used =
    kind === "reserve" && current().board.shelves.some((sh) => sh.reserve);
  return `<button class="tool ${used ? "tool-used" : ""}" data-action="${kind}" ${used || locked || unavailable || busy || won(current().board) ? "disabled" : ""}><span class="tool-circle">${icon(symbol)}</span><span class="tool-name">${name}</span><small>${locked ?? (unavailable ? "Нужна отмена" : used ? "На поле" : freeHint ? "Бесплатно" : count > 0 ? `×${count}` : `${cost} ◉`)}</small></button>`;
}
async function start(number: number, force = false) {
  if (busy || externalChanged || !isUnlocked(progress.completed, number))
    return;
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
    if (cachedHint(current()) && !guided() && !gentleGuidance()) void hint();
    return;
  }
  showModal(
    "loading",
    `<div class="loading-shell">${icon("shell")}</div><h2>Готовим заказ…</h2>`,
    false,
  );
  try {
    const definition = await job<Definition>({ kind: "level", number });
    if (externalChanged) return;
    validateDefinition(definition);
    if (chapterNumber(definition.id) !== number)
      throw new Error(
        "Получен другой заказ. Попробуйте открыть заказ ещё раз.",
      );
    progress.attempt = {
      id: crypto.randomUUID(),
      definition,
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
  else toast("Выбери товар");
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
function move(from: Position, to: Position) {
  if (externalChanged || busy || modal || document.hidden) return;
  const lesson = guidedLesson(), step = activeHint();
  if (step && (!samePosition(step[0], from) || !samePosition(step[1], to))) return;
  const attempt = current();
  const before = attempt.board;
  const next = applyMove(before, from, to);
  if (!next) {
    toast("Нужно свободное место");
    return;
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
  if (opened) toast(`Полка ${opened.shelf + 1} открыта!`);
  else if (next.events.some(e => e.type === "reveal")) toast("Новый ряд!");
  if (victory) {
    audio.play("win");
    showResult();
  }
}
function showModal(
  name: string,
  content: string,
  closable = true,
  wide = false,
) {
  endDrag(undefined, true);
  if (!modal) lastFocus = document.activeElement as HTMLElement;
  modal = name;
  audio.pause(document.hidden || !document.hasFocus());
  overlay.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? "wide" : ""} modal-${name}" role="dialog" aria-modal="true" aria-label="${
    (
      {
        settings: "Настройки",
                switch: "Смена заказа",
        unsupported: "Обновление игры",
        result: "Заказ готов",
        renovation: "Оформление лавки",
        levels: "Книжка заказов",
        help: "Как играть",
        restart: "Начать заново",
        loading: "Загрузка",
        needCoins: "Помощь",
      } as Record<string, string>
    )[name] ?? "Лавка у моря"
  }">${closable ? `<button class="modal-close round cream" data-action="close" aria-label="Закрыть">${icon("close")}</button>` : ""}${content}</section></div>`;
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
function showResult() {
  clearToast();
  const attempt = current(),
    reward = attempt.reward ?? completeAttempt(progress, today())!;
  const next = nextOrder(progress.completed),
    node = repairNext(),
    affordable = node && progress.stars >= node.cost;
  persist();
  showModal(
    "result",
    `<div class="result-badge">${icon("check")}</div><h2>Заказ готов!</h2><div class="reward-row"><div>${icon("coin")}<strong>+${reward.coins}</strong><span>монет</span></div><div>${icon("star")}<strong>+${reward.stars}</strong><span>${reward.stars ? "" : "Повтор"}</span></div></div><p class="result-note">${reward.fresh ? (node ? `${node.name} · ★ ${Math.min(progress.stars, node.cost)}/${node.cost}` : "") : ""}</p><button class="primary" data-action="${affordable ? "renovation" : allDone() ? "finish" : next ? "next" : "home"}">${affordable ? `Обновить: ${node.name.toLowerCase()}` : allDone() ? "Моя лавка" : next ? "Дальше" : "В лавку"}${icon("arrow")}</button><button class="quiet" data-action="home">В лавку${icon("home")}</button>`,
    false,
  );
}
function settingsModal() {
  showModal(
    "settings",
    `<h2>Настройки</h2><div class="settings-list">${(["sound", "music", "reducedMotion"] as const).map((key) => `<label class="setting-row"><span>${icon(key === "sound" ? "sound" : key === "music" ? "music" : "wave")}<span><strong>${{ sound: "Звуки", music: "Музыка", reducedMotion: "Меньше движения" }[key]}</strong></span></span><input type="checkbox" data-setting="${key}" ${progress.settings[key] ? "checked" : ""}/><i class="toggle"></i></label>`).join("")}</div><button class="secondary" data-action="close">Готово${icon("check")}</button>${new URLSearchParams(location.search).has("playtest") ? `<button class="quiet" data-action="export-events">Скачать отчёт этой сессии</button>` : ""}<p class="save-note">${storageWarned ? "Сохранение недоступно — игра работает в этой вкладке." : "Сохранено в браузере"}</p>`,
  );
}
function renovationModal(target: RenovationId = repairNext()?.id ?? "sign", focusTab = false) {
  repairTarget = target;
  const node = RENOVATIONS.find((r) => r.id === target)!,
    color = progress.renovations[target] ?? "sea",
    owned = !!progress.renovations[target];
  const unlocked = RENOVATIONS.slice(0, RENOVATIONS.indexOf(node)).every(
    (r) => progress.renovations[r.id],
  );
  const note = owned ? "" : !unlocked
    ? target === "counter" ? "Сначала обновите вывеску." : "Сначала обновите прилавок."
    : progress.stars < node.cost ? `Нужно ещё ${node.cost - progress.stars} ★ для обновления.` : "";
  const preview = target === "sign" ? `${icon("shell")}<strong>Лавка у моря</strong>`
    : `<img src="${assets}${target === "counter" ? "counter" : "garden"}.webp" alt="" />`;
  showModal(
    "renovation",
    `<div class="repair-header"><h2>Оформление лавки</h2></div>
    <div class="repair-tabs" role="tablist" aria-label="Что оформить">${RENOVATIONS.map(r =>
      `<button class="repair-tab ${r.id === target ? "active" : ""}" role="tab" id="repair-tab-${r.id}" aria-controls="repair-panel-${r.id}" aria-selected="${r.id === target}" tabindex="${r.id === target ? 0 : -1}" data-repair="${r.id}">${icon(r.icon)}<span>${r.name}</span></button>`).join("")}</div>
    <div class="repair-content" role="tabpanel" id="repair-panel-${target}" aria-labelledby="repair-tab-${target}" tabindex="0">
      <div class="repair-preview preview-${target} ${color}" id="sign-preview" role="img" aria-label="Предпросмотр: ${node.name}, ${COLORS[color]}">${preview}</div>
      <fieldset class="color-choices"><legend>Цвет оформления</legend><div class="color-grid">${(Object.keys(COLORS) as RenovationColor[]).map(c =>
        `<label class="color-choice ${c} ${c === color ? "chosen" : ""}"><input type="radio" name="repair-color" data-color="${c}" value="${c}" ${c === color ? "checked" : ""} /><i aria-hidden="true"></i><span>${COLORS[c]}</span></label>`).join("")}</div></fieldset>
    </div>${RENOVATIONS.filter(r => r.id !== target).map(r => `<div role="tabpanel" id="repair-panel-${r.id}" aria-labelledby="repair-tab-${r.id}" hidden></div>`).join("")}
    <div class="repair-footer">${note ? `<p class="repair-note">${note}</p>` : ""}<button class="primary" data-action="${owned ? "close" : "buy-renovation"}" data-choice="${color}" ${!owned && (!unlocked || progress.stars < node.cost) ? "disabled" : ""}>${owned ? "Готово" : `Обновить за ${node.cost} ★`}</button></div>`,
  );
  if (focusTab) queueMicrotask(() => overlay.querySelector<HTMLElement>(`#repair-tab-${target}`)?.focus());
}
function selectRepairColor(color: RenovationColor) {
  overlay.querySelectorAll<HTMLInputElement>("[data-color]").forEach(input => {
    input.closest(".color-choice")?.classList.toggle("chosen", input.checked);
  });
  const preview = overlay.querySelector<HTMLElement>("#sign-preview")!;
  preview.className = `repair-preview preview-${repairTarget} ${color}`;
  preview.setAttribute("aria-label", `Предпросмотр: ${RENOVATIONS.find(r => r.id === repairTarget)!.name}, ${COLORS[color]}`);
  const button = overlay.querySelector<HTMLButtonElement>(".repair-footer .primary")!;
  button.dataset.choice = color;
  if (progress.renovations[repairTarget]) {
    const changed = color !== progress.renovations[repairTarget];
    button.dataset.action = changed ? "buy-renovation" : "close";
    button.textContent = changed ? "Применить цвет" : "Готово";
  }
}
function levelsModal() {
  showModal(
    "levels",
    `<span class="eyebrow">ГЛАВА 1</span><h2>Заказы</h2><div class="level-list">${CHAPTER.map(
      (level, i) => {
        const completed = isCompleted(progress.completed, i + 1);
        const unlocked = isUnlocked(progress.completed, i + 1);
        return `<button class="level-entry ${completed ? "complete" : ""}" data-level="${i + 1}" ${unlocked ? "" : "disabled"}><span class="level-number">${completed ? icon("check") : i + 1}</span><span><strong>${level.name}</strong></span>${icon(unlocked ? "arrow" : "lock")}</button>`;
      },
    ).join("")}</div>`,
    true,
    true,
  );
}
function helpModal() {
  showModal(
    "help",
    `<h2>Собери тройку</h2><div class="visual-help"><div class="help-transfer">${goodImage("m")}${icon("arrow")}<span class="help-empty">+</span></div><span>Товар → место</span><div class="help-goods">${goodImage("j")}${goodImage("j")}${goodImage("j")}${icon("arrow")}${icon("check")}</div><span>Три в ряд — готово</span><div class="help-shortcuts"><span>${icon("undo")} Отмена</span><span>${icon("restart")} Заново</span></div></div><button class="primary" data-action="close">Играть${icon("arrow")}</button>`,
  );
}
function canPay(kind: "hint" | "mix" | "reserve", cost: number): boolean {
  if (progress.inventory[kind] > 0 || progress.coins >= cost) return true;
  showModal(
    "needCoins",
    `<div class="loading-shell">${icon(kind)}</div><h2>Не хватает монет</h2><p>${cost} ◉ · за заказ +60</p><button class="primary" data-action="close">Вернуться к заказу${icon("arrow")}</button>`,
  );
  return false;
}
function pay(kind: "hint" | "mix" | "reserve", cost: number) {
  if (progress.inventory[kind] > 0) progress.inventory[kind]--;
  else progress.coins -= cost;
}
async function hint(teaching = false) {
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
  if (!cached && !guided() && !teaching && !canPay("hint", 100)) return;
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
    if (!cached && !guided() && !teaching) pay("hint", 100);
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
  if (
    busy ||
    !isCompleted(progress.completed, 3) ||
    !hasMoves(current().board) ||
    won(current().board) ||
    !canPay("mix", 200)
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
    pay("mix", 200);
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
  if (busy || !isCompleted(progress.completed, 6) || won(current().board))
    return;
  if (
    current().board.budget !== null &&
    current().board.used >= current().board.budget!
  )
    return;
  const next = addReserve(current().board);
  if (!next || !canPay("reserve", 300)) return;
  pay("reserve", 300);
  track("help", current().definition.id, { kind: "reserve" });
  current().board = next;
  current().undo = [];
  selected = null;
  highlighted = null;
  persist();
  render();
  focusGame(positionSelector([next.shelves.length - 1, 0]));
  app.querySelector<HTMLElement>(".reserve-slot")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  clearToast();
}
function undo() {
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
  if (cachedHint(attempt) && !guided() && !gentleGuidance()) void hint();
}
function action(name: string, button: HTMLElement) {
  if (externalChanged && name !== "refresh") return;
  if (busy && !["settings", "close"].includes(name)) return;
  audio.play("button");
  switch (name) {
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
      if (progress.attempt && !won(progress.attempt.board))
        void start(chapterNumber(progress.attempt.definition.id)!);
      else if (allDone()) {
        screen = "finish";
        render();
      } else if (chapterDone()) renovationModal();
      else void start(nextOrder(progress.completed));
      break;
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
      if (nextOrder(progress.completed))
        void start(nextOrder(progress.completed));
      else {
        screen = allDone() ? "finish" : "home";
        render();
      }
      break;
    case "settings":
      settingsModal();
      break;
    case "close":
      closeModal();
      break;
    case "levels":
      levelsModal();
      break;
    case "renovation":
      renovationModal();
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
      progress.attempt = {
        id: crypto.randomUUID(),
        definition: clone(def),
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
      screen = allDone() ? "finish" : "shop";
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
  else if (target.dataset.repair)
    renovationModal(target.dataset.repair as RenovationId, modal === "renovation");
});
document.addEventListener("change", (event) => {
  if (externalChanged) return;
  const input = event.target as HTMLInputElement;
  if (input.dataset.color && input.checked) selectRepairColor(input.dataset.color as RenovationColor);
  if (input.dataset.setting) {
    progress.settings[input.dataset.setting as keyof Settings] = input.checked;
    applySettings();
    persist();
  }
});
document.addEventListener("keydown", (event) => {
  const tab = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"][data-repair]');
  if (modal === "renovation" && tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const index = RENOVATIONS.findIndex(r => r.id === tab.dataset.repair);
    const next = event.key === "Home" ? 0 : event.key === "End" ? RENOVATIONS.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + RENOVATIONS.length) % RENOVATIONS.length;
    renovationModal(RENOVATIONS[next].id, true);
    return;
  }
  if (event.key === "Escape") {
    endDrag(undefined, true);
    if (modal && overlay.querySelector('[data-action="close"]')) closeModal();
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
      ...overlay.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]),input:not([type="radio"]),input[type="radio"]:checked,[role="tabpanel"]:not([hidden])'),
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
    (document.activeElement === target ? skip : target).focus({ preventScroll: true });
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
  endDrag(undefined, true);
  audio.pause(document.hidden);
});
window.addEventListener("blur", () => {
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
if (allDone() && (!progress.attempt || won(progress.attempt.board)))
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
