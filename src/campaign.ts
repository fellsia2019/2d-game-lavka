import { CHAPTER, canonicalLevelId } from "./content";
import phasePlan from "./campaign-plan.json" with { type: "json" };
import blockPlan from "./campaign-block.json" with { type: "json" };

export const CAMPAIGN_VERSION = "coastal-campaign-8";
export type TaskCurrency = "repairKits" | "stars";
export interface CurrencyWallet { repairKits: number; stars: number; }
export const LEGACY_SHOP_STEPS = [
  { id: "first-shelf", name: "Первая полка", cost: 1, icon: "reserve", result: "Есть место для первого ассортимента." },
  { id: "display-baskets", name: "Корзины", cost: 2, icon: "reserve", result: "Полка готова для хлеба и фруктов." },
  { id: "first-stock", name: "Первые товары", cost: 2, icon: "check", result: "В лавке появились молоко, варенье, мёд и груши." },
  { id: "order-counter", name: "Прилавок", cost: 2, icon: "reserve", result: "Покупателям есть где получить заказ." },
  { id: "shop-opening", name: "Открытие лавки", cost: 3, icon: "shell", result: "Лавка открыта. Теперь добавим вторую выкладку." },
  { id: "shop-s1-t06", name: "Второй стеллаж", cost: 3, icon: "reserve", result: "У окна появился стеллаж для новой выкладки." },
  { id: "shop-s1-t07", name: "Новые корзины", cost: 3, icon: "reserve", result: "Вторая выкладка получила свои корзины." },
  { id: "shop-s1-t08", name: "Вторая выкладка", cost: 4, icon: "check", result: "На втором стеллаже появились новые запасы для покупателей." },
  { id: "shop-s1-t09", name: "Стеллаж заказов", cost: 4, icon: "reserve", result: "В рабочем углу торгового зала установлен стеллаж готовых заказов." },
  { id: "shop-s1-t10", name: "Корзины приёмки", cost: 2, icon: "reserve", result: "Стеллаж заказов получил корзины для приёмки." },
  { id: "shop-s1-t11", name: "Готовые заказы", cost: 4, icon: "check", result: "На стеллаже появились первые заказы для выдачи покупателям." },
] as const;
export const LEGACY_SHOP_TASKS = [
  {"id": "first-shelf", "cost": 1},
  {"id": "display-baskets", "cost": 2},
  {"id": "first-stock", "cost": 2},
  {"id": "order-counter", "cost": 2},
  {"id": "shop-opening", "cost": 3},
  {"id": "shop-s1-t06", "cost": 3},
  {"id": "shop-s1-t07", "cost": 3},
  {"id": "shop-s1-t08", "cost": 4},
  {"id": "shop-s1-t09", "cost": 4},
  {"id": "shop-s1-t10", "cost": 2},
  {"id": "shop-s1-t11", "cost": 4},
  {"id": "shop-s1-t12", "cost": 4},
  {"id": "shop-s1-t13", "cost": 2},
  {"id": "shop-s1-t14", "cost": 4},
  {"id": "shop-s1-t15", "cost": 3},
  {"id": "shop-s1-t16", "cost": 3},
  {"id": "shop-s1-t17", "cost": 4},
  {"id": "shop-s1-t18", "cost": 4},
  {"id": "shop-s1-t19", "cost": 3},
  {"id": "shop-s1-t20", "cost": 3},
  {"id": "shop-s1-t21", "cost": 4},
  {"id": "shop-s1-t22", "cost": 3},
  {"id": "shop-s1-t23", "cost": 3},
  {"id": "shop-s1-t24", "cost": 4},
  {"id": "shop-s1-t25", "cost": 3},
  {"id": "shop-s1-t26", "cost": 3},
] as const;
const SHOP_STEP_PLAN = [
  {"id": "shop-s1-r01", "name": "Восстановить пол", "cost": 6, "icon": "reserve", "result": "Восстановить пол. Работа завершена."},
  {"id": "shop-s1-r02", "name": "Восстановить стены", "cost": 5, "icon": "reserve", "result": "Восстановить стены. Работа завершена."},
  {"id": "shop-s1-r03", "name": "Обновить дверь и окно", "cost": 8, "icon": "reserve", "result": "Обновить дверь и окно. Работа завершена."},
  {"id": "shop-s1-r04", "name": "Поставить витрину у окна", "cost": 4, "icon": "reserve", "result": "Поставить витрину у окна. Работа завершена."},
  {"id": "shop-s1-r05", "name": "Оборудовать выкладку у окна", "cost": 7, "icon": "check", "result": "Оборудовать выкладку у окна. Работа завершена."},
  {"id": "shop-s1-r06", "name": "Установить основной стеллаж", "cost": 6, "icon": "reserve", "result": "Установить основной стеллаж. Работа завершена."},
  {"id": "shop-s1-r07", "name": "Наполнить основную витрину", "cost": 7, "icon": "check", "result": "Наполнить основную витрину. Работа завершена."},
  {"id": "shop-s1-r08", "name": "Оборудовать хлебную секцию", "cost": 5, "icon": "check", "result": "Оборудовать хлебную секцию. Работа завершена."},
  {"id": "shop-s1-r09", "name": "Собрать кассовый прилавок", "cost": 6, "icon": "reserve", "result": "Собрать кассовый прилавок. Работа завершена."},
  {"id": "shop-s1-r10", "name": "Установить кассу", "cost": 4, "icon": "check", "result": "Установить кассу. Работа завершена."},
  {"id": "shop-s1-r11", "name": "Оборудовать место упаковки", "cost": 8, "icon": "reserve", "result": "Оборудовать место упаковки. Работа завершена."},
  {"id": "shop-s1-r12", "name": "Установить стеллаж заказов", "cost": 5, "icon": "reserve", "result": "Установить стеллаж заказов. Работа завершена."},
  {"id": "shop-s1-r13", "name": "Подготовить готовые заказы", "cost": 6, "icon": "check", "result": "Подготовить готовые заказы. Работа завершена."},
  {"id": "shop-s1-r14", "name": "Завершить освещение лавки", "cost": 3, "icon": "reserve", "result": "Завершить освещение лавки. Работа завершена."},
] as const satisfies readonly { id: string; name: string; cost: number; icon: string; result: string }[];
export const shopStepCurrency = (index: number): TaskCurrency => index < 3 ? "repairKits" : "stars";
export const SHOP_STEPS = SHOP_STEP_PLAN.map((task, index) => ({ ...task, currency: shopStepCurrency(index) }));
export type ShopTaskId = (typeof SHOP_STEPS)[number]["id"] | (typeof LEGACY_SHOP_STEPS)[number]["id"];
export type ShopView = "hall" | "hall-prep" | "cold";
export const shopTaskView = (id: ShopTaskId): ShopView =>
  ["shop-s1-r11", "shop-s1-r12", "shop-s1-r13", "shop-s1-t09", "shop-s1-t10", "shop-s1-t11"].includes(id) ? "hall-prep" : "hall";
