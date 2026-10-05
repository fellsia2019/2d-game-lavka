import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chapterLevel,
  CHAPTER,
  canonicalLevelId,
  completedCount,
  isUnlocked,
  nextOrder,
} from "../src/content";
import {
  applyMove,
  clone,
  initial,
  hasMoves,
  solve,
  replay,
  validateDefinition,
  won,
  type Definition,
} from "../src/engine";
import { generate, RECIPES, structuralKey, VERSION } from "../src/generator";
import {
  freshProgress,
  loadProgress,
  validateAttempt,
  rememberHint,
  cachedHint,
  completeAttempt,
  renovate,
  purchaseShopTask,
  type Attempt,
} from "../src/storage";
import { SHOP_STEPS } from "../src/campaign";
function attempt(def = chapterLevel(1)): Attempt {
  return {
    id: "readiness",
    definition: def,
    board: initial(def),
    undo: [],
    solution: clone(def.verifiedSolution),
    mixCount: 0,
    hints: {},
    reward: null,
  };
}
function finished(a: Attempt) {
  for (const move of a.definition.verifiedSolution)
    a.board = applyMove(a.board, ...move)!;
  a.solution = [];
  return a;
}
function roundTrip(a: Attempt) {
  const p = freshProgress();
  p.attempt = a;
  const result = loadProgress({ getItem: () => JSON.stringify(p) });
  assert.equal(result.warning, undefined);
  assert.deepEqual(result.progress.attempt, a);
  return result.progress.attempt!;
}
test("Authored chapter is cloned and legacy ids keep their fixed meaning", () => {
  const def = chapterLevel(10),
    original = clone(def);
  def.shelves[0].front.fill(null);
  def.verifiedSolution.length = 0;
  assert.deepEqual(chapterLevel(10), original);
  const suffixes = [
    "tutorial:1",
    "tutorial:2",
    "tutorial:3",
    "front:coast-4",
    "front:coast-5",
    "front:coast-6-v2",
    "layers:coast-7",
    "layers:coast-8",
    "crate:coast-9",
    "mixed:coast-10",
  ];
  for (const [i, suffix] of suffixes.entries())
    assert.equal(canonicalLevelId(`coastal-slice-1:${suffix}`), CHAPTER[i].id);
  assert.equal(
    canonicalLevelId("coastal-slice-1:front:unrelated"),
    "coastal-slice-1:front:unrelated",
  );
});
test("Every chapter transfer remains a valid persisted state, with full undo", () => {
  for (let n = 1; n <= CHAPTER.length; n++) {
    const a = attempt(chapterLevel(n));
    for (const m of a.definition.verifiedSolution) {
      a.undo.push(clone(a.board));
      if (a.undo.length > 30) a.undo.shift();
      a.board = applyMove(a.board, ...m)!;
      a.solution = a.solution!.slice(1);
      assert.equal(
        validateAttempt(a),
        true,
        `order ${n}, move ${a.board.used}`,
      );
      roundTrip(a);
    }
    assert.equal(won(a.board), true);
  }
});
test("Schema 1 migration retains the pinned layout, seed, old generator version, inventory and rewards", () => {
  const p: any = freshProgress();
  p.schema = 1;
  p.contentVersion = "coastal-slice-1";
  p.completed = ["coastal-slice-1:tutorial:1", "coastal-slice-2:tutorial:1"];
  p.coins = 60;
  p.stars = 0;
  p.renovation = "coral";
  delete p.renovations;
  delete p.tutorialSeen;
  delete p.recentStructures;
  p.attempt = attempt();
  p.attempt.definition.id = "coastal-slice-1:tutorial:1";
  p.attempt.definition.generatorVersion = "coastal-slice-1";
  p.attempt.undo = [clone(p.attempt.board)];
  p.attempt.board = applyMove(
    p.attempt.board,
    p.attempt.solution[0][0],
    p.attempt.solution[0][1],
  );
  p.attempt.solution = p.attempt.solution.slice(1);
  delete p.attempt.hints;
  const original = clone(p.attempt.definition),
    result = loadProgress({ getItem: () => JSON.stringify(p) });
  assert.equal(result.warning, undefined);
  assert.equal(result.progress.schema, 3);
  assert.deepEqual(result.progress.completed, [CHAPTER[0].id]);
  assert.equal(result.progress.coins, 60);
  assert.deepEqual(result.progress.renovations, { sign: "coral" });
  assert.deepEqual(result.progress.attempt!.definition, {
    ...original,
    id: CHAPTER[0].id,
  });
  assert.deepEqual(result.progress.attempt!.board, p.attempt.board);
  assert.deepEqual(result.progress.inventory, p.inventory);
  assert.deepEqual(cachedHint(result.progress.attempt!), p.attempt.solution);
});
test("Version changes and legacy aliases cannot grant the same chapter star twice", () => {
  const p = freshProgress();
  p.completed = ["coastal-slice-1:tutorial:1"];
  p.attempt = finished(attempt());
  p.attempt.definition.generatorVersion = "future-version";
  assert.deepEqual(completeAttempt(p, "2026-10-04"), {
    coins: 10,
    stars: 0,
    fresh: false,
  });
  assert.equal(p.stars, 0);
  assert.equal(
    canonicalLevelId("coastal-slice-8:front:coast-4"),
    CHAPTER[3].id,
  );
});
test("Catalog order, unknown completed ids and duplicates do not unlock or finish the chapter", () => {
  const p = ["unrelated", CHAPTER[1].id, CHAPTER[1].id];
  assert.equal(completedCount(p), 1);
  assert.equal(nextOrder(p), 1);
  assert.equal(isUnlocked(p, 2), false);
  assert.equal(isUnlocked([...p, CHAPTER[0].id], 3), true);
  assert.equal(nextOrder(CHAPTER.map((s) => s.id)), 0);
});
test("Paid hint proof survives navigation/save and the same board reached by undo", () => {
  const a = attempt(chapterLevel(4));
  assert.equal(rememberHint(a, a.definition.verifiedSolution), true);
  const loaded = roundTrip(a);
  assert.deepEqual(cachedHint(loaded), a.definition.verifiedSolution);
  const before = clone(loaded.board);
  loaded.board = applyMove(
    loaded.board,
    ...loaded.definition.verifiedSolution[0],
  )!;
  assert.equal(cachedHint(loaded), null);
  loaded.board = before;
  loaded.solution = null;
  assert.deepEqual(
    cachedHint(roundTrip(loaded)),
    a.definition.verifiedSolution,
  );
  assert.equal(
    rememberHint(a, [
      [
        [0, 0],
        [0, 0],
      ],
    ]),
    false,
  );
});
test("Invalid metadata, goods, locks and reward flags discard only the attempt", () => {
  const corruptions = [
    (a: Attempt) => (a.definition.number = 999),
    (a: Attempt) => (a.definition.profile = "invalid" as any),
    (a: Attempt) => (a.definition.shelves[0].front[0] = "constructor" as any),
    (a: Attempt) => (a.reward = { coins: 60, stars: 1, fresh: true }),
    (a: Attempt) =>
      (a.board.shelves.find((s) => s.unlockAfter)!.unlockAfter = 99),
  ];
  for (const corrupt of corruptions) {
    const a = attempt(chapterLevel(9));
    corrupt(a);
    assert.equal(validateAttempt(a), false);
    const p = freshProgress();
    p.coins = 420;
    p.stars = 6;
    p.attempt = a;
    const loaded = loadProgress({ getItem: () => JSON.stringify(p) });
    assert.equal(loaded.progress.attempt, null);
    assert.equal(loaded.progress.coins, 420);
    assert.equal(loaded.progress.stars, 6);
    assert.ok(loaded.warning);
  }
});
test("Unknown future save schema is read-only and retains its storage bytes", () => {
  const raw = JSON.stringify({ ...freshProgress(), schema: 9 }),
    memory = new Map([["save", raw]]);
  const loaded = loadProgress({ getItem: () => memory.get("save")! });
  assert.equal(loaded.readOnly, true);
  assert.equal(memory.get("save"), raw);
});
test("All ten wins fund the complete repair graph, switches are free and choices persist", () => {
  const p = freshProgress();
  for (let n = 1; n <= CHAPTER.length; n++) {
    p.attempt = finished(attempt(chapterLevel(n)));
    completeAttempt(p, "2026-10-04");
  }
  assert.equal(p.coins, 600);
  assert.equal(p.stars, 10);
  assert.equal(renovate(p, "sea", "window"), false);
  for (const task of SHOP_STEPS) assert.equal(purchaseShopTask(p, task.id), true);
  assert.equal(p.stars, 0);
  for (const id of ["sign", "counter"] as const) assert.equal(renovate(p, "coral", id), true);
  const loaded = loadProgress({ getItem: () => JSON.stringify(p) });
  assert.equal(loaded.warning, undefined);
  assert.equal(Object.keys(loaded.progress.renovations).length, 2);
  assert.equal(loaded.progress.renovations.sign, "coral");
  assert.equal(completedCount(loaded.progress.completed), CHAPTER.length);
});
test("A player-created full board is detected exactly, and one undo restores free moves", () => {
  const d: Definition = {
    ...chapterLevel(8),
    shelves: [
      { front: [null, "m", "j"], rear: [] },
      { front: ["j", "m", null], rear: [["b", "m", "j"]] },
      { front: ["b", null, "j"], rear: [["b", "b", "j"]] },
      { front: ["m", "b", "m"], rear: [["m", "j", "b"]] },
    ],
    verifiedSolution: [],
  };
  const solved = solve(initial(d), 30000, 72);
  assert.ok(solved.path);
  d.verifiedSolution = solved.path;
  validateDefinition(d);
  let b = initial(d),
    before = b;
  for (const m of [
    [
      [1, 0],
      [0, 0],
    ],
    [
      [3, 2],
      [2, 1],
    ],
    [
      [2, 2],
      [3, 2],
    ],
    [
      [1, 1],
      [2, 2],
    ],
  ] as const) {
    before = b;
    b = applyMove(b, [...m[0]], [...m[1]])!;
    assert.ok(b);
  }
  assert.equal(won(b), false);
  assert.equal(hasMoves(b), false);
  assert.equal(hasMoves(before), true);
  assert.equal(solve(b).status, "unknown");
});
test("Every recipe emits replayed proofs, supports two rear rows and preserves version", () => {
  let deep = false;
  for (const r of RECIPES) {
    const d = generate("recipe-check", r.profile, 1, { recipe: r.id });
    validateDefinition(d);
    assert.equal(replay(d, d.verifiedSolution), true);
    assert.equal(d.recipe, r.id);
    assert.equal(d.generatorVersion, VERSION);
    deep ||= d.shelves.some((s) => s.rear.length === 2);
  }
  assert.equal(deep, true);
});
test("Recent structural history deterministically rejects the same layout", () => {
  const first = generate("history-check", "front", 1, {
      recipe: "front-classic",
    }),
    key = structuralKey(first);
  const options = { recipe: "front-classic", avoidStructures: [key] },
    next = generate("history-check", "front", 1, options);
  assert.notEqual(structuralKey(next), key);
  assert.deepEqual(generate("history-check", "front", 1, options), next);
  assert.equal(replay(next, next.verifiedSolution), true);
});
