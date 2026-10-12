import { PROJECTS, blockComplete, projectOrders, projectTasks, type ProjectId } from './campaign';
import { canonicalLevelId } from './content';
import type { Progress } from './storage';

// Bump this id when a new delivered chapter gets its own closing celebration.
export const FINAL_ACHIEVEMENT_ID = 'coastal-campaign-finale-v1';
type AchievementProgress = Pick<Progress, 'completed' | 'campaign' | 'achievementsSeen'>;
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: 'star' | 'home' | 'reserve' | 'trophy';
  projectId?: ProjectId;
  earned: boolean;
  ordersDone: number;
  ordersTotal: number;
  tasksDone: number;
  tasksTotal: number;
}

const milestones: Record<ProjectId, Pick<Achievement, 'title' | 'description' | 'icon'>> = {
  'shop-1': { title: 'Лавка открыта!', description: 'Торговый зал восстановлен, все его заказы выполнены.', icon: 'home' },
  'warehouse-1': { title: 'Всё на своих местах!', description: 'Склад построен и обустроен, все его заказы выполнены.', icon: 'reserve' },
  'shop-2': { title: 'Полные полки!', description: 'Бакалея готова встречать покупателей, все её заказы выполнены.', icon: 'home' },
  'warehouse-2': { title: 'Запасы в порядке!', description: 'Холодильная комната обустроена, все её заказы выполнены.', icon: 'reserve' },
  'fruit-yard-1': { title: 'Фруктовый двор открыт!', description: 'Павильон обустроен, все его заказы выполнены.', icon: 'star' },
  'fruit-yard-2': { title: 'Больше места для фруктов!', description: 'Пристройка готова, все её заказы выполнены.', icon: 'star' },
  'bakery-1': { title: 'Пекарня открыта!', description: 'Торговый зал и кухня обустроены, все заказы пекарни выполнены.', icon: 'home' },
  'terrace-1': { title: 'Отдых у моря!', description: 'Терраса обустроена, все её заказы выполнены.', icon: 'star' },
  'restaurant-1': { title: 'Ресторан открыт!', description: 'Второй этаж обустроен, все заказы ресторана выполнены.', icon: 'trophy' },
};

/** Medals reflect real ownership and first wins; opening a building is insufficient. */
export function campaignAchievements(progress: AchievementProgress): Achievement[] {
  const orders = new Set(progress.completed.map(canonicalLevelId));
  const tasks = new Set(progress.campaign.completedTasks);
  return PROJECTS.map(project => {
    const projectOrderIds = projectOrders(project.id).map(order => order.id);
    const projectTaskIds = projectTasks(project.id).map(task => task.id);
    const ordersDone = projectOrderIds.filter(id => orders.has(id)).length;
    const tasksDone = projectTaskIds.filter(id => tasks.has(id)).length;
    return {
      id: `project:${project.id}`, projectId: project.id, ...milestones[project.id],
      ordersDone, ordersTotal: project.orderTarget, tasksDone, tasksTotal: project.taskTarget,
      earned: projectOrderIds.length === project.orderTarget && projectTaskIds.length === project.taskTarget
        && ordersDone === project.orderTarget && tasksDone === project.taskTarget,
    };
  });
}

export function finalAchievement(progress: AchievementProgress): Achievement {
  const medals = campaignAchievements(progress);
  return {
    id: FINAL_ACHIEVEMENT_ID, title: 'Торговый двор ожил!', icon: 'trophy',
    description: 'Все доступные заказы и работы завершены. Двор снова живёт!',
    earned: blockComplete(progress.completed, progress.campaign),
    ordersDone: medals.reduce((sum, medal) => sum + medal.ordersDone, 0),
    ordersTotal: medals.reduce((sum, medal) => sum + medal.ordersTotal, 0),
    tasksDone: medals.reduce((sum, medal) => sum + medal.tasksDone, 0),
    tasksTotal: medals.reduce((sum, medal) => sum + medal.tasksTotal, 0),
  };
}

const validIds = new Set([FINAL_ACHIEVEMENT_ID, ...PROJECTS.map(project => `project:${project.id}`)]);
/** Optional presentation metadata must never invalidate a gameplay save. */
export function normalizeAchievementSeen(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && validIds.has(id)))] : [];
}

export function unseenAchievement(progress: AchievementProgress, projectId?: ProjectId): Achievement | undefined {
  const seen = new Set(progress.achievementsSeen);
  const finale = finalAchievement(progress);
  if (finale.earned && !seen.has(finale.id)) return finale;
  return campaignAchievements(progress).find(medal => medal.projectId === projectId && medal.earned && !seen.has(medal.id));
}

/** Only dismiss-notification state changes: medals never issue currency or orders. */
export function acknowledgeAchievement(progress: AchievementProgress, id: string): boolean {
  const achievement = id === FINAL_ACHIEVEMENT_ID ? finalAchievement(progress)
    : campaignAchievements(progress).find(medal => medal.id === id);
  if (!achievement?.earned) return false;
  progress.achievementsSeen = normalizeAchievementSeen([...(progress.achievementsSeen ?? []), id]);
  return true;
}
