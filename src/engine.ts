// Rules adapted from the supplied coastal-shop-level-generator.js.
// The engine has no DOM, time, storage, sound or commerce dependencies.
import { isGood, type Good } from "./catalog";
export { GOODS, type Good } from "./catalog";
export type Row = (Good | null)[];
export type Position = [number, number];
export type Move = [Position, Position];
export type Profile = "front" | "layers" | "crate" | "mixed";
export interface Shelf {
  front: Row;
  rear: Row[];
  unlockAfter?: number;
  opened: boolean;
  reserve?: boolean;
}
export interface Definition {
  id: string;
  number: number;
  name: string;
  note: string;
  seed: string;
  generatorVersion: string;
  profile: Profile | "tutorial";
  shelves: Omit<Shelf, "opened">[];
  verifiedSolution: Move[];
  budget: number | null;
  recipe?: string;
}
export type Event = {
  type: "triple" | "reveal" | "unlock";
  shelf: number;
  good?: Good;
};
export interface Board {
  shelves: Shelf[];
  goals: Partial<Record<Good, number>>;
  delivered: Partial<Record<Good, number>>;
  triples: number;
  used: number;
  budget: number | null;
  events: Event[];
}
export const clone = <T>(value: T): T => structuredClone(value);
export function initial(def: Definition): Board {
  const goals: Board["goals"] = {};
  for (const shelf of def.shelves)
    for (const good of [...shelf.front, ...shelf.rear.flat()]) {
      if (good) goals[good] = (goals[good] ?? 0) + 1;
    }
  const board: Board = {
    shelves: clone(def.shelves).map((sh) => ({
      ...sh,
      opened: !sh.unlockAfter,
    })),
    goals,
    delivered: {},
    triples: 0,
    used: 0,
    budget: def.budget,
    events: [],
  };
  resolve(board);
  return board;
}
export function resolve(board: Board): void {
  let dirty = true;
  while (dirty) {
    dirty = false;
    board.shelves.forEach((sh, i) => {
      if (!sh.opened && board.triples >= (sh.unlockAfter ?? 0)) {
        sh.opened = true;
        board.events.push({ type: "unlock", shelf: i });
        dirty = true;
      }
      if (!sh.opened || sh.reserve) return;
      const good = sh.front[0];
      if (good && sh.front.length === 3 && sh.front.every((k) => k === good)) {
        board.delivered[good] = (board.delivered[good] ?? 0) + 3;
        board.triples++;
        sh.front = [null, null, null];
        board.events.push({ type: "triple", shelf: i, good });
        dirty = true;
      }
      if (sh.front.every((k) => !k) && sh.rear.length) {
        sh.front = sh.rear.shift()!;
        board.events.push({ type: "reveal", shelf: i });
        dirty = true;
      }
    });
  }
}
export function won(board: Board): boolean {
  return Object.entries(board.goals).every(
    ([good, n]) => (board.delivered[good as Good] ?? 0) === n,
  );
}
export function validMove(board: Board, from: Position, to: Position): boolean {
  if (![...from, ...to].every(Number.isInteger)) return false;
  if (won(board) || (board.budget !== null && board.used >= board.budget))
    return false;
  const a = board.shelves[from[0]],
    b = board.shelves[to[0]];
  return !!(
    a?.opened &&
    b?.opened &&
    Number.isInteger(from[1]) &&
    Number.isInteger(to[1]) &&
    from[1] >= 0 &&
    to[1] >= 0 &&
    from[1] < a.front.length &&
    to[1] < b.front.length &&
    (from[0] !== to[0] || from[1] !== to[1]) &&
    a.front[from[1]] &&
    !b.front[to[1]]
  );
}
export function applyMove(
  board: Board,
  from: Position,
  to: Position,
): Board | null {
  if (!validMove(board, from, to)) return null;
  const next = clone(board);
  next.events = [];
  next.shelves[to[0]].front[to[1]] = next.shelves[from[0]].front[from[1]];
  next.shelves[from[0]].front[from[1]] = null;
  next.used++;
  resolve(next);
  return next;
}
export function addReserve(board: Board): Board | null {
  if (won(board) || board.shelves.some((sh) => sh.reserve)) return null;
  const next = clone(board);
  next.events = [];
  next.shelves.push({ front: [null], rear: [], opened: true, reserve: true });
  return next;
}
export function replay(def: Definition, path: Move[]): boolean {
  let board = initial(def);
  for (const [a, b] of path) {
    const next = applyMove(board, a, b);
    if (!next) return false;
    board = next;
  }
  return won(board);
}
export function countGoods(board: Board): Partial<Record<Good, number>> {
  const counts = { ...board.delivered };
  for (const sh of board.shelves)
    for (const k of [...sh.front, ...sh.rear.flat()]) {
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    }
  return counts;
}
export function validateDefinition(def: Definition): void {
  if (
    !def ||
    ![def.id, def.seed, def.generatorVersion, def.name, def.note].every(
      (s) => typeof s === "string" && s.length > 0 && s.length <= 200,
    ) ||
    !Number.isSafeInteger(def.number) ||
    def.number < 1 ||
    !["tutorial", "front", "layers", "crate", "mixed"].includes(def.profile) ||
    (def.recipe !== undefined &&
      (typeof def.recipe !== "string" ||
        !def.recipe.length ||
        def.recipe.length > 64)) ||
    !(
      def.budget === null ||
      (Number.isSafeInteger(def.budget) && def.budget > 0)
    ) ||
    !Array.isArray(def.verifiedSolution) ||
    def.verifiedSolution.length > 100 ||
    !Array.isArray(def.shelves) ||
    !def.shelves.length ||
    def.shelves.length > 6
  )
    throw new Error("Invalid shelf count");
  for (const sh of def.shelves) {
    if (
      !Array.isArray(sh.front) ||
      !Array.isArray(sh.rear) ||
      sh.reserve ||
      sh.front.length !== 3 ||
      sh.rear.length > 2 ||
      sh.rear.some((r) => r.length !== 3)
    )
      throw new Error("Invalid rows");
    if ([...sh.front, ...sh.rear.flat()].some((k) => k !== null && !isGood(k)))
      throw new Error("Unknown goods");
    if (
      sh.unlockAfter !== undefined &&
      (!Number.isInteger(sh.unlockAfter) || sh.unlockAfter < 1)
    )
      throw new Error("Invalid lock");
  }
  const board = initial(def);
  if (
    !Object.keys(board.goals).length ||
    Object.keys(board.goals).length > 4 ||
    Object.values(board.goals).some((n) => !n || n % 3)
  )
    throw new Error("Invalid goals");
  if (!replay(def, def.verifiedSolution))
    throw new Error("Unverified solution");
}
export function hasMoves(board: Board): boolean {
  if (won(board) || (board.budget !== null && board.used >= board.budget))
    return false;
  return (
    board.shelves.some((s) => s.opened && s.front.some(isGood)) &&
    board.shelves.some((s) => s.opened && s.front.includes(null))
  );
}
// Slot order is immaterial to a search state. Shelves remain ordered, since their
// hidden rows and locks are different. Stored paths still use actual slot indexes.
export function stateKey(board: Board): string {
  return (
    board.shelves
      .map(
        (sh) =>
          `${+sh.opened}:${sh.front
            .map((k) => k ?? "_")
            .sort()
            .join("")}:${sh.rear
            .map((r) =>
              r
                .map((k) => k ?? "_")
                .sort()
                .join(""),
            )
            .join("/")}`,
      )
      .join("|") +
    "#" +
    board.triples
  );
}
export interface SearchResult {
  path: Move[] | null;
  visited: number;
  status: "solved" | "unknown";
}
export function solve(
  start: Board,
  maxNodes = 18000,
  maxDepth = 64,
): SearchResult {
  const limit = Math.min(
    maxDepth,
    start.budget === null ? maxDepth : start.budget - start.used,
  );
  const seen = new Map<string, number>();
  const path: Move[] = [];
  let visited = 0;
  const score = (s: Board) =>
    s.triples * 40 +
    s.shelves.reduce((n, sh) => {
      if (!sh.opened || sh.reserve) return n;
      const frequencies = new Map<Good, number>();
      sh.front.forEach((k) => {
        if (k) frequencies.set(k, (frequencies.get(k) ?? 0) + 1);
      });
      return (
        n +
        [...frequencies.values()].filter((x) => x === 2).length * 6 +
        sh.front.filter((k) => !k).length
      );
    }, 0);
  function visit(s: Board, depth: number): Move[] | null {
    if (won(s)) return path.slice();
    if (depth >= limit || visited >= maxNodes) return null;
    visited++;
    const key = stateKey(s),
      previous = seen.get(key);
    if (previous !== undefined && previous <= depth) return null;
    seen.set(key, depth);
    const empty: Position[] = [];
    s.shelves.forEach((sh, i) => {
      if (sh.opened) {
        const j = sh.front.indexOf(null);
        if (j >= 0) empty.push([i, j]);
      }
    });
    const children: { board: Board; move: Move; score: number }[] = [];
    s.shelves.forEach((sh, i) => {
      if (!sh.opened) return;
      const kinds = new Set<Good>();
      sh.front.forEach((k, j) => {
        if (!k || kinds.has(k)) return;
        kinds.add(k);
        for (const dest of empty) {
          if (dest[0] === i) continue;
          const ns = applyMove(s, [i, j], dest);
          if (ns)
            children.push({
              board: ns,
              move: [[i, j], dest],
              score: score(ns),
            });
        }
      });
    });
    children.sort((a, b) => b.score - a.score);
    for (const c of children) {
      path.push(c.move);
      const result = visit(c.board, depth + 1);
      if (result) return result;
      path.pop();
      if (visited >= maxNodes) break;
    }
    return null;
  }
  const result = visit(start, 0);
  return { path: result, visited, status: result ? "solved" : "unknown" };
}