export const CAMPAIGN_AREAS = [
  { id: "shop", name: "Маленькая лавка", shortName: "Лавка", chapter: 1, x: 44, y: 36,
    goal: "Открыть магазин: поставить полку, наполнить её и подготовить место выдачи.",
    result: "Из пустого помещения появляется ваша первая лавка." },
  { id: "warehouse", name: "Склад и поставки", shortName: "Склад", chapter: 2, x: 79, y: 18,
    goal: "Расчистить заброшенный участок, разобрать старый сарай, построить и оборудовать новый склад.",
    result: "Появляются оборудованный склад и новая группа заказов." },
  { id: "fruit-yard", name: "Большая лавка и фруктовый двор", shortName: "Фрукты", chapter: 3, x: 24, y: 50,
    goal: "Расширить торговлю и обустроить открытый фруктовый уголок.",
    result: "Магазин становится больше, а заброшенный участок — работающим фруктовым павильоном." },
  { id: "bakery", name: "Пекарня", shortName: "Пекарня", chapter: 4, x: 76, y: 36,
    goal: "Построить пекарню, поставить печь, рабочий стол и витрину.",
    result: "У лавки появляется собственная выпечка." },
  { id: "terrace", name: "Терраса у моря", shortName: "Терраса", chapter: 5, x: 70, y: 60,
    goal: "Расчистить участок, построить опоры, настил и навес, затем оборудовать гостевую площадку.",
    result: "Торговый двор получает место отдыха с видом на море." },
  { id: "restaurant", name: "Второй этаж и ресторан", shortName: "2-й этаж", chapter: 6, x: 43, y: 17,
    goal: "Достроить второй этаж лавки и оборудовать ресторан.",
    result: "Открытие сезона завершает первую кампанию прибрежного двора." },
] as const;
export type CampaignAreaId = (typeof CAMPAIGN_AREAS)[number]["id"];

