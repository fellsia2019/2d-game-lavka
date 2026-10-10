import { test } from "node:test";
import assert from "node:assert/strict";
import { DebugAutoPlayer } from "../src/debug-auto";
import { chapterLevel } from "../src/content";
import { applyMove, clone, initial, solve, won, type Board, type Move, type SearchResult } from "../src/engine";
import { completeAttempt, freshProgress, type Attempt } from "../src/storage";

function fixture(number = 1) {
  const progress = freshProgress();
  const definition = chapterLevel(number);
  const attempt: Attempt = { id: "debug-pinned", definition, board: initial(definition), undo: [],
    solution: clone(definition.verifiedSolution), mixCount: 0, hints: {}, reward: null };
  progress.attempt = attempt;
  const pending = new Map<number, () => void>();
  let nextTimer = 0, calls = 0, allowed = true, checks = 0;
  const reports: string[] = [];
  let checker = async (board: Board, _known: Move[] | null): Promise<SearchResult> => solve(board);
  const player = new DebugAutoPlayer({
    current: () => progress.attempt,
    allowed: () => allowed,
    move: move => {
      const current = progress.attempt!;
      const next = applyMove(current.board, ...move);
      if (!next) return false;
      calls++;
      current.undo.push(clone(current.board));
      current.board = next;
      if (won(next)) completeAttempt(progress, "2026-10-06");
      return true;
    },
    solve: (board, known) => { checks++; return checker(board, known); },
    report: message => reports.push(message),
    timers: {
      set: callback => { const id = ++nextTimer; pending.set(id, callback); return id; },
      clear: id => { pending.delete(id as number); },
    },
  });
  const tick = () => {
    const entry = pending.entries().next().value;
    if (!entry) return false;
    pending.delete(entry[0]); entry[1](); return true;
  };
  return { progress, attempt, player, pending, reports, tick,
    calls: () => calls, checks: () => checks, allow: (value: boolean) => { allowed = value; },
    checker: (value: typeof checker) => { checker = value; } };
}

test("Debug runs the pinned proof through normal moves, grants one normal reward and spends no inventory", async () => {
  const f = fixture();
  const original = clone(f.attempt.definition), inventory = clone(f.progress.inventory);
  assert.equal(await f.player.start(), true);
  assert.equal(f.checks(), 0);
  assert.equal(f.calls(), 0, "starting never replaces the board with a victory");
  for (let guard = 0; f.tick(); guard++) assert.ok(guard < 100);
  assert.equal(won(f.attempt.board), true);
  assert.equal(f.calls(), original.verifiedSolution.length);
  assert.equal(f.player.status, "idle");
  assert.equal(f.progress.coins, 60);
  assert.equal(f.progress.stars, 0);
  assert.equal(f.progress.repairKits, 1);
  assert.deepEqual(f.progress.inventory, inventory);
  assert.deepEqual(f.attempt.definition, original);
  assert.deepEqual(f.attempt.hints, {});
  completeAttempt(f.progress, "2026-10-06");
  assert.equal(await f.player.start(), false);
  assert.equal(f.progress.coins, 60);
  assert.equal(f.progress.stars, 0);
  assert.equal(f.progress.repairKits, 1);
});
test("Cancel, leaving play, replacing an attempt or changing its board prevents a queued stale move", async () => {
  for (const change of ["cancel", "leave", "attempt", "board", "in-place", "definition"] as const) {
    const f = fixture(8);
    await f.player.start();
    assert.equal(f.tick(), true);
    assert.equal(f.calls(), 1);
    if (change === "cancel") f.player.cancel();
    if (change === "leave") f.allow(false);
    if (change === "attempt") f.progress.attempt = clone(f.attempt);
    if (change === "board") f.attempt.board = clone(f.attempt.board);
    if (change === "in-place") f.attempt.board.used++;
    if (change === "definition") f.attempt.definition.seed += "-changed";
    const before = clone(f.progress.attempt!.board);
    f.tick();
    assert.equal(f.calls(), 1, change);
    assert.deepEqual(f.progress.attempt!.board, before, change);
    assert.equal(f.player.status, "idle", change);
    assert.equal(f.progress.stars, 0, change);
    assert.equal(f.progress.repairKits, 0, change);
    assert.equal(f.pending.size, 0, change);
  }
});
test("An altered board goes through the solver and replays its verified result without changing its Definition", async () => {
  const f = fixture(8);
  f.attempt.board = applyMove(f.attempt.board, ...f.attempt.solution![0])!;
  f.attempt.solution = f.attempt.solution!.slice(1);
  const definition = clone(f.attempt.definition);
  await f.player.start();
  assert.equal(f.checks(), 1);
  for (let guard = 0; f.tick(); guard++) assert.ok(guard < 100);
  assert.equal(won(f.attempt.board), true);
  assert.deepEqual(f.attempt.definition, definition);
  assert.deepEqual(f.progress.inventory, { hint: 2, mix: 1, reserve: 1 });
  assert.equal(f.progress.stars, 0);
  assert.equal(f.progress.repairKits, 1);
});
test("Unknown search, worker failure and invalid proof leave the exact board and wallet untouched", async () => {
  for (const outcome of ["unknown", "throw", "invalid"] as const) {
    const f = fixture(8);
    f.attempt.board = applyMove(f.attempt.board, ...f.attempt.solution![0])!;
    const before = clone(f.progress);
    f.checker(async () => {
      if (outcome === "throw") throw new Error("worker unavailable");
      return outcome === "unknown" ? { status: "unknown", path: null, visited: 30000 }
        : { status: "solved", path: [[[0, 0], [0, 0]]], visited: 0 };
    });
    assert.equal(await f.player.start(), false);
    assert.deepEqual(f.progress, before);
    assert.equal(f.calls(), 0);
    assert.equal(f.pending.size, 0);
    assert.equal(f.player.status, "idle");
    assert.equal(f.reports.length, 1);
    if (outcome === "unknown") assert.match(f.reports[0], /исчерпал лимит/);
  }
});
test("A cancelled asynchronous solver response cannot schedule or resume a timer after undo/restart/navigation", async () => {
  for (const change of ["cancel", "board", "attempt"] as const) {
    const f = fixture(8);
    f.attempt.board = applyMove(f.attempt.board, ...f.attempt.solution![0])!;
    f.attempt.solution = f.attempt.solution!.slice(1);
    let finish!: (result: SearchResult) => void;
    f.checker(() => new Promise(resolve => { finish = resolve; }));
    const running = f.player.start();
    assert.equal(f.player.status, "checking");
    if (change === "cancel") f.player.cancel();
    if (change === "board") f.attempt.board = clone(f.attempt.board);
    if (change === "attempt") f.progress.attempt = clone(f.attempt);
    finish({ status: "solved", path: f.attempt.solution, visited: 0 });
    assert.equal(await running, false);
    assert.equal(f.pending.size, 0);
    assert.equal(f.calls(), 0);
    assert.equal(f.progress.stars, 0);
    assert.equal(f.progress.repairKits, 0);
    assert.equal(f.player.status, "idle");
  }
});
