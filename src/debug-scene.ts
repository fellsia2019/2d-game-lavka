import {
  isProjectId, projectById, PROJECTS, projectOrders, projectTasks,
  type ProjectId,
} from "./campaign";
import { canonicalLevelId } from "./content";
import { type Progress } from "./storage";

/** Deliberate scene-review state, separate from an order victory or its reward. */
export interface DebugSceneState {
  projectId: ProjectId;
  works: number;
  orders: number;
}
export type DebugScenePreset = "start" | "middle" | "built" | "complete";
export type DebugCurrency = "stars" | "repairKits" | "coins";
export interface DebugSceneResult {
  ok: boolean;
  message: string;
  /** Only the required ancestors are completed; independent branches stay intact. */
  prerequisites: ProjectId[];
}

const safe = (number: unknown): number is number => Number.isSafeInteger(number) && (number as number) >= 0;
const projectLabel = (id: ProjectId) => {
  const project = projectById(id)!;
  const area = { shop: "Лавка", warehouse: "Склад", "fruit-yard": "Фруктовый двор", bakery: "Пекарня" };
  return `${area[project.areaId as keyof typeof area] ?? project.title} · этап ${project.stage}`;
};
const escape = (text: string) => text.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function validDebugSceneState(state: DebugSceneState): boolean {
  if (!state || !isProjectId(state.projectId) || !safe(state.works) || !safe(state.orders)) return false;
  return state.works <= projectTasks(state.projectId).length && state.orders <= projectOrders(state.projectId).length;
}

export function debugScenePreset(projectId: ProjectId, preset: DebugScenePreset): DebugSceneState {
  const works = projectTasks(projectId).length, orders = projectOrders(projectId).length;
  if (preset === "start") return { projectId, works: 0, orders: 0 };
  if (preset === "middle") return { projectId, works: Math.floor(works / 2), orders: Math.floor(orders / 2) };
  if (preset === "built") return { projectId, works, orders: 0 };
  return { projectId, works, orders };
}