// The larger plan remains metadata. Only these projects have runtime content
// and scene layers; adding a planned phase never makes it playable by itself.
export const PROJECT_IDS = ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2", "bakery-1"] as const;
export type ProjectId = (typeof PROJECT_IDS)[number];
const REPAIR_TASK_PREFIX: Record<ProjectId, number> = {
  "shop-1": 3, "warehouse-1": 12, "fruit-yard-1": 12,
  "shop-2": 3, "warehouse-2": 3, "fruit-yard-2": 10,
  "bakery-1": 12,
};
export interface Construction {
  kind: string;
  states: string[];
  taskIds: string[];
  opensInteriorAfterTaskId: string;
  projectOrders: number;
  interiorOrders: number;
}
export interface Project {
  id: ProjectId;
  areaId: CampaignAreaId;
  stage: number;
  globalStage: number;
  title: string;
  result: string;
  orderTarget: number;
  taskTarget: number;
  taskIds: string[];
  requiresCompletedPhases: string[];
  construction?: Construction;
}
export interface CampaignTask {
  id: string;
  phaseId: ProjectId;
  index: number;
  name: string;
  cost: number;
  currency: TaskCurrency;
  target: string;
  icon: string;
  result: string;
  roomId?: "shop-hall";
  camera?: {
    number: 1 | 2;
    position: "south-east" | "south-west";
    target: "north-west" | "north-east";
  };
  primaryView?: "hall" | "hall-prep";
  visibleIn?: ("hall" | "hall-prep")[];
  sceneObjectId?: string;
  focusZone?: "whole" | "window" | "display" | "counter" | "packing" | "orders";
}
export const PROJECTS: readonly Project[] = blockPlan as Project[];
export const TASKS: readonly CampaignTask[] = blockPlan.flatMap(project => project.tasks.map((task, index) => ({
  ...task,
  phaseId: project.id as ProjectId,
  index: index + 1,
  currency: (index < REPAIR_TASK_PREFIX[project.id as ProjectId]
    ? "repairKits" : "stars") as TaskCurrency,
  icon: SHOP_STEPS.find(old => old.id === task.id)?.icon ?? (project.construction && index < project.construction.taskIds.length ? "shell" : "reserve"),
  result: `${task.name}. Работа завершена.`,
}))) as CampaignTask[];
export const isProjectId = (id: unknown): id is ProjectId => PROJECT_IDS.some(project => project === id);
export const projectById = (id: string) => PROJECTS.find(project => project.id === id);
export const projectTasks = (id: string) => TASKS.filter(task => task.phaseId === id);
export const projectOrders = (id: string) => CHAPTER.filter(order => order.phaseId === id);
export const taskBalance = (wallet: CurrencyWallet, task: Pick<CampaignTask, "currency">): number => wallet[task.currency];
export const repairOrderCount = (id: string): number => projectTasks(id)
  .filter(task => task.currency === "repairKits").reduce((sum, task) => sum + task.cost, 0);
const orderCurrencies = new Map(CHAPTER.map(order => [order.id,
  (order.localNumber <= repairOrderCount(order.phaseId) ? "repairKits" : "stars") as TaskCurrency]));
