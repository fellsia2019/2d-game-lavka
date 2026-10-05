import "./style.css";
import "./author.css";
import {
  GOODS,
  initial,
  applyMove,
  validateDefinition,
  won,
  replay,
  type Definition,
  type Position,
  type Profile,
} from "./engine";
import {
  RECIPES,
  describeStructure,
  structuralKey,
  VERSION,
} from "./generator";
import { CHAPTER } from "./content";
import { job } from "./jobs";
const root = document.querySelector<HTMLDivElement>("#author")!;
root.innerHTML = `<header class="author-header"><h1>Мастерская контента</h1><a href="./">Открыть игру</a></header><main class="author-layout"><section class="author-controls"><label>Рецепт<select id="recipe">${RECIPES.map((r) => `<option value="${r.id}">${r.label}</option>`).join("")}</select></label><label>Seed<input id="seed" value="author-1" maxlength="64"></label><label>Заказ главы<select id="chapter">${CHAPTER.map((s, i) => `<option value="${i + 1}">${i + 1}. ${s.name}</option>`).join("")}</select></label><div class="author-actions"><button id="generate">Создать раскладку</button><button id="chapter-load">Открыть заказ главы</button><button id="reset">Заново</button><button id="step">Шаг решения</button></div><p id="author-status" role="status">Выберите рецепт и создайте раскладку. Недавние одинаковые структуры исключаются.</p><div id="author-summary"></div><div id="author-board" aria-label="Предпросмотр поля"></div></section><section class="author-editor"><label for="definition">Definition · версия правил ${VERSION}</label><textarea id="definition" spellcheck="false" aria-label="Definition JSON"></textarea><div class="author-actions"><button id="validate">Проверить JSON и открыть</button><button id="export" disabled>Скачать проверенный JSON</button><label class="author-file">Импорт JSON<input id="import" type="file" accept=".json,application/json"></label></div><p>Экспорт проверяет метаданные, состав, правила и воспроизводит решение до победы. Число найденных ходов не является оценкой сложности. Изменённый JSON нужно проверить заново.</p></section></main>`;
const q = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const editor = q<HTMLTextAreaElement>("definition"),
  status = q("author-status"),
  boardRoot = q("author-board");
let definition: Definition | null = null,
  board: ReturnType<typeof initial> | null = null,
  selected: Position | null = null,
  step = 0,
  busy = false,
  manuallyChanged = false;
let validatedText = "",
  recent: string[] = [];
