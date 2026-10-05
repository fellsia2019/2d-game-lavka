import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterLevel } from "../src/content";
import { clone, initial, solve, type Move } from "../src/engine";
import { finishes } from "../src/storage";
import { compactHintPath } from "../src/hints";

test("Order 7 screenshot: hints remove empty-shelf detours and still open both rear rows", () => {
  const definition = chapterLevel(7), board = initial(definition);
  board.shelves.forEach(shelf => { shelf.front = [null, null, null]; shelf.rear = []; });
  board.shelves[0].front = [null, "h", null];
  board.shelves[3].front = ["h", "j", null];
  board.shelves[3].rear = clone(definition.shelves[3].rear);
  board.delivered = { j: 3, h: 3, l: 3 };
  board.triples = 3;
  board.events = [];
  const before = clone(board), path = solve(board, 30000, 72).path!;
  assert.equal(path.length, 12);
  const compact = compactHintPath(board, path)!;
  assert.ok(compact.length <= 7);
  assert.equal(finishes(board, compact), true);
  assert.deepEqual(board, before);
});

test("Hint shortcuts preserve proofs, pinned Definitions and supplied paths throughout the chapter", () => {
  for (let number = 1; number <= 10; number++) {
    const definition = chapterLevel(number), before = clone(definition);
    const board = initial(definition);
    const compact = compactHintPath(board, definition.verifiedSolution)!;
    assert.ok(compact.length <= definition.verifiedSolution.length);
    assert.equal(finishes(board, compact), true);
    assert.deepEqual(definition, before);
  }
});

test("An already parked jam jar stays on its shelf while the hint opens the hidden goods", () => {
  const definition = chapterLevel(7), board = initial(definition);
  board.shelves.forEach(shelf => { shelf.front = [null, null, null]; shelf.rear = []; });
  board.shelves[1].front = [null, "j", null];
  board.shelves[3].front = ["h", null, "h"];
  board.shelves[3].rear = clone(definition.shelves[3].rear);
  board.delivered = { j: 3, h: 3, l: 3 };
  board.triples = 3;
  board.events = [];
  const compact = compactHintPath(board, solve(board, 30000, 72).path!)!;
  assert.equal(compact[0][0][0], 3);
  assert.equal(finishes(board, compact), true);
});

test("Invalid hints are rejected; exhausting compaction retains a replayed proof", () => {
  const definition = chapterLevel(7), board = initial(definition);
  const invalid: Move[] = [[[0, 0], [1, 0]]];
  assert.equal(compactHintPath(board, invalid), null);
  const bounded = compactHintPath(board, definition.verifiedSolution, 0)!;
  assert.deepEqual(bounded, definition.verifiedSolution);
  assert.equal(finishes(board, bounded), true);
});
