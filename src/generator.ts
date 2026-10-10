import {
  clone,
  initial,
  replay,
  solve,
  validateDefinition,
  type Board,
  type Definition,
  type Good,
  type Profile,
} from "./engine";
import { isGood } from "./catalog";
export const VERSION = "coastal-slice-4";
const DEFAULT_GOODS: readonly Good[] = [
  "j", "m", "b", "p", "h", "l", "eg", "ch", "ju", "ap", "or", "ba",
  "ri", "te", "oi", "fl", "su", "co", "ol", "pa", "ct", "pe", "gr", "st",
];
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export const PROFILES = {
  front: {
    shelves: 4,
    kinds: 3,
    each: 3,
    front: 9,
    rear: 0,
    locked: false,
    depth: 24,
    nodes: 1800,
    attempts: 32,
  },
  layers: {
    shelves: 4,
    kinds: 3,
    each: 6,
    front: 9,
    rear: 3,
    locked: false,
    depth: 40,
    nodes: 2800,
    attempts: 32,
  },
  crate: {
    shelves: 5,
    kinds: 4,
    each: 3,
    front: 12,
    rear: 0,
    locked: true,
    depth: 32,
    nodes: 2400,
    attempts: 32,
  },
  mixed: {
    shelves: 6,
    kinds: 4,
    each: 6,
    front: 12,
    rear: 4,
    locked: true,
    depth: 48,
    nodes: 4000,
    attempts: 40,
  },
} as const;
export interface Recipe {
  id: string;
  profile: Profile;
  label: string;
  shelves: number;
  kinds: number;
  each: number;
  front: number;
  rear: number;
  deep?: boolean;
  counts?: readonly number[];
  locks?: number;
}
export const RECIPES: readonly Recipe[] = [
  {
    id: "front-classic",
    profile: "front",
    label: "Знакомые полки",
    shelves: 4,
    kinds: 3,
    each: 3,
    front: 9,
    rear: 0,
  },
  {
    id: "front-four",
    profile: "front",
    label: "Четыре заказа",
    shelves: 5,
    kinds: 4,
    each: 3,
    front: 12,
    rear: 0,
  },
  {
    id: "front-double",
    profile: "front",
    label: "Двойной заказ",
    shelves: 5,
    kinds: 2,
    each: 6,
    front: 12,
    rear: 0,
  },
  {
    id: "layers-classic",
    profile: "layers",
    label: "Задние ряды",
    shelves: 4,
    kinds: 3,
    each: 6,
    front: 9,
    rear: 3,
  },
  {
    id: "layers-deep",
    profile: "layers",
    label: "Глубокая полка",
    shelves: 5,
    kinds: 3,
    each: 6,
    front: 9,
    rear: 3,
    deep: true,
  },
  {
    id: "crate-classic",
    profile: "crate",
    label: "Закрытая поставка",
    shelves: 5,
    kinds: 4,
    each: 3,
    front: 12,
    rear: 0,
  },
  {
    id: "crate-room",
    profile: "crate",
    label: "Место для поставки",
    shelves: 6,
    kinds: 4,
    each: 3,
    front: 12,
    rear: 0,
  },
  {
    id: "mixed-classic",
    profile: "mixed",
    label: "Большой заказ",
    shelves: 6,
    kinds: 4,
    each: 6,
    front: 12,
    rear: 4,
  },
  {
    id: "mixed-deep",
    profile: "mixed",
    label: "Две глубокие полки",
    shelves: 6,
    kinds: 4,
    each: 6,
    front: 12,
    rear: 4,
    deep: true,
  },
  { id: "front-wide", profile: "front", label: "Свободная выкладка", shelves: 6, kinds: 4, each: 3, front: 12, rear: 0 },
  { id: "front-five-triples", profile: "front", label: "Пять отправок", shelves: 6, kinds: 4, each: 3, counts: [6, 3, 3, 3], front: 15, rear: 0 },
  { id: "front-two-pairs", profile: "front", label: "Два двойных заказа", shelves: 6, kinds: 3, each: 3, counts: [6, 6, 3], front: 15, rear: 0 },
  { id: "layers-light", profile: "layers", label: "Один задний ряд", shelves: 5, kinds: 3, each: 3, counts: [6, 3, 3], front: 9, rear: 1 },
  { id: "layers-four-kinds", profile: "layers", label: "Четыре товара за первым рядом", shelves: 5, kinds: 4, each: 3, counts: [6, 6, 3, 3], front: 12, rear: 2 },
  { id: "layers-staggered", profile: "layers", label: "Последовательное раскрытие", shelves: 5, kinds: 4, each: 3, counts: [9, 6, 3, 3], front: 9, rear: 4, deep: true },
  { id: "layers-wide", profile: "layers", label: "Широкая приёмка", shelves: 6, kinds: 4, each: 3, counts: [6, 6, 3, 3], front: 12, rear: 2 },
  { id: "layers-balanced", profile: "layers", label: "Два ряда каждого товара", shelves: 6, kinds: 4, each: 6, front: 15, rear: 3 },
  { id: "layers-long", profile: "layers", label: "Девять отправок", shelves: 6, kinds: 4, each: 3, counts: [9, 6, 6, 6], front: 12, rear: 5 },
  { id: "layers-deep-long", profile: "layers", label: "Глубокая приёмка", shelves: 6, kinds: 4, each: 3, counts: [9, 9, 6, 3], front: 12, rear: 5, deep: true },
  { id: "crate-small", profile: "crate", label: "Небольшая посылка", shelves: 5, kinds: 3, each: 3, front: 9, rear: 0 },
  { id: "crate-paired", profile: "crate", label: "Поставка для двух отправок", shelves: 5, kinds: 3, each: 3, counts: [6, 3, 3], front: 12, rear: 0 },
  { id: "crate-five-triples", profile: "crate", label: "Пять отправок с поставкой", shelves: 6, kinds: 4, each: 3, counts: [6, 3, 3, 3], front: 15, rear: 0 },
  { id: "crate-twin", profile: "crate", label: "Две поставки", shelves: 6, kinds: 4, each: 3, front: 12, rear: 0, locks: 2 },
  { id: "crate-twin-paired", profile: "crate", label: "Две поставки для большого заказа", shelves: 6, kinds: 3, each: 3, counts: [6, 6, 3], front: 15, rear: 0, locks: 2 },
  { id: "mixed-light", profile: "mixed", label: "Посылка за задним рядом", shelves: 5, kinds: 4, each: 3, counts: [6, 3, 3, 3], front: 9, rear: 2 },
  { id: "mixed-room", profile: "mixed", label: "Место для приёмки", shelves: 6, kinds: 4, each: 3, counts: [6, 6, 3, 3], front: 9, rear: 3 },
  { id: "mixed-staggered", profile: "mixed", label: "Поставка и глубокий ряд", shelves: 6, kinds: 4, each: 3, counts: [9, 6, 3, 3], front: 12, rear: 3, deep: true },
  { id: "mixed-twin", profile: "mixed", label: "Две поставки и задние ряды", shelves: 6, kinds: 4, each: 3, counts: [6, 6, 3, 3], front: 12, rear: 2, locks: 2 },
  { id: "mixed-twin-deep", profile: "mixed", label: "Двойная глубокая поставка", shelves: 6, kinds: 4, each: 6, front: 12, rear: 4, deep: true, locks: 2 },
  { id: "mixed-long", profile: "mixed", label: "Длинная цепочка отправок", shelves: 6, kinds: 4, each: 3, counts: [9, 6, 6, 6], front: 12, rear: 5 },
  { id: "mixed-twin-long", profile: "mixed", label: "Две партии большого заказа", shelves: 6, kinds: 4, each: 3, counts: [9, 6, 6, 6], front: 12, rear: 5, locks: 2 },
  { id: "mixed-ten-triples", profile: "mixed", label: "Десять отправок", shelves: 6, kinds: 4, each: 3, counts: [9, 9, 6, 6], front: 15, rear: 5 },
  { id: "mixed-deep-ten", profile: "mixed", label: "Глубокая большая партия", shelves: 6, kinds: 4, each: 3, counts: [9, 9, 6, 6], front: 12, rear: 6, deep: true },
  { id: "mixed-triple-crate", profile: "mixed", label: "Три последовательные поставки", shelves: 6, kinds: 4, each: 3, counts: [9, 6, 6, 6], front: 15, rear: 4, locks: 3 },
];
export interface GenerationOptions {
  recipe?: string;
  avoidStructures?: string[];
  goods?: Good[];
  requireGoods?: Good[];
}
export function structuralKey(def: Definition): string {
  const kinds = [
    ...new Set(
      def.shelves
        .flatMap((sh) => [...sh.front, ...sh.rear.flat()])
        .filter(Boolean),
    ),
  ] as Good[];
  let best = "~";
  function visit(labels: Good[], remaining: Good[]) {
    if (remaining.length) {
      remaining.forEach((k, i) =>
        visit(
          [...labels, k],
          remaining.filter((_, j) => j !== i),
        ),
      );
      return;
    }
    const map = Object.fromEntries(
      labels.map((k, i) => [k, String.fromCharCode(65 + i)]),
    );
    const row = (r: (Good | null)[]) =>
      r
        .map((k) => (k ? map[k] : "_"))
        .sort()
        .join("");
    const key = def.shelves
      .map(
        (sh) =>
          `${sh.unlockAfter ?? 0}:${row(sh.front)}:${sh.rear.map(row).join("/")}`,
      )
      .sort()
      .join("|");
    if (key < best) best = key;
  }
  visit([], kinds);
  return best;
}
export function generate(
  seed: string,
  profile: Profile,
  number = 1,
  options: GenerationOptions = {},
): Definition {
  if (!seed.trim() || seed.length > 64 || !PROFILES[profile])
    throw new Error(
      "Укажите seed длиной от 1 до 64 символов и доступный профиль.",
    );
  const candidates = RECIPES.filter(
    (r) =>
      r.profile === profile && (!options.recipe || r.id === options.recipe),
  );
  if (!candidates.length)
    throw new Error("Этот рецепт недоступен для выбранного профиля.");
  const recipe = candidates[hash(`${seed}|recipe`) % candidates.length];
  // Version 4's implicit pool is frozen. New catalog goods are opt-in so old
  // seeds/options retain their original meaning after a content expansion.
  const pool = options.goods ?? DEFAULT_GOODS;
  const required = options.requireGoods ?? [];
  if (!Array.isArray(pool) || pool.length < recipe.kinds || !pool.every(isGood) || new Set(pool).size !== pool.length ||
    !Array.isArray(required) || required.length > recipe.kinds || new Set(required).size !== required.length ||
    required.some(good => !pool.includes(good))) throw new Error("Недопустимый ассортимент рецепта.");
  const p = {
    ...PROFILES[profile],
    ...recipe,
    nodes: Math.max(PROFILES[profile].nodes, 6000),
    depth: Math.max(PROFILES[profile].depth, (recipe.counts?.reduce((sum, n) => sum + n, 0) ?? recipe.each * recipe.kinds) * 2),
    attempts: 64,
  };
  for (let attempt = 0; attempt < p.attempts; attempt++) {
    const rng = random(hash(`${VERSION}|${profile}|${seed}|${attempt}`));
    const kinds = [...required, ...shuffle(pool.filter(good => !required.includes(good)), rng).slice(0, p.kinds - required.length)];
    const bag = shuffle(
      kinds.flatMap((k, i) => Array<Good>(recipe.counts?.[i] ?? p.each).fill(k)),
      rng,
    );
    const fronts = shuffle(
      [
        ...bag.slice(0, p.front),
        ...Array<null>(p.shelves * 3 - p.front).fill(null),
      ],
      rng,
    );
    const shelves: Definition["shelves"] = Array.from(
      { length: p.shelves },
      (_, i) => ({ front: fronts.slice(i * 3, i * 3 + 3), rear: [] }),
    );
    const indexes = shuffle(
      shelves.map((_, i) => i),
      rng,
    );
    for (let n = 0; n < p.rear; n++)
      shelves[
        indexes[
          "deep" in recipe && recipe.deep
            ? Math.floor(n / 2)
            : n % indexes.length
        ]
      ].rear.push(bag.slice(p.front + n * 3, p.front + n * 3 + 3));
    if (p.locked) {
      const full = shelves
        .map((s, i) => (s.front.every(Boolean) ? i : -1))
        .filter((i) => i >= 0);
      const lockCount = recipe.locks ?? 1;
      if (full.length < lockCount) continue;
      const locked = shuffle(full, rng).slice(0, lockCount);
      locked.forEach((index, i) => {
        shelves[index].unlockAfter = lockCount === 1 ? 1 + Math.floor(rng() * 2) : i + 1;
      });
    }
    const def: Definition = {
      id: `${VERSION}:${profile}:${seed}`,
      number,
      seed,
      profile,
      generatorVersion: VERSION,
      name: "Заказ с набережной",
      note: "Соберите три одинаковых на одной полке.",
      budget: null,
      recipe: recipe.id,
      shelves,
      verifiedSolution: [],
    };
    const board = initial(def);
    const empties = board.shelves
      .filter((sh) => sh.opened)
      .reduce((n, sh) => n + sh.front.filter((k) => !k).length, 0);
    if (board.triples || empties < 2) continue;
    const result = solve(board, p.nodes, p.depth);
    if (!result.path || !replay(def, result.path)) continue;
    if (options.avoidStructures?.includes(structuralKey(def))) continue;
    def.verifiedSolution = result.path;
    validateDefinition(def);
    return def;
  }
  throw new Error(
    "Не удалось подтвердить раскладку за ограниченный поиск. Уровень не выдан.",
  );
}
// Coarse features let authors compare nearby recipes without calling them difficulty.
export function describeStructure(def: Definition) {
  const board = initial(def);
  return {
    key: structuralKey(def),
    shelves: def.shelves.length,
    kinds: Object.keys(board.goals).length,
    goods: Object.values(board.goals).reduce((a, b) => a + b!, 0),
    free: board.shelves
      .filter((s) => s.opened)
      .reduce((n, s) => n + s.front.filter((g) => g === null).length, 0),
    rearRows: def.shelves.reduce((n, s) => n + s.rear.length, 0),
    locks: def.shelves.filter((s) => s.unlockAfter).length,
    verifiedMoves: def.verifiedSolution.length,
    recipe: def.recipe ?? def.profile,
  };
}
export function mixVisible(
  board: Board,
  seed: string,
): {
  board: Board;
  solution: NonNullable<ReturnType<typeof solve>["path"]>;
} | null {
  const positions = board.shelves.flatMap((sh, i) =>
    sh.opened && !sh.reserve ? sh.front.map((_, j) => [i, j] as const) : [],
  );
  const goods = positions.map(([i, j]) => board.shelves[i].front[j]);
  for (let n = 0; n < 12; n++) {
    const next = clone(board),
      mixed = shuffle(goods, random(hash(`${seed}|mix|${n}`)));
    positions.forEach(([i, j], k) => {
      next.shelves[i].front[j] = mixed[k];
    });
    // Avoid introducing automatic shipments/reveals as a side effect of assistance.
    if (
      next.shelves.some(
        (sh) =>
          sh.opened &&
          !sh.reserve &&
          ((sh.front[0] && sh.front.every((k) => k === sh.front[0])) ||
            (sh.rear.length && sh.front.every((k) => !k))),
      )
    )
      continue;
    if (
      positions.every(
        ([i, j]) => next.shelves[i].front[j] === board.shelves[i].front[j],
      )
    )
      continue;
    const result = solve(next, 16000, 64);
    if (result.path) {
      next.events = [];
      return { board: next, solution: result.path };
    }
  }
  return null;
}
