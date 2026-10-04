import "./style.css";
import {
  GOODS,
  addReserve,
  applyMove,
  clone,
  initial,
  won,
  type Board,
  type Definition,
  type Good,
  type Move,
  type Position,
  type SearchResult,
} from "./engine";
import { CHAPTER, SEEDS } from "./content";
import { job } from "./jobs";
import {
  STORAGE_KEY,
  completeAttempt,
  loadProgress,
  renovate,
  saveProgress,
  type Attempt,
  type RenovationColor,
  type Settings,
} from "./storage";
import { audio } from "./audio";
import { icon } from "./icons";

const app = document.querySelector<HTMLDivElement>("#app")!;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const toastElement = document.querySelector<HTMLDivElement>("#toast")!;
// Access the storage getter inside the persistence functions' try/catch as well:
// some embedded/privacy modes throw even when obtaining window.localStorage.
const storage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};
const loaded = loadProgress(storage);
const progress = loaded.progress;
let screen: "home" | "game" = "home";
let selected: Position | null = null;
let highlighted: Move | null = null;
let busy = false;
let modal: string | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let lastFocus: HTMLElement | null = null;
let storageWarned = false;
let externalChanged = false;
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
function applySettings() {
  document.documentElement.classList.toggle(
    "reduced-motion",
    progress.settings.reducedMotion,
  );
  audio.configure(progress.settings);
}
function stats() {
  return `<div class="wallet"><span class="currency star" aria-label="${progress.stars} звёзд ремонта">${icon("star")}<b>${progress.stars}</b></span><span class="currency coin" aria-label="${progress.coins} монет">${icon("coin")}<b>${progress.coins}</b></span></div>`;
}
function settingsButton() {
  return `<button class="round cream" data-action="settings" aria-label="Настройки">${icon("settings")}</button>`;
}
function render() {
  app.className = screen === "home" ? "home-screen" : "game-screen";
  app.innerHTML = screen === "home" ? homeHTML() : gameHTML();
}
function homeHTML() {
  const nextNumber = Math.min(progress.completed.length + 1, CHAPTER.length);
  const unfinished = progress.attempt && !won(progress.attempt.board);
  const label = unfinished
    ? `Продолжить заказ ${progress.attempt!.definition.number}`
    : progress.completed.length >= 10
      ? "Выбрать заказ"
      : `Играть · заказ ${nextNumber}`;
  const repaired = !!progress.renovation;
  return `<div class="shop-scene" aria-hidden="true"></div><div class="home-shade"></div>
    <header class="topbar"><div class="brand">${icon("shell")}<span>Лавка у моря<small>Ваша маленькая история</small></span></div><div class="top-actions">${stats()}${settingsButton()}</div></header>
    <div class="shop-sign ${repaired ? "renovated " + progress.renovation : "unrestored"}" aria-label="${repaired ? "Обновлённая вывеска: Лавка у моря" : "Старая вывеска: скоро открытие"}"><span class="sign-rope left"></span><span class="sign-rope right"></span>${icon(repaired ? "shell" : "wave")}<strong>${repaired ? "Лавка у моря" : "Скоро открытие"}</strong><small>${repaired ? "Свежесть. Солнце. Немного счастья." : "Здесь начинается наша история"}</small></div>
    <main class="home-content"><section class="welcome"><span class="eyebrow">ГЛАВА 1 · СОЛНЕЧНОЕ УТРО</span><h1>${progress.completed.length ? "В лавке снова<br>пахнет счастьем." : "Море за окном.<br>Счастье на полках."}</h1><p>Собирайте заказы, наводите порядок<br class="desktop-break"> и подарите этой лавке новую жизнь.</p><button class="primary play" data-action="play">${label}${icon("arrow")}</button><button class="quiet home-levels" data-action="levels">${icon("reserve")} Книжка заказов <span>${progress.completed.length}/10</span></button></section>
    <section class="renovation-card"><div class="card-kicker">ВАША ЛАВКА</div><div class="repair-heading"><span class="repair-symbol">${icon(repaired ? "check" : "star")}</span><div><h2>${repaired ? "Вот теперь — наша!" : "Первый штрих"}</h2><p>${repaired ? "Новая вывеска уже встречает гостей." : "Красивая вывеска над окном"}</p></div></div><div class="repair-meter"><span style="width:${repaired ? 100 : Math.min(100, (progress.stars / 3) * 100)}%"></span></div><div class="repair-detail"><span>${repaired ? "Вывеска обновлена" : `Собрано ${Math.min(progress.stars, 3)} из 3 звёзд`}</span>${icon("star")}</div><button class="secondary" data-action="renovation">${repaired ? "Сменить оформление" : progress.stars >= 3 ? "Обновить вывеску · 3 ★" : "Посмотреть варианты"}${icon("arrow")}</button></section></main>
    <footer class="home-footer">${icon("wave")} Тихое утро. Никакой спешки.</footer>`;
}
function gameHTML() {
  const attempt = current(),
    def = attempt.definition,
    board = attempt.board;
  const story = CHAPTER[def.number - 1];
  const total = Object.values(board.goals).reduce((n, x) => n + x!, 0);
  const delivered = Object.values(board.delivered).reduce((n, x) => n + x!, 0);
  const goalCount = Object.keys(board.goals).length;
  const tooltip = highlighted
    ? `Перенесите ${GOODS[board.shelves[highlighted[0][0]].front[highlighted[0][1]]!].name.toLowerCase()}: полка ${highlighted[0][0] + 1} → полка ${highlighted[1][0] + 1}`
    : def.number === 1 && board.used === 0 && attempt.mixCount === 0
      ? "Нажмите на молоко, затем на свободное место"
      : "Три одинаковых на одной полке — готовый заказ";
  return `<div class="game-backdrop" aria-hidden="true"></div>
    <header class="topbar game-topbar"><button class="round cream" data-action="home" aria-label="Вернуться в лавку">${icon("home")}</button><div class="level-title"><span>ЗАКАЗ ${def.number} / 10</span><h1>${def.name}</h1></div><div class="top-actions">${stats()}${settingsButton()}</div></header>
    <main class="puzzle-layout">
      <aside class="story-panel"><div class="story-icon">${icon("shell")}</div><span class="eyebrow">УТРЕННИЕ ЗАКАЗЫ</span><h2>Всё начинается<br>с заботы.</h2><p>«${story.line}»</p><span class="customer">— ${story.customer}, с набережной</span><div class="story-progress"><span>Собрано товаров</span><b>${delivered} / ${total}</b><div class="mini-meter"><i style="width:${(delivered / total) * 100}%"></i></div></div><button class="quiet" data-action="help">${icon("help")} Как играть</button></aside>
      <section class="puzzle" aria-label="Игровое поле"><div class="orders goals-${goalCount}" aria-label="Товары для заказа">${Object.entries(
        board.goals,
      )
        .map(([key, goal]) => {
          const k = key as Good,
            n = board.delivered[k] ?? 0;
          return `<div class="order-card ${n === goal ? "fulfilled" : ""}" data-order="${k}" aria-label="${GOODS[k].name}: ${n} из ${goal}">${goodImage(k)}<div><span>${GOODS[k].name}</span><strong>${n}<small> / ${goal}</small></strong></div>${n === goal ? `<i class="done-icon">${icon("check")}</i>` : ""}</div>`;
        })
        .join("")}</div>
      <div class="board-wrap"><div class="board shelves-${def.shelves.length}" aria-label="Полки">${board.shelves
        .map((sh, i) => {
          if (sh.reserve) return "";
          const events = board.events.filter((e) => e.shelf === i);
          return `<div class="shelf ${!sh.opened ? "locked" : ""} ${events.some((e) => e.type === "unlock") ? "just-unlocked" : ""}" data-shelf="${i}"><div class="shelf-top"><span>ПОЛКА ${i + 1}</span>${sh.rear.length ? `<span class="rear-badge">ещё ${sh.rear.length} ${sh.rear.length === 1 ? "ряд" : "ряда"}</span>` : ""}</div>${sh.opened ? `${sh.rear.length ? `<div class="rear-preview" aria-hidden="true">${sh.rear[0].map((k) => (k ? goodImage(k) : "<span></span>")).join("")}</div>` : ""}<div class="shelf-tray"></div><div class="slots">${sh.front.map((k, j) => slotHTML(k, [i, j])).join("")}</div>` : `<div class="shelf-tray"></div><div class="crate-cover">${icon("lock")}<strong>Новая поставка</strong><span>Ещё ${Math.max(0, (sh.unlockAfter ?? 0) - board.triples)} ${Math.max(0, (sh.unlockAfter ?? 0) - board.triples) === 1 ? "тройка" : "тройки"}</span></div>`}</div>`;
        })
        .join("")}</div></div>
      <div class="game-message" aria-live="polite">${icon(highlighted ? "hint" : "wave")}<span>${tooltip}</span></div>
      <div class="tools">${toolHTML("hint", "Подсказка", "hint", 100)}${toolHTML("mix", "Смешать", "mix", 200)}${toolHTML("reserve", "Резерв", "reserve", 300)}</div>
      <div class="utility-bar"><button class="quiet" data-action="undo" ${!attempt.undo.length || won(board) ? "disabled" : ""}>${icon("undo")} Отмена</button><span class="calm-mode">${icon("wave")} Без таймера</span><button class="quiet" data-action="restart">${icon("restart")} Заново</button><button class="mobile-help quiet" data-action="help" aria-label="Как играть">${icon("help")}</button></div>
      ${board.shelves.some((sh) => sh.reserve) ? `<div class="reserve-slot"><span>Резерв</span>${slotHTML(board.shelves[board.shelves.length - 1].front[0], [board.shelves.length - 1, 0])}</div>` : ""}
      </section>
    </main>`;
}
function slotHTML(good: Good | null, position: Position) {
  const hintSource = highlighted
    ? samePosition(highlighted[0], position)
    : current().definition.number === 1 &&
      current().board.used === 0 &&
      current().mixCount === 0 &&
      position[0] === 0 &&
      position[1] === 2;
  const hintDest = highlighted && samePosition(highlighted[1], position);
  return `<button class="slot ${good ? "occupied" : "empty"} ${samePosition(selected, position) ? "selected" : ""} ${hintSource ? "hint-source" : ""} ${hintDest ? "hint-dest" : ""}" data-slot="${position.join(",")}" aria-label="Полка ${position[0] + 1}, место ${position[1] + 1}: ${good ? GOODS[good].name : "свободно"}" aria-pressed="${samePosition(selected, position)}">${good ? goodImage(good) : '<span class="empty-mark">+</span>'}</button>`;
}
function toolHTML(
  kind: "hint" | "mix" | "reserve",
  name: string,
  symbol: string,
  cost: number,
) {
  const count = progress.inventory[kind];
  const used =
    kind === "reserve" && current().board.shelves.some((sh) => sh.reserve);
  return `<button class="tool ${used ? "tool-used" : ""}" data-action="${kind}" ${used || busy || won(current().board) ? "disabled" : ""}><span class="tool-circle">${icon(symbol)}</span><span class="tool-name">${name}</span><small>${used ? "На поле" : count > 0 ? `${count} бесплатно` : `${cost} монет`}</small></button>`;
}
async function start(number: number, force = false) {
  if (busy) return;
  busy = true;
  closeModal();
  if (
    !force &&
    progress.attempt?.definition.number === number &&
    !won(progress.attempt.board)
  ) {
    screen = "game";
    selected = null;
    highlighted = null;
    busy = false;
    render();
    return;
  }
  showModal(
    "loading",
    `<div class="loading-shell">${icon("shell")}</div><h2>Готовим ваш заказ</h2><p>Расставляем товары на полках…</p>`,
    false,
  );
  try {
    const definition = await job<Definition>({ kind: "level", number });
    if (externalChanged) return;
    progress.attempt = {
      id: crypto.randomUUID(),
      definition,
      board: initial(definition),
      undo: [],
      solution: clone(definition.verifiedSolution),
      mixCount: 0,
      reward: null,
    };
    persist();
    screen = "game";
    selected = null;
    highlighted = null;
    closeModal();
    render();
    if (number === 7)
      toast("Новая механика: освободите полку, чтобы открыть задний ряд.");
    if (number === 9)
      toast("Новая поставка откроется после нужного числа отправленных троек.");
  } catch (error) {
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
  if (sh.front[position[1]]) {
    selected = samePosition(selected, position) ? null : position;
    audio.play("take");
    renderSelection();
  } else if (selected) move(selected, position);
  else toast("Сначала выберите товар на открытой полке.");
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
}
function move(from: Position, to: Position) {
  if (externalChanged || busy || modal || document.hidden) return;
  const attempt = current();
  const before = attempt.board;
  const next = applyMove(before, from, to);
  if (!next) {
    toast("Товар можно поставить только в свободное место.");
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
  selected = null;
  highlighted = null;
  const victory = won(next);
  if (victory) completeAttempt(progress, today());
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
  if (opened) toast(`Поставка на полке ${opened.shelf + 1} открыта!`);
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
  if (!modal) lastFocus = document.activeElement as HTMLElement;
  modal = name;
  audio.pause(document.hidden);
  overlay.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? "wide" : ""} modal-${name}" role="dialog" aria-modal="true" aria-label="${({ settings: "Настройки", result: "Заказ готов", renovation: "Ремонт вывески", levels: "Книжка заказов", help: "Как играть", restart: "Начать заново", loading: "Загрузка", needCoins: "Помощь" } as Record<string, string>)[name] ?? "Лавка у моря"}">${closable ? `<button class="modal-close round cream" data-action="close" aria-label="Закрыть">${icon("close")}</button>` : ""}${content}</section></div>`;
  app.inert = true;
  queueMicrotask(() =>
    overlay.querySelector<HTMLElement>("button,input")?.focus(),
  );
}
function closeModal() {
  overlay.innerHTML = "";
  modal = null;
  app.inert = false;
  audio.pause(document.hidden || !document.hasFocus());
  lastFocus?.focus();
}
function showResult() {
  const attempt = current(),
    reward = attempt.reward!;
  const all = progress.completed.length >= CHAPTER.length;
  showModal(
    "result",
    `<div class="result-badge">${icon("check")}</div><span class="eyebrow">${all ? "СОЛНЕЧНОЕ УТРО УДАЛОСЬ" : "СПАСИБО ЗА ЗАБОТУ"}</span><h2>Заказ готов!</h2><p>${all ? "Все десять заказов собраны.<br>В лавке стало немного уютнее." : `${CHAPTER[attempt.definition.number - 1].customer} улыбается: всё на месте.`}</p><div class="reward-row"><div>${icon("coin")}<strong>+${reward.coins}</strong><span>монет</span></div><div>${icon("star")}<strong>+${reward.stars}</strong><span>${reward.stars ? "звезда ремонта" : "за повтор"}</span></div></div><p class="result-note">${reward.fresh ? "Ещё один маленький шаг к вашей новой лавке." : "Основная награда за этот заказ уже получена."}</p>${!progress.renovation && progress.stars >= 3 ? `<button class="primary" data-action="renovation">Пора обновить вывеску${icon("star")}</button>` : `<button class="primary" data-action="${all ? "home" : "next"}">${all ? "Вернуться в лавку" : "Следующий заказ"}${icon("arrow")}</button>`}<button class="quiet" data-action="home">В мою лавку${icon("home")}</button>`,
    false,
  );
}
function settingsModal() {
  showModal(
    "settings",
    `<span class="eyebrow">КАК ВАМ УЮТНЕЕ</span><h2>Настройки</h2><div class="settings-list">${(["sound", "music", "reducedMotion"] as const).map((key) => `<label class="setting-row"><span>${icon(key === "sound" ? "sound" : key === "music" ? "music" : "wave")}<span><strong>${{ sound: "Звуки", music: "Музыка", reducedMotion: "Меньше движения" }[key]}</strong><small>${{ sound: "Мягкие звуки товаров и заказов", music: "Спокойная мелодия на фоне", reducedMotion: "Без покачивания и частиц" }[key]}</small></span></span><input type="checkbox" data-setting="${key}" ${progress.settings[key] ? "checked" : ""}/><i class="toggle"></i></label>`).join("")}</div><button class="secondary" data-action="close">Готово${icon("check")}</button><p class="save-note">Прогресс автоматически сохраняется<br>в этом браузере.</p>`,
  );
}
function renovationModal() {
  const color = progress.renovation ?? "sea";
  showModal(
    "renovation",
    `<span class="eyebrow">ПЕРВЫЙ ШТРИХ · ВЫВЕСКА</span><h2>${progress.renovation ? "Выберите настроение" : "У лавки будет своё имя"}</h2><p>Маленькая перемена, которую заметит каждый.</p><div class="sign-preview ${color}" id="sign-preview">${icon("shell")}<strong>Лавка у моря</strong><small>Свежесть. Солнце. Немного счастья.</small></div><div class="color-choices">${(["sea", "honey", "coral"] as const).map((c) => `<button class="color-choice ${c} ${color === c ? "chosen" : ""}" data-color="${c}" aria-pressed="${color === c}" aria-label="${{ sea: "Морская бирюза", honey: "Тёплый мёд", coral: "Коралловый закат" }[c]}"><i></i><span>${{ sea: "Морская<br>бирюза", honey: "Тёплый<br>мёд", coral: "Коралловый<br>закат" }[c]}</span></button>`).join("")}</div><button class="primary" data-action="buy-renovation" data-choice="${color}" ${!progress.renovation && progress.stars < 3 ? "disabled" : ""}>${progress.renovation ? "Сохранить оформление" : "Обновить за 3 звезды"}${icon("star")}</button><p class="save-note">${progress.renovation ? "Открытые цвета можно менять бесплатно." : progress.stars < 3 ? `Осталось собрать ${3 - progress.stars} ${3 - progress.stars === 1 ? "звезду" : "звезды"} в новых заказах.` : "Выбор цвета не влияет на головоломки."}</p>`,
  );
}
function levelsModal() {
  showModal(
    "levels",
    `<span class="eyebrow">ГЛАВА 1 · СОЛНЕЧНОЕ УТРО</span><h2>Книжка заказов</h2><p>Десять маленьких историй одной лавки.</p><div class="level-list">${CHAPTER.map(
      (level, i) => {
        const completed = progress.completed.some((id) =>
          i < 3
            ? id.endsWith(`tutorial:${i + 1}`)
            : id.endsWith(`:${SEEDS[i]}`),
        );
        const unlocked = i <= progress.completed.length;
        return `<button class="level-entry ${completed ? "complete" : ""}" data-level="${i + 1}" ${unlocked ? "" : "disabled"}><span class="level-number">${completed ? icon("check") : i + 1}</span><span><strong>${level.name}</strong><small>${completed ? "Можно пройти ещё раз" : i === 6 ? "Открываем задние ряды" : i === 8 ? "Новая поставка" : i === 9 ? "Большой заказ" : "Заказ на три товара"}</small></span>${icon(unlocked ? "arrow" : "lock")}</button>`;
      },
    ).join("")}</div>`,
    true,
    true,
  );
}
function helpModal() {
  showModal(
    "help",
    `<span class="eyebrow">ОДИН ПРОСТОЙ ЖЕСТ</span><h2>Порядок — по тройкам</h2><div class="help-goods">${goodImage("j")}${goodImage("j")}${goodImage("j")}</div><ol class="help-steps"><li>Нажмите на товар, затем на свободное место. Или перетащите его мышью или пальцем.</li><li>Три одинаковых в переднем ряду одной полки автоматически уходят в заказ.</li><li>Очистите передний ряд, чтобы открыть следующий. Закрытая поставка ждёт указанное число троек.</li></ol><p>Никакого таймера. Отмена и перезапуск бесплатны. С клавиатуры: Tab и Enter, Escape снимает выбор.</p><button class="primary" data-action="close">Всё понятно${icon("check")}</button>`,
  );
}
function canPay(kind: "hint" | "mix" | "reserve", cost: number): boolean {
  if (progress.inventory[kind] > 0 || progress.coins >= cost) return true;
  showModal(
    "needCoins",
    `<div class="loading-shell">${icon(kind)}</div><h2>Немного терпения</h2><p>Для этой помощи нужно ${cost} монет.<br>Новые заказы дают по 60 монет.</p><p>Можно бесплатно отменить ход<br>или начать заказ заново.</p><button class="primary" data-action="close">Вернуться к заказу${icon("arrow")}</button>`,
  );
  return false;
}
function pay(kind: "hint" | "mix" | "reserve", cost: number) {
  if (progress.inventory[kind] > 0) progress.inventory[kind]--;
  else progress.coins -= cost;
}
async function hint() {
  if (busy || highlighted || won(current().board)) return;
  if (!canPay("hint", 100)) return;
  const attempt = current(),
    id = attempt.id;
  busy = true;
  toast("Ищем следующий шаг…");
  render();
  try {
    const solution =
      attempt.solution ??
      (await job<SearchResult>({ kind: "hint", board: attempt.board })).path;
    if (externalChanged || progress.attempt?.id !== id) return;
    if (!solution?.length) {
      toast(
        "За ограниченный поиск решение не найдено. Помощь не потрачена. Попробуйте отмену или перезапуск.",
      );
      return;
    }
    attempt.solution = solution;
    highlighted = solution[0];
    selected = highlighted[0];
    pay("hint", 100);
    persist();
    toast("Подсвечены товар и свободное место для него.");
  } catch (error) {
    toast(
      error instanceof Error
        ? error.message
        : "Подсказка недоступна. Помощь не потрачена.",
    );
  } finally {
    busy = false;
    render();
    renderSelection();
  }
}
async function mix() {
  if (busy || won(current().board) || !canPay("mix", 200)) return;
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
      toast("Подтверждённый вариант не найден. Помощь не потрачена.");
      return;
    }
    pay("mix", 200);
    attempt.board = result.board;
    attempt.solution = result.solution;
    attempt.undo = [];
    attempt.mixCount++;
    selected = null;
    highlighted = null;
    persist();
    audio.play("place");
    toast("Товары расставлены заново. Эта попытка по-прежнему имеет решение.");
  } catch (error) {
    toast(
      error instanceof Error
        ? error.message
        : "Не удалось перемешать. Помощь не потрачена.",
    );
  } finally {
    busy = false;
    render();
  }
}
function reserve() {
  if (busy || won(current().board)) return;
  const next = addReserve(current().board);
  if (!next || !canPay("reserve", 300)) return;
  pay("reserve", 300);
  current().board = next;
  current().undo = [];
  selected = null;
  highlighted = null;
  persist();
  render();
  toast("Добавлено одно место. Переносите товар туда и обратно.");
}
function undo() {
  const attempt = current();
  const previous = attempt.undo.pop();
  if (!previous || won(attempt.board)) return;
  attempt.board = previous;
  attempt.solution = null;
  selected = null;
  highlighted = null;
  persist();
  render();
  audio.play("place");
}
function action(name: string, button: HTMLElement) {
  if (externalChanged && name !== "refresh") return;
  if (busy && !["settings", "close"].includes(name)) return;
  audio.play("button");
  switch (name) {
    case "refresh":
      window.location.reload();
      break;
    case "play":
      if (progress.attempt && !won(progress.attempt.board))
        void start(progress.attempt.definition.number);
      else if (progress.completed.length >= 10) levelsModal();
      else void start(progress.completed.length + 1);
      break;
    case "home":
      closeModal();
      screen = "home";
      selected = null;
      highlighted = null;
      render();
      break;
    case "next":
      closeModal();
      if (current().definition.number >= 10) {
        screen = "home";
        render();
      } else void start(current().definition.number + 1);
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
    case "hint":
      void hint();
      break;
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
        `<h2>Попробуем ещё раз?</h2><p>Вернём исходную расстановку этого заказа.<br>Использованная помощь уже потрачена.</p><button class="primary" data-action="confirm-restart">Начать заново${icon("restart")}</button><button class="quiet" data-action="close">Продолжить попытку</button>`,
      );
      break;
    case "confirm-restart": {
      const def = current().definition;
      progress.attempt = {
        id: crypto.randomUUID(),
        definition: clone(def),
        board: initial(def),
        undo: [],
        solution: clone(def.verifiedSolution),
        mixCount: 0,
        reward: null,
      };
      selected = null;
      highlighted = null;
      persist();
      closeModal();
      render();
      break;
    }
    case "buy-renovation": {
      const color = button.dataset.choice as RenovationColor;
      if (
        !["sea", "honey", "coral"].includes(color) ||
        !renovate(progress, color)
      )
        return;
      persist();
      closeModal();
      screen = "home";
      render();
      audio.play("repair");
      toast("Как красиво! Новая вывеска уже встречает гостей.");
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
  else if (target.dataset.color) {
    const color = target.dataset.color;
    overlay.querySelectorAll<HTMLElement>("[data-color]").forEach((b) => {
      b.classList.toggle("chosen", b === target);
      b.setAttribute("aria-pressed", String(b === target));
    });
    overlay.querySelector("#sign-preview")!.className = `sign-preview ${color}`;
    overlay.querySelector<HTMLElement>(
      '[data-action="buy-renovation"]',
    )!.dataset.choice = color;
  }
});
document.addEventListener("change", (event) => {
  if (externalChanged) return;
  const input = event.target as HTMLInputElement;
  if (input.dataset.setting) {
    progress.settings[input.dataset.setting as keyof Settings] = input.checked;
    applySettings();
    persist();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (modal && overlay.querySelector('[data-action="close"]')) closeModal();
    else {
      selected = null;
      highlighted = null;
      renderSelection();
    }
  }
  if (event.key === "Tab" && modal) {
    const items = [
      ...overlay.querySelectorAll<HTMLElement>("button:not(:disabled),input"),
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
  audio.pause(document.hidden || !!modal);
});
window.addEventListener("blur", () => {
  endDrag(undefined, true);
  audio.pause(true);
});
window.addEventListener("focus", () => audio.pause(document.hidden || !!modal));
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
render();
if (loaded.warning) toast(loaded.warning);
