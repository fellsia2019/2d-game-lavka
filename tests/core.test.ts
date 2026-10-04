import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOODS,
  addReserve,
  applyMove,
  clone,
  countGoods,
  initial,
  replay,
  resolve,
  solve,
  validateDefinition,
  won,
  type Board,
  type Definition,
  type Move,
  type Profile,
} from "../src/engine";
import { chapterLevel } from "../src/content";
import { generate, mixVisible, structuralKey, VERSION } from "../src/generator";
import {
  completeAttempt,
  freshProgress,
  loadProgress,
  renovate,
  saveProgress,
  STORAGE_KEY,
  validateAttempt,
  type Attempt,
} from "../src/storage";

function finish(board: Board, path: Move[]): Board {
  for (const [a, b] of path) {
    const next = applyMove(board, a, b);
    assert.ok(next);
    board = next;
  }
  return board;
}
function attempt(def = chapterLevel(1)): Attempt {
  return {
    id: "test-attempt",
    definition: def,
    board: initial(def),
    undo: [],
    solution: clone(def.verifiedSolution),
    mixCount: 0,
    reward: null,
  };
}
test("First order: four transfers, exactly three shipments and conserved goods", () => {
  const def = chapterLevel(1);
  let board = initial(def);
  assert.equal(def.verifiedSolution.length, 4);
  for (const [a, b] of def.verifiedSolution) {
    const before = clone(board);
    board = applyMove(board, a, b)!;
    assert.deepEqual(countGoods(board), { ...board.goals });
    assert.equal(board.used, before.used + 1);
  }
  assert.equal(won(board), true);
  assert.equal(board.triples, 3);
  assert.deepEqual(board.delivered, board.goals);
});
test("Invalid transfers preserve state and do not spend a move; applyMove is immutable", () => {
  const def = chapterLevel(1),
    board = initial(def),
    before = clone(board);
  for (const [a, b] of [
    [
      [0, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [1, 0],
    ],
    [
      [3, 1],
      [3, 2],
    ],
    [
      [-1, 0],
      [3, 1],
    ],
    [
      [0, 0.5],
      [3, 1],
    ],
    [
      [0, 0],
      [3, 3],
    ],
  ] as Move[]) {
    assert.equal(applyMove(board, a, b), null);
  }
  assert.deepEqual(board, before);
  assert.ok(applyMove(board, ...def.verifiedSolution[0]));
  assert.deepEqual(board, before);
});
test("A single resolution cascades through rear rows, opening locks without spending moves", () => {
  const def: Definition = {
    ...chapterLevel(1),
    shelves: [
      { front: ["j", "j", "j"], rear: [["m", "m", "m"]] },
      { front: ["b", "b", "b"], rear: [], unlockAfter: 2 },
    ],
  };
  const board = initial(def);
  assert.equal(won(board), true);
  assert.equal(board.triples, 3);
  assert.equal(board.used, 0);
  assert.equal(board.shelves[1].opened, true);
  assert.deepEqual(
    board.events.map((e) => e.type),
    ["triple", "reveal", "triple", "unlock", "triple"],
  );
  resolve(board);
  assert.equal(board.triples, 3);
});
test("Locked goods cannot be selected; undo snapshot restores cascades and locks together", () => {
  const def = chapterLevel(9);
  let board = initial(def);
  const lock = board.shelves.findIndex((sh) => !sh.opened);
  assert.ok(lock >= 0);
  const empty = board.shelves.findIndex(
    (sh) => sh.opened && sh.front.includes(null),
  );
  assert.equal(
    applyMove(
      board,
      [lock, 0],
      [empty, board.shelves[empty].front.indexOf(null)],
    ),
    null,
  );
  for (const [a, b] of def.verifiedSolution) {
    const snapshot = clone(board);
    const next = applyMove(board, a, b)!;
    if (next.events.some((e) => e.type === "unlock")) {
      assert.equal(snapshot.shelves[lock].opened, false);
      assert.equal(next.shelves[lock].opened, true);
      assert.deepEqual(countGoods(snapshot), snapshot.goals);
      return;
    }
    board = next;
  }
  assert.fail("No unlock happened");
});
test("Victory is allowed on the final budgeted transfer; no transfers after exhaustion", () => {
  const def = chapterLevel(1);
  def.budget = 4;
  assert.equal(won(finish(initial(def), def.verifiedSolution)), true);
  def.budget = 3;
  const board = finish(initial(def), def.verifiedSolution.slice(0, 3));
  assert.equal(won(board), false);
  assert.equal(applyMove(board, ...def.verifiedSolution[3]), null);
  assert.equal(solve(board).status, "unknown");
});
test("Reserve is one reversible storage slot, conserves goods and never ships triples", () => {
  const def = chapterLevel(1);
  const before = initial(def),
    board = addReserve(before)!;
  assert.equal(addReserve(board), null);
  assert.equal(before.shelves.length, 4);
  assert.equal(board.shelves.length, 5);
  const moved = applyMove(board, [0, 2], [4, 0])!;
  assert.deepEqual(countGoods(moved), board.goals);
  assert.equal(moved.triples, 0);
  const back = applyMove(moved, [4, 0], [0, 2])!;
  assert.deepEqual(back.shelves, board.shelves);
  assert.ok(solve(moved).path);
});
test("All ten curated chapter tasks have replayed solutions and distinct structures", () => {
  const structures = new Set<string>();
  for (let n = 1; n <= 10; n++) {
    const def = chapterLevel(n);
    validateDefinition(def);
    assert.equal(replay(def, def.verifiedSolution), true);
    assert.deepEqual(chapterLevel(n), def);
    assert.equal(def.generatorVersion, VERSION);
    const key = structuralKey(def);
    assert.equal(structures.has(key), false, `Duplicate at ${n}`);
    structures.add(key);
  }
});
test("128 generated tasks across four profiles: deterministic, conserved and solvable without help", () => {
  for (const profile of ["front", "layers", "crate", "mixed"] as Profile[]) {
    for (let n = 0; n < 32; n++) {
      const seed = `regression-${n}`,
        def = generate(seed, profile);
      validateDefinition(def);
      assert.equal(replay(def, def.verifiedSolution), true);
      assert.deepEqual(generate(seed, profile), def);
      assert.ok(Object.values(initial(def).goals).every((n) => n! % 3 === 0));
      assert.ok(Object.keys(initial(def).goals).length <= 4);
      assert.equal(
        initial(def).shelves.some((sh) => sh.reserve),
        false,
      );
    }
  }
});
test("Structural comparison ignores renamed goods, slots and shelf permutations", () => {
  const def = chapterLevel(10),
    renamed = clone(def);
  const keys = Object.keys(GOODS) as (keyof typeof GOODS)[];
  const mapping = Object.fromEntries(
    keys.map((k, i) => [k, keys[(i + 1) % keys.length]]),
  );
  renamed.shelves.reverse().forEach((sh) => {
    sh.front = sh.front.map((k) => (k ? mapping[k] : null)).reverse();
    sh.rear = sh.rear.map((row) =>
      row.map((k) => (k ? mapping[k] : null)).reverse(),
    );
  });
  assert.equal(structuralKey(def), structuralKey(renamed));
});
test("Search exhaustion means unknown, not impossible", () => {
  const board = initial(chapterLevel(7));
  assert.deepEqual(solve(board, 0), {
    path: null,
    visited: 0,
    status: "unknown",
  });
  assert.ok(solve(board).path);
});
test("Shuffle retains quantities, hidden rows, locks and delivered orders, and returns a replayable solution", () => {
  const def = chapterLevel(7),
    before = applyMove(initial(def), ...def.verifiedSolution[0])!;
  const result = mixVisible(before, "stable-mix-test");
  assert.ok(result);
  assert.deepEqual(countGoods(result.board), before.goals);
  assert.deepEqual(result.board.delivered, before.delivered);
  assert.equal(result.board.used, before.used);
  before.shelves.forEach((sh, i) => {
    assert.deepEqual(result.board.shelves[i].rear, sh.rear);
    assert.equal(result.board.shelves[i].opened, sh.opened);
  });
  assert.equal(won(finish(result.board, result.solution)), true);
});
test("Atomic save and restore retain the pinned definition, attempt and undo", () => {
  const progress = freshProgress();
  progress.attempt = attempt(chapterLevel(8));
  progress.attempt.undo.push(clone(progress.attempt.board));
  progress.attempt.board = applyMove(
    progress.attempt.board,
    ...progress.attempt.definition.verifiedSolution[0],
  )!;
  progress.attempt.solution = null;
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  assert.equal(saveProgress(storage, progress), true);
  const loaded = loadProgress(storage);
  assert.deepEqual(loaded.progress, progress);
  assert.equal(loaded.warning, undefined);
  assert.equal(validateAttempt(progress.attempt), true);
  progress.attempt.board.shelves[0].front.push("j");
  saveProgress(storage, progress);
  assert.equal(loadProgress(storage).progress.attempt, null);
});
test("Rewards are idempotent, new orders give one star, repeats are capped at 10 a day", () => {
  const progress = freshProgress();
  progress.attempt = attempt();
  assert.equal(completeAttempt(progress, "2026-10-04"), null);
  progress.attempt.board = finish(
    progress.attempt.board,
    progress.attempt.definition.verifiedSolution,
  );
  completeAttempt(progress, "2026-10-04");
  completeAttempt(progress, "2026-10-04");
  assert.equal(progress.coins, 60);
  assert.equal(progress.stars, 1);
  assert.equal(progress.completed.length, 1);
  for (let i = 0; i < 12; i++) {
    progress.attempt = attempt();
    progress.attempt.board = finish(
      progress.attempt.board,
      progress.attempt.definition.verifiedSolution,
    );
    completeAttempt(progress, "2026-10-04");
  }
  assert.equal(progress.coins, 160);
  assert.equal(progress.stars, 1);
  progress.attempt = attempt();
  progress.attempt.board = finish(
    progress.attempt.board,
    progress.attempt.definition.verifiedSolution,
  );
  completeAttempt(progress, "2026-10-05");
  assert.equal(progress.coins, 170);
  assert.equal(progress.repeatCount, 1);
});
test("Renovation spends three stars once, subsequent choices are free", () => {
  const progress = freshProgress();
  assert.equal(renovate(progress, "sea"), false);
  progress.stars = 3;
  assert.equal(renovate(progress, "sea"), true);
  assert.equal(progress.stars, 0);
  assert.equal(renovate(progress, "coral"), true);
  assert.equal(progress.stars, 0);
  assert.equal(progress.renovation, "coral");
});
test("Corrupted data and unavailable storage do not crash loading or saving", () => {
  assert.equal(loadProgress({ getItem: () => "{broken" }).progress.coins, 0);
  assert.equal(
    saveProgress(
      {
        setItem: () => {
          throw new Error("Quota");
        },
      },
      freshProgress(),
    ),
    false,
  );
  const p = freshProgress();
  p.coins = -3;
  assert.equal(
    loadProgress({ getItem: () => JSON.stringify(p) }).progress.coins,
    0,
  );
  assert.equal(STORAGE_KEY, "coastal-shop:progress:v1");
});
