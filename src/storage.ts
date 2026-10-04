import {
  GOODS,
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
export type RenovationColor = "sea" | "honey" | "coral";
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
  reward: { coins: number; stars: number; fresh: boolean } | null;
}
export interface Progress {
  schema: 1;
  contentVersion: string;
  completed: string[];
  coins: number;
  stars: number;
  inventory: { hint: number; mix: number; reserve: number };
  renovation: RenovationColor | null;
  settings: Settings;
  attempt: Attempt | null;
  repeatDay: string;
  repeatCount: number;
}
export const STORAGE_KEY = "coastal-shop:progress:v1";
export function freshProgress(): Progress {
  return {
    schema: 1,
    contentVersion: "coastal-slice-1",
    completed: [],
    coins: 0,
    stars: 0,
    inventory: { hint: 2, mix: 1, reserve: 1 },
    renovation: null,
    settings: { sound: true, music: false, reducedMotion: false },
    attempt: null,
    repeatDay: "",
    repeatCount: 0,
  };
}
function sameCounts(a: Board["goals"], b: Board["goals"]): boolean {
  return ["j", "m", "b", "p", "h", "l"].every(
    (k) =>
      a[k as keyof typeof a] === b[k as keyof typeof b] ||
      (a[k as keyof typeof a] ?? 0) === (b[k as keyof typeof b] ?? 0),
  );
}
export function validateAttempt(attempt: Attempt): boolean {
  try {
    validateDefinition(attempt.definition);
    const goal = initial(attempt.definition).goals;
    const validateBoard = (board: Board) => {
      if (
        !sameCounts(board.goals, goal) ||
        !sameCounts(countGoods(board), goal)
      )
        return false;
      if (
        Object.entries(board.delivered).some(
          ([k, n]) =>
            !(k in GOODS) ||
            !Number.isInteger(n) ||
            n! < 0 ||
            n! % 3 ||
            n! > (goal[k as keyof typeof goal] ?? 0),
        )
      )
        return false;
      if (
        !Number.isInteger(board.used) ||
        board.used < 0 ||
        board.budget !== attempt.definition.budget
      )
        return false;
      if (
        board.shelves.length < attempt.definition.shelves.length ||
        board.shelves.length > attempt.definition.shelves.length + 1
      )
        return false;
      return (
        board.shelves.every(
          (sh, i) =>
            typeof sh.opened === "boolean" &&
            sh.front.length === (sh.reserve ? 1 : 3) &&
            (sh.reserve
              ? i === attempt.definition.shelves.length && sh.rear.length === 0
              : i < attempt.definition.shelves.length) &&
            sh.rear.length <= 2 &&
            sh.rear.every((r) => r.length === 3) &&
            [...sh.front, ...sh.rear.flat()].every(
              (k) => k === null || k in GOODS,
            ),
        ) &&
        board.triples ===
          Object.values(board.delivered).reduce((sum, n) => sum + n!, 0) / 3
      );
    };
    if (
      !validateBoard(attempt.board) ||
      attempt.undo.length > 30 ||
      !attempt.undo.every(validateBoard)
    )
      return false;
    if (attempt.solution !== null) {
      if (!Array.isArray(attempt.solution) || attempt.solution.length > 100)
        return false;
      let state = clone(attempt.board);
      for (const [a, b] of attempt.solution) {
        const next = applyMove(state, a, b);
        if (!next) return false;
        state = next;
      }
      if (!won(state)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
export function loadProgress(storage: Pick<Storage, "getItem">): {
  progress: Progress;
  warning?: string;
} {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { progress: freshProgress() };
    const p = JSON.parse(raw) as Progress;
    if (
      p.schema !== 1 ||
      !Array.isArray(p.completed) ||
      !p.completed.every((x) => typeof x === "string") ||
      ![
        p.coins,
        p.stars,
        p.inventory?.hint,
        p.inventory?.mix,
        p.inventory?.reserve,
        p.repeatCount,
      ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      !p.settings ||
      !["sound", "music", "reducedMotion"].every(
        (k) => typeof p.settings[k as keyof Settings] === "boolean",
      ) ||
      ![null, "sea", "honey", "coral"].includes(p.renovation)
    )
      throw new Error("Corrupted save");
    if (p.attempt && !validateAttempt(p.attempt)) {
      p.attempt = null;
      return {
        progress: p,
        warning:
          "Не удалось восстановить текущий заказ. Ремонт и награды сохранены.",
      };
    }
    return { progress: p };
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
  if (attempt.reward) return attempt.reward;
  const fresh = !progress.completed.includes(attempt.definition.id);
  if (progress.repeatDay !== today) {
    progress.repeatDay = today;
    progress.repeatCount = 0;
  }
  const coins = fresh ? 60 : progress.repeatCount < 10 ? 10 : 0;
  if (fresh) progress.completed.push(attempt.definition.id);
  else if (coins) progress.repeatCount++;
  const stars = fresh ? 1 : 0;
  progress.coins += coins;
  progress.stars += stars;
  attempt.reward = { coins, stars, fresh };
  attempt.undo = [];
  return clone(attempt.reward);
}
export function renovate(progress: Progress, color: RenovationColor): boolean {
  if (!progress.renovation) {
    if (progress.stars < 3) return false;
    progress.stars -= 3;
  }
  progress.renovation = color;
  return true;
}
