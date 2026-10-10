import {
  applyMove,
  clone,
  countGoods,
  initial,
  validateDefinition,
  won,
  type Board,
  type Definition,
  type Move,
} from "./engine";
import { GOOD_IDS, isGood } from "./catalog";
import { CAMPAIGN_VERSION, freshCampaign, migrateCampaign, nextProjectTask, phaseStatus,
  campaignWithLegacyOrder, isProjectId, validCampaign, validLegacyCampaign,
  validPreviousCampaign, validSchemaFiveCampaign, validSchemaSixCampaign, validSchemaSevenCampaign, validSchemaEightCampaign, validSchemaNineCampaign, validSchemaTenCampaign, migrateShopCampaign,
  orderCurrency, taskBalance, TASKS, type CampaignProgress, type ProjectId,
  type ShopTaskId } from "./campaign";
import {
  CHAPTER,
  canonicalLevelId,
  chapterNumber,
  catalogNumber,
  CONTENT_VERSION,
} from "./content";
import {
  RENOVATIONS,
  type RenovationColor,
  type RenovationId,
} from "./renovations";
import { createOrderAppearance, validOrderAppearance, type OrderAppearance } from "./order-supplies";
import { freshSceneDecor, validSceneDecor, type SceneDecor } from "./scene-shop";
export type { RenovationColor } from "./renovations";
export interface Settings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
}
export interface Attempt {
  id: string;
  definition: Definition;
  board: Board;
  undo: Board[];
  solution: Move[] | null;
  mixCount: number;
  hints: Record<string, Move[]>;
  appearance?: OrderAppearance;
  reward: { coins: number; stars: number; repairKits: number; fresh: boolean } | null;
}
export interface Progress {
  schema: 11;
  campaign: CampaignProgress;
  contentVersion: string;
  completed: string[];
  coins: number;
  stars: number;
  repairKits: number;
  inventory: { hint: number; mix: number; reserve: number };
  renovation: RenovationColor | null;
  renovations: Partial<Record<RenovationId, RenovationColor>>;
  /** Optional in earlier schema-8 saves; independent from campaign ownership. */
  sceneDecor?: SceneDecor;
  tutorialSeen: string[];
  recentStructures: string[];
  settings: Settings;
  selectedProject: ProjectId;
  attempts: Partial<Record<ProjectId, Attempt>>;
  // Active alias retained for the game controller. save/switch sync it to attempts.
  attempt: Attempt | null;
  repeatDay: string;
  repeatCount: number;
}
// Retain the original key: v1 saves are migrated in place, never abandoned.
export const STORAGE_KEY = "coastal-shop:progress:v1";
export function freshProgress(): Progress {
  return {
    schema: 11,
    campaign: freshCampaign(),
    contentVersion: CONTENT_VERSION,
    completed: [],
    coins: 0,
    stars: 0,
    repairKits: 0,
    inventory: { hint: 2, mix: 1, reserve: 1 },
    renovation: null,
    renovations: {},
    sceneDecor: freshSceneDecor(),
    tutorialSeen: [],
    recentStructures: [],
    settings: { sound: true, music: false, reducedMotion: false },
    selectedProject: "shop-1",
    attempts: {},
    attempt: null,
    repeatDay: "",
    repeatCount: 0,
  };
}
const safe = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0;
const colors = [null, "sea", "honey", "coral"];
export const hintStateKey = (board: Board) =>
  JSON.stringify([
    board.shelves,
    board.delivered,
    board.triples,
    board.budget,
    board.budget === null ? 0 : board.used,
  ]);
