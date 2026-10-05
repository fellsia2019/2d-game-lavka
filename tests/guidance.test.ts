import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAPTER, chapterLevel } from "../src/content";
import { applyMove, clone, countGoods, initial, solve, won } from "../src/engine";
import { guidanceMode, hiddenStock } from "../src/guidance";
import { compactHintPath } from "../src/hints";
import { finishes } from "../src/storage";

test("Only the first order has strict teaching; rear/crate practice survives old lesson flags", () => {
  assert.equal(guidanceMode(1, [], []), "strict");
  assert.equal(guidanceMode(1, [], ["spotlight-transfer"]), "none");
  const seen = ["spotlight-transfer", "spotlight-rear", "spotlight-crate"];
  for (const number of [2, 3, 7, 9]) {
    assert.equal(guidanceMode(number, [], seen), "gentle");
    assert.equal(guidanceMode(number, [CHAPTER[number - 1].id], seen), "none");
  }
  for (const number of [4, 5, 6, 8, 10])
    assert.equal(guidanceMode(number, [], []), "none");
});

test("Order 7 after the user's lemon triple: remaining honey, jam and lemons are conserved and deliverable", () => {
  const definition = chapterLevel(7), board = initial(definition);
  board.shelves.forEach(shelf => { shelf.front = [null, null, null]; shelf.rear = []; });
  board.shelves[0].front = ["l", "h", "j"];
  board.shelves[2].front = [null, "l", null];
  board.shelves[3].front = [null, "h", null];
  board.shelves[3].rear = clone(definition.shelves[3].rear);
  board.shelves[4].front = [null, "l", null];
  board.delivered = { j: 3, h: 3 };
  board.triples = 2;
  board.events = [];
  const counts = countGoods(board);
  assert.deepEqual(counts, board.goals);
  assert.deepEqual(hiddenStock(board.shelves[3]), [["h", 1], ["j", 2], ["l", 3]]);

  // Reproduce the user's before/after screenshots without moving honey or jam.
  let next = applyMove(board, [0, 0], [2, 0])!;
  next = applyMove(next, [4, 1], [2, 2])!;
  assert.deepEqual(next.delivered, { j: 3, h: 3, l: 3 });
  assert.deepEqual(countGoods(next), counts);
  assert.deepEqual(next.shelves[0].front, [null, "h", "j"]);
  assert.deepEqual(next.shelves[2].front, [null, null, null]);
  assert.equal(next.shelves.flatMap(shelf => shelf.front).filter(Boolean).length, 3);
  assert.deepEqual(hiddenStock(next.shelves[3]), [["h", 1], ["j", 2], ["l", 3]]);
  assert.equal(won(next), false);
  const path = compactHintPath(next, solve(next, 30000, 72).path!)!;
  assert.equal(finishes(next, path), true);
  let reveals = 0;
  for (const [from, to] of path) {
    next = applyMove(next, from, to)!;
    reveals += next.events.filter(event => event.type === "reveal").length;
    assert.deepEqual(countGoods(next), counts);
    if (!won(next)) assert.equal(guidanceMode(7, [], ["spotlight-rear"]), "gentle");
    const stock = hiddenStock(next.shelves[3]);
    assert.equal(stock.reduce((sum, [, count]) => sum + count, 0),
      next.shelves[3].rear.flat().filter(Boolean).length);
  }
  assert.equal(reveals, 2);
  assert.equal(won(next), true);
  assert.deepEqual(next.delivered, { j: 6, h: 6, l: 6 });
  assert.deepEqual(hiddenStock(next.shelves[3]), []);
});