function message(s: string, error = false) {
  status.textContent = s;
  status.classList.toggle("author-error", error);
}
function buttons() {
  editor.readOnly = busy;
  root
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")
    .forEach((el) => (el.disabled = busy));
  root
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(
      (b) =>
        (b.disabled =
          busy ||
          (["reset", "step", "export"].includes(b.id) && !definition) ||
          (b.id === "step" &&
            (manuallyChanged ||
              (!!board && won(board)) ||
              (!!definition && step >= definition.verifiedSolution.length))) ||
          (b.id === "export" && editor.value !== validatedText)),
    );
}
function showBoard() {
  if (!board || !definition) return;
  const active = document.activeElement as HTMLElement | null;
  const focusedPosition =
    active && boardRoot.contains(active) ? active.dataset.position : null;
  boardRoot.innerHTML = board.shelves
    .map(
      (sh, i) =>
        `<section class="author-shelf"><strong>Полка ${i + 1}${sh.rear.length ? ` · ещё ${sh.rear.length} ряд(а)` : ""}</strong>${sh.opened ? `<div>${sh.front.map((g, j) => `<button data-position="${i},${j}" aria-label="Полка ${i + 1}, место ${j + 1}: ${g ? GOODS[g].name : "свободно"}" aria-pressed="${selected?.[0] === i && selected[1] === j}">${g ? `<img src="${import.meta.env.BASE_URL}assets/${GOODS[g].file}.webp" alt="">` : "+"}</button>`).join("")}</div>` : `<p>Поставка после ${sh.unlockAfter} троек</p>`}</section>`,
    )
    .join("");
  q<HTMLButtonElement>("step").disabled =
    busy ||
    manuallyChanged ||
    step >= definition.verifiedSolution.length ||
    won(board);
  if (focusedPosition)
    boardRoot
      .querySelector<HTMLElement>(`[data-position="${focusedPosition}"]`)
      ?.focus({ preventScroll: true });
}
function accept(def: Definition) {
  validateDefinition(def);
  definition = def;
  board = initial(def);
  selected = null;
  step = 0;
  manuallyChanged = false;
  editor.value = JSON.stringify(def, null, 2);
  validatedText = editor.value;
  const info = describeStructure(def);
  q("author-summary").textContent =
    `${info.goods} товаров · ${info.kinds} вида · ${info.shelves} полок · ${info.free} свободных мест · проверенный путь ${info.verifiedMoves} ходов`;
  const key = structuralKey(def);
  recent = [...recent.filter((k) => k !== key), key].slice(-12);
  showBoard();
  buttons();
  message(
    "Решение воспроизведено до победы. Можно играть в предпросмотре или экспортировать.",
  );
}
async function create(chapter = false) {
  if (busy) return;
  busy = true;
  buttons();
  message("Проверяем раскладку…");
  try {
    const r = RECIPES.find(
      (r) => r.id === q<HTMLSelectElement>("recipe").value,
    )!;
    const def = await job<Definition>(
      chapter
        ? {
            kind: "level",
            number: Number(q<HTMLSelectElement>("chapter").value),
          }
        : {
            kind: "generate",
            seed: q<HTMLInputElement>("seed").value.trim(),
            profile: r.profile as Profile,
            options: { recipe: r.id, avoidStructures: recent },
          },
    );
    accept(def);
  } catch (e) {
    message(
      e instanceof Error ? e.message : "Не удалось проверить раскладку.",
      true,
    );
  } finally {
    busy = false;
    buttons();
    showBoard();
  }
}
q("generate").onclick = () => void create();
q("chapter-load").onclick = () => void create(true);
q("validate").onclick = () => {
  try {
    accept(JSON.parse(editor.value));
  } catch {
    validatedText = "";
    buttons();
    message(
      "JSON не прошёл проверку. Проверьте поля, товары, ряды и решение.",
      true,
    );
  }
};
editor.oninput = () => {
  buttons();
  message("JSON изменён. Перед экспортом проверьте его.");
};
q("reset").onclick = () => {
  if (!definition) return;
  board = initial(definition);
  step = 0;
  manuallyChanged = false;
  selected = null;
  showBoard();
  message("Восстановлена исходная раскладка.");
};
q("step").onclick = () => {
  if (!board || !definition) return;
  const move = definition.verifiedSolution[step],
    next = move && applyMove(board, ...move);
  if (!next) {
    message(
      "После ручных ходов нажмите «Заново», чтобы воспроизвести исходное решение.",
      true,
    );
    return;
  }
  board = next;
  step++;
  selected = null;
  showBoard();
  message(
    won(board)
      ? "Заказ готов! Проверенное решение воспроизведено."
      : `Шаг ${step}/${definition.verifiedSolution.length}`,
  );
};
boardRoot.onclick = (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-position]",
  );
  if (!button || !board) return;
  const pos = button.dataset.position!.split(",").map(Number) as Position;
  if (board.shelves[pos[0]].front[pos[1]]) {
    selected = pos;
    showBoard();
  } else if (selected) {
    const next = applyMove(board, selected, pos);
    if (next) {
      board = next;
      manuallyChanged = true;
      selected = null;
      showBoard();
      message(
        won(board)
          ? "Заказ готов!"
          : "Ручной перенос выполнен. Для исходного решения нажмите «Заново».",
      );
    }
  }
};
q("export").onclick = () => {
  try {
    const def = JSON.parse(editor.value);
    validateDefinition(def);
    if (!replay(def, def.verifiedSolution)) throw new Error();
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(def, null, 2)], { type: "application/json" }),
      );
    a.href = url;
    a.download = `${def.id.replace(/[^a-z0-9_-]/gi, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message("Проверенный JSON сохранён.");
  } catch {
    message("Экспорт отменён: сначала исправьте и проверьте JSON.", true);
  }
};
q<HTMLInputElement>("import").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error();
    accept(JSON.parse(await file.text()));
  } catch {
    message(
      "Не удалось импортировать проверенную Definition (до 100 КБ).",
      true,
    );
  }
};
buttons();
