import {
  CAMPAIGN_AREAS, PROJECTS, phaseStatus, projectById, projectOrders, projectTasks,
  type CampaignAreaId, type Project, type ProjectId,
} from "./campaign";
import { CHAPTER, canonicalLevelId } from "./content";
import type { Progress } from "./storage";

export type NavigationProgress = Readonly<Pick<Progress,
  "selectedProject" | "completed" | "campaign" | "attempt" | "attempts"
>>;
export interface NavigationDestination {
  projectId: ProjectId;
  areaId: CampaignAreaId;
  label: string;
  actionLabel: string;
  stage: number;
  status: "available" | "complete";
  started: boolean;
  isNew: boolean;
}
export interface NavigationNotice {
  kind: "locked" | "new";
  projectId: "warehouse-1";
  areaId: "warehouse";
  title: string;
  body: string;
  remainingOrders: number;
  remainingTasks: number;
}
export interface NavigationState {
  currentProject: Project;
  currentArea: (typeof CAMPAIGN_AREAS)[number];
  currentLabel: string;
  currentComplete: boolean;
  remainingOrders: number;
  remainingTasks: number;
  availableDestinations: NavigationDestination[];
  unlockedUnstarted: NavigationDestination[];
  nextDestination: NavigationDestination | null;
  warehouseNotice: NavigationNotice | null;
}

const areaLabels: Record<CampaignAreaId, string> = {
  shop: "Лавка", warehouse: "Склад", "fruit-yard": "Фруктовый двор",
  bakery: "Пекарня", terrace: "Терраса", restaurant: "Ресторан",
};
const openingLabels: Record<CampaignAreaId, string> = {
  shop: "Открыть лавку", warehouse: "Открыть склад", "fruit-yard": "Открыть фруктовый двор",
  bakery: "Открыть пекарню", terrace: "Открыть террасу", restaurant: "Открыть ресторан",
};
/** Player-facing places; project/stage ids remain internal campaign data. */
export function projectSpaceName(id:string):string {
  return ({'shop-1':'Торговый зал','shop-2':'Бакалея','warehouse-1':'Склад',
    'warehouse-2':'Холодильная комната','fruit-yard-1':'Фруктовый павильон',
    'fruit-yard-2':'Пристройка','bakery-1':'Пекарня'} as Record<string,string>)[id] ?? projectLabel(id);
}
export function projectEntryLabel(id:string):string {
  return ({'shop-1':'В лавку','shop-2':'В бакалею','warehouse-1':'К складу',
    'warehouse-2':'В холодильную','fruit-yard-1':'К павильону','fruit-yard-2':'К пристройке','bakery-1':'К пекарне'} as Record<string,string>)[id]??'Продолжить';
}
const orderProject = new Map(CHAPTER.map(order => [order.id, order.phaseId]));

/** Include the local stage only where the caller presents multiple stages. */
export function projectLabel(id: string, options: { includeStage?: boolean } = {}): string {
  const project = projectById(id);
  if (!project) return "Проект";
  const label = areaLabels[project.areaId];
  return options.includeStage ? `${label} · этап ${project.stage}` : label;
}

function remaining(progress: NavigationProgress, project: Project) {
  const done = new Set(progress.completed.map(canonicalLevelId));
  const owned = new Set(progress.campaign.completedTasks);
  return {
    remainingOrders: projectOrders(project.id).filter(order => !done.has(order.id)).length,
    remainingTasks: projectTasks(project.id).filter(task => !owned.has(task.id)).length,
  };
}

/** Opening a map or viewing an empty building alone does not consume its notice. */
function projectStarted(progress: NavigationProgress, project: Project): boolean {
  if (progress.completed.some(id => orderProject.get(canonicalLevelId(id)) === project.id) ||
    projectTasks(project.id).some(task => progress.campaign.completedTasks.includes(task.id))) return true;
  return [progress.attempt, ...Object.values(progress.attempts)].some(attempt =>
    attempt && orderProject.get(canonicalLevelId(attempt.definition.id)) === project.id);
}

function destination(progress: NavigationProgress, project: Project): NavigationDestination | null {
  const status = phaseStatus(project.id, progress.completed, progress.campaign);
  if (status !== "available" && status !== "complete") return null;
  const started = projectStarted(progress, project);
  return {
    projectId: project.id,
    areaId: project.areaId,
    label: projectLabel(project.id),
    actionLabel: status === "complete" ? `Осмотреть: ${areaLabels[project.areaId]}` : started
      ? `Продолжить: ${projectSpaceName(project.id)}` : project.stage > 1
        ? projectEntryLabel(project.id)
        : openingLabels[project.areaId],
    stage: project.stage,
    status,
    started,
    isNew: status === "available" && !started && project.requiresCompletedPhases.length > 0,
  };
}

/** A map pin selects an exact playable local project, never its locked successor. */
export function destinationForArea(progress: NavigationProgress, areaId: CampaignAreaId): NavigationDestination | null {
  const choices = PROJECTS.filter(project => project.areaId === areaId)
    .map(project => destination(progress, project)).filter((value): value is NavigationDestination => value !== null);
  return choices.filter(choice => choice.status === "available").sort((a, b) => a.stage - b.stage)[0]
    ?? choices.filter(choice => choice.status === "complete").sort((a, b) => b.stage - a.stage)[0]
    ?? null;
}

function warehouseNotice(progress: NavigationProgress): NavigationNotice | null {
  const warehouse = projectById("warehouse-1")!;
  const status = phaseStatus(warehouse.id, progress.completed, progress.campaign);
  const shop = projectById("shop-1")!;
  const counts = remaining(progress, shop);
  if (status === "locked") return {
    kind: "locked", projectId: "warehouse-1", areaId: "warehouse", title: "Как открыть склад",
    body: `Завершите все ${shop.orderTarget} заказов и ${shop.taskTarget} работ в лавке. Осталось заказов: ${counts.remainingOrders}, работ: ${counts.remainingTasks}.`,
    ...counts,
  };
  if (status === "available" && !projectStarted(progress, warehouse)) return {
    kind: "new", projectId: "warehouse-1", areaId: "warehouse", title: "Склад доступен",
    body: "Лавка готова. Во дворе открыт участок склада — можно начать его восстановление.",
    remainingOrders: 0, remainingTasks: 0,
  };
  return null;
}

/** Pure navigation guidance; issuing an attempt, paying and saving remain caller actions. */
export function navigationState(progress: NavigationProgress): NavigationState {
  const currentProject = projectById(progress.selectedProject)!;
  const availableDestinations = PROJECTS.map(project => destination(progress, project))
    .filter((value): value is NavigationDestination => value !== null);
  const currentComplete = phaseStatus(currentProject.id, progress.completed, progress.campaign) === "complete";
  const unfinished = availableDestinations.filter(choice => choice.status === "available" && choice.projectId !== currentProject.id);
  const nextDestination = currentComplete
    ? unfinished.find(choice => choice.areaId === currentProject.areaId && choice.stage > currentProject.stage)
      ?? unfinished.find(choice => !choice.started)
      ?? unfinished[0] ?? null
    : null;
  return {
    currentProject,
    currentArea: CAMPAIGN_AREAS.find(area => area.id === currentProject.areaId)!,
    currentLabel: projectLabel(currentProject.id),
    currentComplete,
    ...remaining(progress, currentProject),
    availableDestinations,
    unlockedUnstarted: availableDestinations.filter(choice => choice.status === "available" && !choice.started),
    nextDestination,
    warehouseNotice: warehouseNotice(progress),
  };
}