function sameCounts(a: Board["goals"], b: Board["goals"]): boolean {
  return (
    Object.keys(a).every(isGood) &&
    Object.keys(b).every(isGood) &&
    GOOD_IDS.every((k) => (a[k] ?? 0) === (b[k] ?? 0))
  );
}
export function finishes(board: Board, path: Move[]): boolean {
  try {
    let s = clone(board);
    for (const [a, b] of path) {
      const next = applyMove(s, a, b);
      if (!next) return false;
      s = next;
    }
    return won(s);
  } catch {
    return false;
  }
}
export function cachedHint(attempt: Attempt): Move[] | null {
  const path = attempt.hints[hintStateKey(attempt.board)];
  return path?.length && finishes(attempt.board, path) ? clone(path) : null;
}
export function rememberHint(attempt: Attempt, path: Move[]): boolean {
  if (!path.length || !finishes(attempt.board, path)) return false;
  attempt.hints[hintStateKey(attempt.board)] = clone(path);
  attempt.solution = clone(path);
  return true;
}
export function validateAttempt(attempt: Attempt): boolean {
  try {
    validateDefinition(attempt.definition);
    const number = chapterNumber(attempt.definition.id);
    if (
      !number ||
      attempt.definition.number > 10000 ||
      attempt.definition.number !== catalogNumber(attempt.definition.id) ||
      typeof attempt.id !== "string" ||
      !attempt.id ||
      !safe(attempt.mixCount) ||
      !Array.isArray(attempt.undo) ||
      !attempt.hints ||
      typeof attempt.hints !== "object" ||
      Array.isArray(attempt.hints)
    )
      return false;
    if (attempt.appearance !== undefined && !validOrderAppearance(attempt.appearance, attempt.definition)) return false;
    const goal = initial(attempt.definition).goals;
    const validateBoard = (board: Board) => {
      if (
        !board ||
        !sameCounts(board.goals, goal) ||
        !sameCounts(countGoods(board), goal) ||
        Object.entries(board.delivered).some(
          ([k, n]) => !isGood(k) || !safe(n) || n! % 3 || n! > (goal[k] ?? 0),
        ) ||
        !safe(board.used) ||
        board.budget !== attempt.definition.budget ||
        (board.budget !== null && board.used > board.budget) ||
        !Array.isArray(board.shelves) ||
        board.shelves.length < attempt.definition.shelves.length ||
        board.shelves.length > attempt.definition.shelves.length + 1 ||
        !Array.isArray(board.events) ||
        board.events.length > 100
      )
        return false;
      return (
        board.shelves.every((sh, i) => {
          const original = attempt.definition.shelves[i];
          if (
            !Array.isArray(sh.front) ||
            !Array.isArray(sh.rear) ||
            typeof sh.opened !== "boolean" ||
            (sh.reserve !== undefined && typeof sh.reserve !== "boolean") ||
            sh.front.length !== (sh.reserve ? 1 : 3) ||
            sh.rear.some((r) => !Array.isArray(r) || r.length !== 3) ||
            [...sh.front, ...sh.rear.flat()].some(
              (k) => k !== null && !isGood(k),
            )
          )
            return false;
          if (sh.reserve)
            return (
              i === attempt.definition.shelves.length &&
              sh.opened &&
              sh.rear.length === 0 &&
              sh.unlockAfter === undefined
            );
          if (
            !original ||
            sh.unlockAfter !== original.unlockAfter ||
            sh.opened !==
              (!original.unlockAfter ||
                board.triples >= original.unlockAfter) ||
            sh.rear.length > original.rear.length ||
            JSON.stringify(sh.rear) !==
              JSON.stringify(
                original.rear.slice(original.rear.length - sh.rear.length),
              )
          )
            return false;
          if (
            !sh.opened &&
            JSON.stringify(sh.front) !== JSON.stringify(original.front)
          )
            return false;
          // Persist only resolved states, including snapshots used by undo.
          return (
            !sh.opened ||
            !(
              (sh.front[0] && sh.front.every((k) => k === sh.front[0])) ||
              (sh.front.every((k) => k === null) && sh.rear.length)
            )
          );
        }) &&
        safe(board.triples) &&
        board.triples ===
          Object.values(board.delivered).reduce((sum, n) => sum + n!, 0) / 3 &&
        board.events.every(
          (e) =>
            ["triple", "reveal", "unlock"].includes(e.type) &&
            safe(e.shelf) &&
            e.shelf < board.shelves.length &&
            (e.good === undefined || isGood(e.good)),
        )
      );
    };
    if (
      !validateBoard(attempt.board) ||
      attempt.undo.length > 30 ||
      !attempt.undo.every(
        (b) => validateBoard(b) && b.used <= attempt.board.used,
      )
    )
      return false;
    if (
      attempt.solution !== null &&
      (!Array.isArray(attempt.solution) ||
        attempt.solution.length > 100 ||
        !finishes(attempt.board, attempt.solution))
    )
      return false;
    if (
      Object.entries(attempt.hints).some(
        ([key, path]) =>
          key.length > 3000 ||
          !Array.isArray(path) ||
          path.length > 100 ||
          path.some(
            (m) =>
              !Array.isArray(m) ||
              m.length !== 2 ||
              m.some(
                (p) =>
                  !Array.isArray(p) ||
                  p.length !== 2 ||
                  p.some((n) => !safe(n) || n > 6),
              ),
          ),
      )
    )
      return false;
    if (attempt.reward !== null) {
      const r = attempt.reward;
      const currency = orderCurrency(attempt.definition.id);
      if (
        !won(attempt.board) ||
        typeof r.fresh !== "boolean" ||
        !safe(r.coins) ||
        !safe(r.stars) ||
        !safe(r.repairKits) ||
        (r.fresh
          ? r.coins !== 60 || r.stars !== (currency === "stars" ? 1 : 0) || r.repairKits !== (currency === "repairKits" ? 1 : 0)
          : r.stars !== 0 || r.repairKits !== 0 || ![0, 10].includes(r.coins))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
function migrateReward(value: unknown): void {
  const attempt = value as Attempt | null;
  const reward = attempt?.reward;
  if (!reward || typeof attempt?.definition?.id !== "string" || typeof reward.fresh !== "boolean" ||
    !safe(reward.coins) || !safe(reward.stars) || (reward.fresh
      ? reward.coins !== 60 || reward.stars !== 1
      : reward.stars !== 0 || ![0, 10].includes(reward.coins))) return;
  const currency = orderCurrency(attempt.definition.id);
  if (!currency) return;
  // The payout is already in the legacy wallet/completed set. Convert its
  // receipt only; replaying or recovering this attempt must not pay it again.
  attempt.reward = { coins: reward.coins, fresh: reward.fresh,
    stars: reward.fresh && currency === "stars" ? 1 : 0,
    repairKits: reward.fresh && currency === "repairKits" ? 1 : 0 };
}
export function loadProgress(storage: Pick<Storage, "getItem">): {
  progress: Progress;
  warning?: string;
  readOnly?: boolean;
  migrated?: boolean;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { progress: freshProgress() };
    const p = JSON.parse(raw);
    if (p && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(p.schema))
      return {
        progress: freshProgress(),
        readOnly: true,
        warning:
          "Сохранение создано более новой версией игры. Обновите игру, чтобы продолжить. Прогресс не изменён.",
      };
    const legacy = p.schema === 1;
    const oldRepairs = p.schema === 1 || p.schema === 2;
    const oldCampaign = p.schema === 3;
    const previousCampaign = p.schema === 4;
    const schemaFive = p.schema === 5;
    const beforeProjects = p.schema < 6;
    const ownershipMigration = p.schema < 7;
    const originalSchema = p.schema;
    const currencyMigration = p.schema < 8;
    const migrated = p.schema !== 11;
    if ((oldCampaign || previousCampaign || schemaFive || p.schema >= 6) && typeof p.campaign?.version === "string" &&
      p.campaign.version !== (oldCampaign ? "coastal-campaign-1" : previousCampaign ? "coastal-campaign-2" : schemaFive ? "coastal-campaign-3" : p.schema === 6 ? "coastal-campaign-4" : p.schema === 7 ? "coastal-campaign-5" : p.schema === 8 ? "coastal-campaign-6" : p.schema === 9 ? "coastal-campaign-7" : p.schema === 10 ? "coastal-campaign-8" : CAMPAIGN_VERSION))
      return { progress: freshProgress(), readOnly: true,
        warning: "Сохранение использует другую версию кампании. Обновите игру. Прогресс не изменён." };
    if (legacy) {
      p.schema = 2;
      p.renovations = p.renovation ? { sign: p.renovation } : {};
      p.tutorialSeen = [];
      p.recentStructures = [];
      if (p.attempt) p.attempt.hints = {};
    }
    if (
      !Array.isArray(p.completed) ||
      !p.completed.every(
        (id: unknown) =>
          typeof id === "string" && id.length > 0 && id.length < 200,
      ) ||
      ![
        p.coins,
        p.stars,
        p.inventory?.hint,
        p.inventory?.mix,
        p.inventory?.reserve,
        p.repeatCount,
      ].every(safe) ||
      (!currencyMigration && !safe(p.repairKits)) ||
      typeof p.contentVersion !== "string" ||
      typeof p.repeatDay !== "string" ||
      !/^$|^\d{4}-\d{2}-\d{2}$/.test(p.repeatDay) ||
      !p.settings ||
      !["sound", "music", "reducedMotion"].every(
        (k) => typeof p.settings[k] === "boolean",
      ) ||
      !colors.includes(p.renovation) ||
      !p.renovations ||
      typeof p.renovations !== "object" ||
      Array.isArray(p.renovations) ||
      Object.entries(p.renovations).some(
        ([id, c]) =>
          !RENOVATIONS.some((r) => r.id === id) ||
          !colors.slice(1).includes(c as string),
      ) ||
      !Array.isArray(p.tutorialSeen) ||
      !p.tutorialSeen.every(
        (s: unknown) => typeof s === "string" && s.length < 100,
      ) ||
      !Array.isArray(p.recentStructures) ||
      p.recentStructures.length > 12 ||
      !p.recentStructures.every(
        (s: unknown) => typeof s === "string" && s.length < 1000,
      )
    )
      throw new Error("Corrupted save");
    p.completed = [...new Set(p.completed.map(canonicalLevelId))];
    if (oldRepairs) {
      p.campaign = migrateCampaign(p.renovations);
    }
    if (oldCampaign) {
      if (!validLegacyCampaign(p.campaign)) throw new Error("Corrupted legacy campaign");
      p.campaign = campaignWithLegacyOrder(p.campaign.completedTasks);
    }
    if (previousCampaign) {
      if (!validPreviousCampaign(p.campaign)) throw new Error("Corrupted previous campaign");
      p.campaign = campaignWithLegacyOrder(p.campaign.completedTasks);
    }
    if (schemaFive) {
      if (!validSchemaFiveCampaign(p.campaign)) throw new Error("Corrupted schema-five campaign");
      p.campaign = campaignWithLegacyOrder(p.campaign.completedTasks);
    }
    if (beforeProjects) {
      p.selectedProject = "shop-1";
      p.attempts = {};
    }
    if (ownershipMigration) {
      if (!validSchemaSixCampaign(p.campaign) ||
        p.campaign.completedTasks.includes("shop-opening") !== !!p.renovations.sign ||
        p.campaign.completedTasks.includes("order-counter") !== !!p.renovations.counter)
        throw new Error("Corrupted legacy campaign");
      const conversion = migrateShopCampaign(p.campaign);
      if (!safe(p.stars + conversion.refund)) return {
        progress: freshProgress(), readOnly: true,
        warning: "Не удалось безопасно перенести звёзды сохранения. Прогресс не изменён.",
      };
      p.campaign = conversion.campaign;
      p.stars += conversion.refund;
    }
    if (migrated) {
      if (!ownershipMigration) {
        const valid = originalSchema === 10 ? validSchemaTenCampaign(p.campaign)
          : originalSchema === 9 ? validSchemaNineCampaign(p.campaign)
          : originalSchema === 8 ? validSchemaEightCampaign(p.campaign) : validSchemaSevenCampaign(p.campaign);
        if (!valid) throw new Error("Corrupted previous campaign");
        if (originalSchema === 9) {
          const oldPrefix = p.campaign.completedTasks.filter((id: string) => /^bakery-s1-t\d{2}$/.test(id)).length;
          if (oldPrefix >= 13 && oldPrefix <= 25) p.campaign.bakeryLegacyPrefix = oldPrefix;
        }
        p.campaign.version = CAMPAIGN_VERSION;
      }
      // Reclassify only unspent credit. Old cross-funded ownership never becomes
      // a debt or causes another payment for a result the player already owns.
      if (currencyMigration) {
        const earnedRepair = p.completed.filter((id: string) => orderCurrency(id) === "repairKits").length;
        const spentRepair = TASKS.filter(task => task.currency === "repairKits" && p.campaign.completedTasks.includes(task.id))
          .reduce((sum, task) => sum + task.cost, 0);
        p.repairKits = Math.min(p.stars, Math.max(0, earnedRepair - spentRepair));
        p.stars -= p.repairKits;
        const attempts: unknown[] = p.attempts && typeof p.attempts === "object" && !Array.isArray(p.attempts)
          ? Object.values(p.attempts) : [];
        if (p.attempt) attempts.push(p.attempt);
        for (const value of attempts) migrateReward(value);
      }
      p.schema = 11;
    }
    if (!validCampaign(p.campaign)) throw new Error("Corrupted campaign");
    p.renovation = p.renovations.sign ?? null;
    p.contentVersion = CONTENT_VERSION;
    if (!isProjectId(p.selectedProject) || !p.attempts || typeof p.attempts !== "object" ||
      Array.isArray(p.attempts) || Object.keys(p.attempts).some(key => !isProjectId(key)))
      throw new Error("Corrupted project selection");
    const typed = p as Progress;
    const decorInitialized = typed.sceneDecor === undefined;
    const invalidDecor = !decorInitialized && !validSceneDecor(typed.sceneDecor);
    if (decorInitialized || invalidDecor) typed.sceneDecor = freshSceneDecor();
    let invalidAttempt = false;
    let appearanceInitialized = false;
    const pinAppearance = (attempt: Attempt) => {
      if (attempt.appearance !== undefined) return;
      attempt.appearance = createOrderAppearance(attempt.definition);
      appearanceInitialized = true;
    };
    for (const [projectId, attempt] of Object.entries(typed.attempts)) {
      const number = chapterNumber(attempt?.definition?.id);
      if (!validateAttempt(attempt) || !number || CHAPTER[number - 1].phaseId !== projectId) {
        delete typed.attempts[projectId as ProjectId];
        invalidAttempt = true;
      } else {
        attempt.definition.id = canonicalLevelId(attempt.definition.id);
        pinAppearance(attempt);
      }
    }
    if (p.attempt) {
      const number = chapterNumber(p.attempt.definition?.id);
      if (!validateAttempt(p.attempt) || !number || CHAPTER[number - 1].phaseId !== typed.selectedProject) {
        typed.attempt = null;
        delete typed.attempts[typed.selectedProject];
        invalidAttempt = true;
      } else {
        p.attempt.definition.id = canonicalLevelId(p.attempt.definition.id);
        pinAppearance(p.attempt);
        typed.attempts[typed.selectedProject] = p.attempt;
      }
    } else typed.attempt = typed.attempts[typed.selectedProject] ?? null;
    // Schema 1 did not record whether its cached path had already been shown.
    // Preserve that valid path for free instead of charging an old hint twice.
    if (legacy && typed.attempt?.solution?.length)
      rememberHint(typed.attempt, typed.attempt.solution);
    if (invalidAttempt) return {
      progress: typed, migrated: migrated || appearanceInitialized || decorInitialized || invalidDecor,
      warning: "Не удалось восстановить один из заказов. Остальные попытки, работы и награды сохранены.",
    };
    if (invalidDecor) return {
      progress: typed, migrated: true,
      warning: "Не удалось восстановить дополнительное оформление. Заказы, работы и кошелёк сохранены.",
    };
    return { progress: typed, migrated: migrated || appearanceInitialized || decorInitialized };
  } catch {
    return {
      progress: freshProgress(),
      warning: "Сохранение недоступно или повреждено. Начинаем новую лавку.",
    };
  }
}
export function saveProgress(
  storage: Pick<Storage, "setItem">,
  progress: Progress,
): boolean {
  try {
    syncProjectAttempt(progress);
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
export function completeAttempt(
  progress: Progress,
  today: string,
): Attempt["reward"] {
  const attempt = progress.attempt;
  if (!attempt || !won(attempt.board)) return null;
  if (attempt.reward) return clone(attempt.reward);
  const id = canonicalLevelId(attempt.definition.id);
  const fresh =
    chapterNumber(id) !== null &&
    !progress.completed.some((k) => canonicalLevelId(k) === id);
  if (progress.repeatDay !== today) {
    progress.repeatDay = today;
    progress.repeatCount = 0;
  }
  const coins = fresh ? 60 : progress.repeatCount < 10 ? 10 : 0;
  if (fresh) progress.completed.push(id);
  else if (coins) progress.repeatCount++;
  const currency = orderCurrency(id);
  const stars = fresh && currency === "stars" ? 1 : 0;
  const repairKits = fresh && currency === "repairKits" ? 1 : 0;
  progress.coins += coins;
  progress.stars += stars;
  progress.repairKits += repairKits;
  attempt.reward = { coins, stars, repairKits, fresh };
  attempt.undo = [];
  return clone(attempt.reward);
}
export function renovate(
  progress: Progress,
  color: RenovationColor,
  id: RenovationId = "sign",
): boolean {
  const node = RENOVATIONS.find((r) => r.id === id);
  if (!node || !colors.slice(1).includes(color)) return false;
  // Cosmetics cannot buy obsolete repairs or bypass the campaign task graph.
  if (!renovationOwned(progress, id)) return false;
  progress.renovations[id] = color;
  progress.renovation = progress.renovations.sign ?? null;
  return true;
}
export function renovationOwned(progress: Progress, id: RenovationId): boolean {
  const job = { sign: "shop-s1-r14", counter: "shop-s1-r09", window: "shop-s1-r03" }[id];
  return progress.campaign.completedTasks.includes(job);
}
export function syncProjectAttempt(progress: Progress): void {
  if (progress.attempt) progress.attempts[progress.selectedProject] = progress.attempt;
  else delete progress.attempts[progress.selectedProject];
}
export function selectProject(progress: Progress, id: ProjectId): boolean {
  if (!isProjectId(id)) return false;
  const status = phaseStatus(id, progress.completed, progress.campaign);
  if (status !== "available" && status !== "complete") return false;
  syncProjectAttempt(progress);
  progress.selectedProject = id;
  progress.attempt = progress.attempts[id] ?? null;
  return true;
}
export function purchaseProjectTask(progress: Progress, id: string): boolean {
  if (phaseStatus(progress.selectedProject, progress.completed, progress.campaign) !== "available") return false;
  const task = nextProjectTask(progress.campaign, progress.selectedProject);
  if (!task || task.id !== id || taskBalance(progress, task) < task.cost) return false;
  progress[task.currency] -= task.cost;
  progress.campaign.completedTasks.push(task.id);
  if (task.id === "shop-s1-r14") {
    progress.renovations.sign ??= "sea";
    progress.renovation = progress.renovations.sign;
  }
  if (task.id === "shop-s1-r09") progress.renovations.counter ??= "sea";
  return true;
}
export function purchaseShopTask(progress: Progress, id: ShopTaskId): boolean {
  return progress.selectedProject === "shop-1" && purchaseProjectTask(progress, id);
}
