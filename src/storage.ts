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
import { CAMPAIGN_VERSION, freshCampaign, migrateCampaign, nextShopTask, validCampaign,
  type CampaignProgress, type ShopTaskId } from "./campaign";
import {
  CHAPTER,
  canonicalLevelId,
  chapterNumber,
  CONTENT_VERSION,
} from "./content";
import {
  RENOVATIONS,
  type RenovationColor,
  type RenovationId,
} from "./renovations";
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
  reward: { coins: number; stars: number; fresh: boolean } | null;
}
export interface Progress {
  schema: 3;
  campaign: CampaignProgress;
  contentVersion: string;
  completed: string[];
  coins: number;
  stars: number;
  inventory: { hint: number; mix: number; reserve: number };
  renovation: RenovationColor | null;
  renovations: Partial<Record<RenovationId, RenovationColor>>;
  tutorialSeen: string[];
  recentStructures: string[];
  settings: Settings;
  attempt: Attempt | null;
  repeatDay: string;
  repeatCount: number;
}
// Retain the original key: v1 saves are migrated in place, never abandoned.
export const STORAGE_KEY = "coastal-shop:progress:v1";
export function freshProgress(): Progress {
  return {
    schema: 3,
    campaign: freshCampaign(),
    contentVersion: CONTENT_VERSION,
    completed: [],
    coins: 0,
    stars: 0,
    inventory: { hint: 2, mix: 1, reserve: 1 },
    renovation: null,
    renovations: {},
    tutorialSeen: [],
    recentStructures: [],
    settings: { sound: true, music: false, reducedMotion: false },
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
      attempt.definition.number > CHAPTER.length ||
      typeof attempt.id !== "string" ||
      !attempt.id ||
      !safe(attempt.mixCount) ||
      !Array.isArray(attempt.undo) ||
      !attempt.hints ||
      typeof attempt.hints !== "object" ||
      Array.isArray(attempt.hints)
    )
      return false;
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
      if (
        !won(attempt.board) ||
        typeof r.fresh !== "boolean" ||
        !safe(r.coins) ||
        !safe(r.stars) ||
        (r.fresh
          ? r.coins !== 60 || r.stars !== 1
          : r.stars !== 0 || ![0, 10].includes(r.coins))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
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
    if (p && p.schema !== 1 && p.schema !== 2 && p.schema !== 3)
      return {
        progress: freshProgress(),
        readOnly: true,
        warning:
          "Сохранение создано более новой версией игры. Обновите игру, чтобы продолжить. Прогресс не изменён.",
      };
    const legacy = p.schema === 1;
    const migrated = p.schema === 1 || p.schema === 2;
    if (p.schema === 3 && typeof p.campaign?.version === "string" && p.campaign.version !== CAMPAIGN_VERSION)
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
    if (migrated) {
      p.campaign = migrateCampaign(p.renovations);
      p.schema = 3;
    }
    if (!validCampaign(p.campaign) ||
      p.campaign.completedTasks.includes("shop-opening") !== !!p.renovations.sign ||
      p.campaign.completedTasks.includes("order-counter") !== !!p.renovations.counter)
      throw new Error("Corrupted campaign");
    p.renovation = p.renovations.sign ?? null;
    p.contentVersion = CONTENT_VERSION;
    const typed = p as Progress;
    if (p.attempt && !validateAttempt(p.attempt)) {
      typed.attempt = null;
      return {
        progress: typed,
        migrated,
        warning:
          "Не удалось восстановить текущий заказ. Ремонт и награды сохранены.",
      };
    }
    if (p.attempt)
      p.attempt.definition.id = canonicalLevelId(p.attempt.definition.id);
    // Schema 1 did not record whether its cached path had already been shown.
    // Preserve that valid path for free instead of charging an old hint twice.
    if (legacy && typed.attempt?.solution?.length)
      rememberHint(typed.attempt, typed.attempt.solution);
    return { progress: typed, migrated };
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
  const stars = fresh ? 1 : 0;
  progress.coins += coins;
  progress.stars += stars;
  attempt.reward = { coins, stars, fresh };
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
  if (!progress.renovations[id]) return false;
  progress.renovations[id] = color;
  progress.renovation = progress.renovations.sign ?? null;
  return true;
}
export function purchaseShopTask(progress: Progress, id: ShopTaskId): boolean {
  const task = nextShopTask(progress.campaign);
  if (!task || task.id !== id || progress.stars < task.cost) return false;
  progress.stars -= task.cost;
  progress.campaign.completedTasks.push(task.id);
  if (task.id === "shop-opening") {
    progress.renovations.sign = "sea";
    progress.renovation = "sea";
  }
  if (task.id === "order-counter") progress.renovations.counter = "sea";
  return true;
}
