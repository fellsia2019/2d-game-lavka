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
export const VERSION = "coastal-slice-1";
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
    min: 3,
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
    min: 7,
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
    min: 4,
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
    min: 9,
    depth: 48,
    nodes: 4000,
    attempts: 40,
  },
} as const;
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
): Definition {
  if (!seed.trim() || seed.length > 64 || !PROFILES[profile])
    throw new Error("Invalid seed or profile");
  const p = PROFILES[profile];
  for (let attempt = 0; attempt < p.attempts; attempt++) {
    const rng = random(hash(`${VERSION}|${profile}|${seed}|${attempt}`));
    const pool: Good[] =
      p.kinds === 3 ? ["j", "m", "b"] : ["j", "m", "b", "p", "h", "l"];
    const kinds = shuffle(pool, rng).slice(0, p.kinds);
    const bag = shuffle(
      kinds.flatMap((k) => Array<Good>(p.each).fill(k)),
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
      shelves[indexes[n % indexes.length]].rear.push(
        bag.slice(p.front + n * 3, p.front + n * 3 + 3),
      );
    if (p.locked) {
      const full = shelves
        .map((s, i) => (s.front.every(Boolean) ? i : -1))
        .filter((i) => i >= 0);
      if (!full.length) continue;
      shelves[full[Math.floor(rng() * full.length)]].unlockAfter =
        1 + Math.floor(rng() * 2);
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
      shelves,
      verifiedSolution: [],
    };
    const board = initial(def);
    const empties = board.shelves
      .filter((sh) => sh.opened)
      .reduce((n, sh) => n + sh.front.filter((k) => !k).length, 0);
    if (board.triples || empties < 2) continue;
    const result = solve(board, p.nodes, p.depth);
    if (!result.path || result.path.length < p.min || !replay(def, result.path))
      continue;
    def.verifiedSolution = result.path;
    validateDefinition(def);
    return def;
  }
  throw new Error(
    "Не удалось подтвердить раскладку за ограниченный поиск. Уровень не выдан.",
  );
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