/** The issuing order's fixed local position selects its reward, independent of the current target. */
export const orderCurrency = (id: string): TaskCurrency | undefined => orderCurrencies.get(canonicalLevelId(id));
export const CAMPAIGN_PHASES = phasePlan;
export const FIRST_SHOP_PHASE = CAMPAIGN_PHASES.find(phase => phase.id === "shop-1")!;
export const CAMPAIGN_CHAPTERS = CAMPAIGN_AREAS.map(area => ({
  id: `chapter-${area.id}`,
  areaId: area.id,
  name: area.name,
  orderIds: CHAPTER.filter(order => CAMPAIGN_PHASES.some(phase => phase.areaId === area.id && phase.id === order.phaseId)).map(order => order.id),
  taskIds: TASKS.filter(task => PROJECTS.some(phase => phase.areaId === area.id && phase.id === task.phaseId)).map(task => task.id),
  phaseIds: CAMPAIGN_PHASES.filter(phase => phase.areaId === area.id).map(phase => phase.id),
  orderTarget: CAMPAIGN_PHASES.filter(phase => phase.areaId === area.id).reduce((sum, phase) => sum + phase.orderTarget, 0),
  taskTarget: CAMPAIGN_PHASES.filter(phase => phase.areaId === area.id).reduce((sum, phase) => sum + phase.taskTarget, 0),
}));
export interface CampaignProgress {
  version: typeof CAMPAIGN_VERSION;
  completedTasks: string[];
  /** Paid prefix of the former kitchen-first sequence, retained by schema 10. */
  bakeryLegacyPrefix?: number;
}
export const freshCampaign = (): CampaignProgress => ({ version: CAMPAIGN_VERSION, completedTasks: [] });
export function nextProjectTask(campaign: CampaignProgress, projectId: string): CampaignTask | undefined {
  return projectTasks(projectId).find(task => !campaign.completedTasks.includes(task.id));
}
// The first shop now consists of fourteen substantial restoration jobs.
export function nextShopTask(campaign: CampaignProgress) {
  return SHOP_STEPS.find(task => !campaign.completedTasks.includes(task.id));
}
type PhaseStatus = "planned" | "locked" | "available" | "complete";
function phaseStatusWithIds(id: string, completed: Set<string>, campaign: CampaignProgress, statuses: Map<string, PhaseStatus>): PhaseStatus {
  const cached = statuses.get(id);
  if (cached) return cached;
  const phase = CAMPAIGN_PHASES.find(p => p.id === id);
  const project = projectById(id);
  if (!phase || !project) return "planned";
  const orders = projectOrders(id);
  const tasks = projectTasks(id);
  let status: PhaseStatus;
  const produced = orders.length === phase.orderTarget && tasks.length === phase.taskTarget;
  if (produced && orders.every(order => completed.has(order.id)) &&
    tasks.every(task => campaign.completedTasks.includes(task.id))) status = "complete";
  else if (!orders.length || !tasks.length) status = "planned";
  else if (phase.requiresCompletedPhases.some(required => phaseStatusWithIds(required, completed, campaign, statuses) !== "complete")) status = "locked";
  else status = "available";
  statuses.set(id, status);
  return status;
}
export function phaseStatus(id: string, completed: string[], campaign: CampaignProgress): PhaseStatus {
  return phaseStatusWithIds(id, new Set(completed.map(canonicalLevelId)), campaign, new Map());
}
export function shopComplete(completed: string[], campaign: CampaignProgress): boolean {
  return phaseStatus("shop-1", completed, campaign) === "complete";
}
export type ProjectStatus = "planned" | "locked" | "site-available" | "clearing" | "construction" | "entry-ready" | "open" | "complete";
export function constructionState(id: string, campaign: CampaignProgress): string {
  const construction = projectById(id)?.construction;
  if (!construction) return "open";
  const count = construction.taskIds.filter(task => campaign.completedTasks.includes(task)).length;
  return construction.states[Math.min(count, construction.states.length - 1)];
}
export function interiorOpen(id: string, campaign: CampaignProgress): boolean {
  const construction = projectById(id)?.construction;
  return !construction || campaign.completedTasks.includes(construction.opensInteriorAfterTaskId)
    || (id === "bakery-1" && (campaign.bakeryLegacyPrefix ?? 0) >= 14);
}
export function projectStatus(id: string, completed: string[], campaign: CampaignProgress): ProjectStatus {
  const status = phaseStatus(id, completed, campaign);
  if (status !== "available") return status;
  const construction = projectById(id)?.construction;
  if (!construction || interiorOpen(id, campaign)) return "open";
  const count = construction.taskIds.filter(task => campaign.completedTasks.includes(task)).length;
  if (!count) return "site-available";
  if (count <= (construction.kind === "extension" ? 1 : 5)) return "clearing";
  if (count >= construction.taskIds.length - 2) return "entry-ready";
  return "construction";
}
export function areaStatus(id: CampaignAreaId, completed: string[], campaign: CampaignProgress): "planned" | "locked" | "available" | "complete" {
  const projects = PROJECTS.filter(project => project.areaId === id);
  if (!projects.length) return "planned";
  const statuses = projects.map(project => phaseStatus(project.id, completed, campaign));
  if (statuses.every(status => status === "complete")) return "complete";
  if (statuses.includes("available") || statuses.includes("complete")) return "available";
  return statuses.includes("locked") ? "locked" : "planned";
}
export function currentGlobalStage(completed: string[], campaign: CampaignProgress): number {
  // Completing every local project in one stage advances the computed stage.
  // Later, unproduced phases keep the value at the first unfinished stage.
  for (let stage = 1; stage <= 6; stage++) {
    const phases = CAMPAIGN_PHASES.filter(phase => phase.globalStage === stage);
    if (!phases.every(phase => phaseStatus(phase.id, completed, campaign) === "complete")) return stage;
  }
  return 6;
}
export function blockComplete(completed: string[], campaign: CampaignProgress): boolean {
  return PROJECTS.every(project => phaseStatus(project.id, completed, campaign) === "complete");
}
export function availableProjects(completed: string[], campaign: CampaignProgress): Project[] {
  return PROJECTS.filter(project => ["available", "complete"].includes(phaseStatus(project.id, completed, campaign)));
}
export function isProjectOrderUnlocked(completed: string[], campaign: CampaignProgress, number: number, projectId?: string): boolean {
  if (!Number.isInteger(number) || number < 1 || number > CHAPTER.length) return false;
  const order = CHAPTER[number - 1];
  if (projectId && projectId !== order.phaseId) return false;
  const done = new Set(completed.map(canonicalLevelId));
  const status = phaseStatusWithIds(order.phaseId, done, campaign, new Map());
  if (status !== "available" && status !== "complete") return false;
  const orders = projectOrders(order.phaseId);
  const localIndex = orders.indexOf(order);
  if (!orders.slice(0, localIndex).every(previous => done.has(previous.id))) return false;
  if (order.orderContext.requiresCompletedTaskId && !campaign.completedTasks.includes(order.orderContext.requiresCompletedTaskId)
    && !(order.phaseId === "bakery-1" && (campaign.bakeryLegacyPrefix ?? 0) >= 14)) return false;
  const construction = projectById(order.phaseId)?.construction;
  if (construction && localIndex >= construction.projectOrders && !interiorOpen(order.phaseId, campaign)) return false;
  return true;
}
export function nextProjectOrder(projectId: string, completed: string[], campaign: CampaignProgress): number | null {
  const done = new Set(completed.map(canonicalLevelId));
  const order = projectOrders(projectId).find(entry => !done.has(entry.id));
  if (!order) return null;
  const number = CHAPTER.indexOf(order) + 1;
  return isProjectOrderUnlocked(completed, campaign, number, projectId) ? number : null;
}
export interface LegacyCampaignProgress {
  version: string;
  completedTasks: string[];
  legacyTaskOrder?: true;
}
export function campaignWithLegacyOrder(completedTasks: string[]): LegacyCampaignProgress {
  const firstFive = LEGACY_SHOP_STEPS.slice(0, 5);
  const outOfOrder = firstFive.some((task, index) => completedTasks.includes(task.id) &&
    firstFive.slice(0, index).some(previous => !completedTasks.includes(previous.id)));
  return { version: "coastal-campaign-4", completedTasks,
    ...(outOfOrder ? { legacyTaskOrder: true as const } : {}) };
}
export function migrateCampaign(renovations: Record<string, unknown>): LegacyCampaignProgress {
  const tasks = new Set<string>();
  if (renovations.sign) tasks.add("shop-opening");
  if (renovations.counter) { tasks.add("first-shelf"); tasks.add("order-counter"); }
  if (renovations.window) { tasks.add("display-baskets"); tasks.add("first-stock"); }
  return campaignWithLegacyOrder(LEGACY_SHOP_STEPS.filter(task => tasks.has(task.id)).map(task => task.id));
}
function validTasks(value: unknown, version: string, tasks: readonly { id: string; phaseId?: string }[], allowFirstFive: boolean, allowBakeryMigration = false): boolean {
  if (!value || typeof value !== "object") return false;
  const c = value as { version?: string; completedTasks?: unknown[]; legacyTaskOrder?: unknown; bakeryLegacyPrefix?: unknown };
  if (c.version !== version || !Array.isArray(c.completedTasks) ||
    new Set(c.completedTasks).size !== c.completedTasks.length ||
    !c.completedTasks.every(id => tasks.some(task => task.id === id)) ||
    (c.legacyTaskOrder !== undefined && (c.legacyTaskOrder !== true || !allowFirstFive)) ||
    (c.bakeryLegacyPrefix !== undefined && (!allowBakeryMigration || !Number.isInteger(c.bakeryLegacyPrefix)
      || (c.bakeryLegacyPrefix as number) < 13 || (c.bakeryLegacyPrefix as number) > 25))) return false;
  for (const project of PROJECTS) {
    const sequence = tasks.filter(task => (task.phaseId ?? "shop-1") === project.id);
    if (project.id === "bakery-1" && typeof c.bakeryLegacyPrefix === "number") {
      const grandfathered = new Set(sequence.map(task => task.id).sort().slice(0, c.bakeryLegacyPrefix));
      if (![...grandfathered].every(id => c.completedTasks!.includes(id))) return false;
      const remaining = sequence.filter(task => !grandfathered.has(task.id));
      if (!remaining.every((task, index) => !c.completedTasks!.includes(task.id)
        || remaining.slice(0, index).every(previous => c.completedTasks!.includes(previous.id)))) return false;
      continue;
    }
    if (!sequence.every((task, index) => !c.completedTasks!.includes(task.id) ||
      (allowFirstFive && project.id === "shop-1" && index < 5) ||
      sequence.slice(0, index).every(previous => c.completedTasks!.includes(previous.id)))) return false;
  }
  return true;
}
export function validCampaign(value: unknown): value is CampaignProgress {
  return validTasks(value, CAMPAIGN_VERSION, TASKS, false, true);
}
export const validLegacyCampaign = (value: unknown): boolean => validTasks(value, "coastal-campaign-1", LEGACY_SHOP_STEPS.slice(0, 5), true);
export const validPreviousCampaign = (value: unknown): boolean => validTasks(value, "coastal-campaign-2", LEGACY_SHOP_STEPS.slice(0, 8), true);
export const validSchemaFiveCampaign = (value: unknown): boolean => validTasks(value, "coastal-campaign-3", LEGACY_SHOP_STEPS, true);
export const validSchemaSixCampaign = (value: unknown): value is LegacyCampaignProgress =>
  validTasks(value, "coastal-campaign-4", [...LEGACY_SHOP_TASKS, ...TASKS.filter(task => task.phaseId !== "shop-1" && task.phaseId !== "bakery-1")],
    (value as LegacyCampaignProgress | null)?.legacyTaskOrder === true);