/** Read-only preparation. A broken catalog cannot partially alter a save. */
function prerequisitesFor(projectId: ProjectId): ProjectId[] | null {
  const done = new Set<ProjectId>(), visiting = new Set<ProjectId>(), result: ProjectId[] = [];
  const visit = (id: ProjectId): boolean => {
    if (done.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    const project = projectById(id);
    if (!project) return false;
    for (const required of project.requiresCompletedPhases) {
      if (!isProjectId(required) || !visit(required)) return false;
    }
    visiting.delete(id);
    done.add(id);
    if (id !== projectId) result.push(id);
    return true;
  };
  return visit(projectId) ? result : null;
}

/**
 * Explicitly replace the selected project's visual progress and its attempt.
 * This is a test-state operation: it emits no victory, reward or economy event.
 * Other pinned attempts retain their object, board, Definition and hint cache.
 */
export function applyDebugSceneState(progress: Progress, state: DebugSceneState): DebugSceneResult {
  const reject = (message: string): DebugSceneResult => ({ ok: false, message, prerequisites: [] });
  if (!validDebugSceneState(state)) return reject("Укажите допустимое число работ и заказов.");
  if (![progress.stars, progress.repairKits, progress.coins].every(safe)) return reject("Не удалось безопасно изменить кошелёк.");
  const prerequisites = prerequisitesFor(state.projectId);
  if (!prerequisites) return reject("Не удалось подготовить зависимости выбранного этапа.");
  const tasks = projectTasks(state.projectId), orders = projectOrders(state.projectId);
  const selectedTasks = new Set(tasks.map(task => task.id));
  const selectedOrders = new Set(orders.map(order => order.id));
  const completed = new Set(progress.completed.map(canonicalLevelId).filter(id => !selectedOrders.has(id)));
  const completedTasks = new Set(progress.campaign.completedTasks.filter(id => !selectedTasks.has(id)));
  for (const required of prerequisites) {
    for (const order of projectOrders(required)) completed.add(order.id);
    for (const task of projectTasks(required)) completedTasks.add(task.id);
  }
  for (const order of orders.slice(0, state.orders)) completed.add(order.id);
  for (const task of tasks.slice(0, state.works)) completedTasks.add(task.id);

  // Fund only the chosen project's remaining works. Reapplying a preset cannot
  // keep adding money; manually added funds and unrelated wallets are retained.
  const remaining = tasks.slice(state.works);
  const repairKits = Math.max(progress.repairKits, remaining.filter(task => task.currency === "repairKits").reduce((sum, task) => sum + task.cost, 0));
  const stars = Math.max(progress.stars, remaining.filter(task => task.currency === "stars").reduce((sum, task) => sum + task.cost, 0));
  if (!safe(repairKits) || !safe(stars)) return reject("Не удалось безопасно подготовить валюту.");

  const attempts = { ...progress.attempts };
  // The active alias may be newer than the last persisted per-project entry.
  if (progress.attempt) attempts[progress.selectedProject] = progress.attempt;
  else delete attempts[progress.selectedProject];
  delete attempts[state.projectId];
  const renovations = { ...progress.renovations };
  if (completedTasks.has("shop-s1-r09")) renovations.counter ??= "sea";
  if (completedTasks.has("shop-s1-r14")) renovations.sign ??= "sea";

  Object.assign(progress, {
    campaign: { ...progress.campaign, completedTasks: [...completedTasks] },
    completed: [...completed], selectedProject: state.projectId,
    attempts, attempt: null, repairKits, stars,
    renovations, renovation: renovations.sign ?? null,
  });
  if (state.projectId === "bakery-1") delete progress.campaign.bakeryLegacyPrefix;
  return { ok: true, prerequisites,
    message: `${projectLabel(state.projectId)}: ${state.works}/${tasks.length} работ, ${state.orders}/${orders.length} заказов. Валюта для оставшихся работ подготовлена.` };
}

/** Currency adjustment never marks an order or changes a pinned attempt. */
export function addDebugCurrency(progress: Progress, currency: DebugCurrency, amount: number): boolean {
  if (!["stars", "repairKits", "coins"].includes(currency) || !safe(amount) || amount === 0 ||
    !safe(progress[currency]) || !safe(progress[currency] + amount)) return false;
  progress[currency] += amount;
  return true;
}

function currentSceneState(progress: Progress, projectId: ProjectId): DebugSceneState {
  const completed = new Set(progress.completed.map(canonicalLevelId));
  return { projectId,
    works: projectTasks(projectId).filter(task => progress.campaign.completedTasks.includes(task.id)).length,
    orders: projectOrders(projectId).filter(order => completed.has(order.id)).length };
}

function worksOptions(projectId: ProjectId, value: number): string {
  return [{ name: "Ни одной работы", id: "" }, ...projectTasks(projectId)].map((task, index) =>
    `<option value="${index}" ${value === index ? "selected" : ""}>${index} / ${projectTasks(projectId).length}${index ? ` · ${escape(task.name)}` : ""}</option>`).join("");
}

export function debugSceneHTML(progress: Progress): string {
  const state = currentSceneState(progress, progress.selectedProject);
  return `<section class="debug-scene" aria-labelledby="debug-scene-heading">
    <h3 id="debug-scene-heading">Сцены и прогресс</h3>
    <label class="debug-scene-field"><span>Здание и этап</span><select id="debug-scene-project" data-debug-field="project">${PROJECTS.map(project => `<option value="${project.id}" ${project.id === state.projectId ? "selected" : ""}>${escape(projectLabel(project.id))}</option>`).join("")}</select></label>
    <div class="debug-scene-presets"><button class="secondary" data-action="debug-scene-preset" data-preset="start">С начала</button><button class="secondary" data-action="debug-scene-preset" data-preset="middle">Половина</button><button class="secondary" data-action="debug-scene-preset" data-preset="built">Все работы</button><button class="secondary" data-action="debug-scene-preset" data-preset="complete">Этап пройден</button></div>
    <label class="debug-scene-field"><span>Показать улучшение</span><select id="debug-scene-works" data-debug-field="works">${worksOptions(state.projectId, state.works)}</select></label>
    <label class="debug-scene-field"><span>Зачесть заказов <small data-debug-order-total>из ${projectOrders(state.projectId).length}</small></span><input id="debug-scene-orders" data-debug-field="orders" type="number" inputmode="numeric" min="0" max="${projectOrders(state.projectId).length}" step="1" value="${state.orders}"/></label>
    <p class="debug-scene-note">Предыдущие работы будут готовы, выбранное улучшение появится с обычным эффектом. При выборе начала откроется исходная сцена. Текущий заказ этого этапа сбросится; остальные сохранятся.</p>
    <button class="primary" data-action="debug-scene-apply">Применить и открыть сцену</button>
  </section>
  <section class="debug-scene debug-scene-wallet" aria-labelledby="debug-wallet-heading">
    <h3 id="debug-wallet-heading">Добавить валюту</h3>
    <div class="debug-wallet-fields"><label class="debug-scene-field"><span>Валюта</span><select data-debug-field="currency"><option value="stars">Звёзды</option><option value="repairKits">Ремкомплекты</option><option value="coins">Монеты</option></select></label><label class="debug-scene-field"><span>Количество</span><input data-debug-field="amount" type="number" inputmode="numeric" min="1" step="1" value="10"/></label></div>
    <button class="secondary" data-action="debug-scene-currency">Добавить</button>
    <p class="debug-scene-note">Открытый заказ и его игровая награда не меняются.</p>
  </section>`;
}

export function readDebugSceneState(root: ParentNode): DebugSceneState | null {
  const projectId = root.querySelector<HTMLSelectElement>('[data-debug-field="project"]')?.value;
  const works = root.querySelector<HTMLSelectElement>('[data-debug-field="works"]')?.value;
  const orders = root.querySelector<HTMLInputElement>('[data-debug-field="orders"]')?.value;
  if (!isProjectId(projectId) || works === undefined || orders === undefined || works.trim() === "" || orders.trim() === "") return null;
  const state = { projectId, works: Number(works), orders: Number(orders) };
  return validDebugSceneState(state) ? state : null;
}

/** Selecting a different project fills its current state; presets remain editable. */
export function updateDebugSceneFields(root: ParentNode, progress: Progress, preset?: DebugScenePreset): boolean {
  const projectId = root.querySelector<HTMLSelectElement>('[data-debug-field="project"]')?.value;
  if (!isProjectId(projectId)) return false;
  const works = root.querySelector<HTMLSelectElement>('[data-debug-field="works"]');
  const orders = root.querySelector<HTMLInputElement>('[data-debug-field="orders"]');
  const total = root.querySelector<HTMLElement>('[data-debug-order-total]');
  if (!works || !orders || !total) return false;
  const state = preset ? debugScenePreset(projectId, preset) : currentSceneState(progress, projectId);
  works.innerHTML = worksOptions(projectId, state.works);
  orders.max = String(projectOrders(projectId).length);
  orders.value = String(state.orders);
  total.textContent = `из ${projectOrders(projectId).length}`;
  return true;
}

export function readDebugCurrency(root: ParentNode): { currency: DebugCurrency; amount: number } | null {
  const currency = root.querySelector<HTMLSelectElement>('[data-debug-field="currency"]')?.value;
  const raw = root.querySelector<HTMLInputElement>('[data-debug-field="amount"]')?.value;
  if (!["stars", "repairKits", "coins"].includes(currency ?? "") || !raw?.trim()) return null;
  const amount = Number(raw);
  return safe(amount) && amount > 0 ? { currency: currency as DebugCurrency, amount } : null;
}