export const validSchemaSevenCampaign = (value: unknown): boolean => validTasks(value, "coastal-campaign-5", TASKS.filter(task => task.phaseId !== "bakery-1"), false);
export const validSchemaEightCampaign = (value: unknown): boolean => validTasks(value, "coastal-campaign-6", TASKS.filter(task => task.phaseId !== "bakery-1"), false);
export const validSchemaNineCampaign = (value: unknown): boolean => validTasks(value, "coastal-campaign-7",
  [...TASKS.filter(task => task.phaseId !== "bakery-1"), ...projectTasks("bakery-1").slice().sort((a, b) => a.id.localeCompare(b.id))], false);

// Preserve paid star credit rather than guessing equivalence between old props
// and whole new modules. Unspent credit is refunded exactly once by schema 7.
export function migrateShopCampaign(old: LegacyCampaignProgress): { campaign: CampaignProgress; refund: number; paid: number } {
  const paid = LEGACY_SHOP_TASKS.reduce((sum, task) => sum + (old.completedTasks.includes(task.id) ? task.cost : 0), 0);
  let remaining = paid;
  const owned: string[] = [];
  for (const task of SHOP_STEPS) {
    if (remaining < task.cost) break;
    owned.push(task.id);
    remaining -= task.cost;
  }
  const legacyIds = new Set<string>(LEGACY_SHOP_TASKS.map(task => task.id));
  return { campaign: { version: CAMPAIGN_VERSION,
    completedTasks: [...owned, ...old.completedTasks.filter(id => !legacyIds.has(id))] }, refund: remaining, paid };
}
