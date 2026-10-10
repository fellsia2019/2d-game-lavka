import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAPTER, chapterLevel } from "../src/content";
import { initial, applyMove, clone } from "../src/engine";
import { freshProgress, loadProgress, saveProgress, type Attempt } from "../src/storage";
import { TOOLS, purchaseTool } from "../src/tools";
import { createOrderAppearance } from "../src/order-supplies";

function shopper() {
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 9).map(order => order.id);
  p.coins = 600;
  const definition = chapterLevel(10), board = initial(definition);
  p.attempt = { id: "pinned-shopping-attempt", definition, appearance: createOrderAppearance(definition),
    board: applyMove(board, ...definition.verifiedSolution[0])!, undo: [board],
    solution: definition.verifiedSolution.slice(1), hints: {}, mixCount: 0, reward: null } satisfies Attempt;
  return p;
}
test("Explicit tool purchases replenish inventory and survive reload without applying or changing the pinned puzzle", () => {
  const p = shopper(), before = clone(p);
  for (const tool of TOOLS) assert.equal(purchaseTool(p, tool.id), true);
  assert.equal(p.coins, 0);
  assert.deepEqual(p.inventory, { hint: 3, mix: 2, reserve: 2 });
  assert.deepEqual({ ...p, coins: before.coins, inventory: before.inventory }, before);
  let raw = "";
  saveProgress({ setItem: (_, value) => { raw = value; } }, p);
  const loaded = loadProgress({ getItem: () => raw });
  assert.equal(loaded.warning, undefined);
  assert.deepEqual(loaded.progress, p);
});
test("A rejected purchase never spends coins or grants inventory: missing funds, locked tools and unknown ids", () => {
  for (const tool of TOOLS) {
    const p = shopper();
    p.coins = tool.cost - 1;
    const before = clone(p);
    assert.equal(purchaseTool(p, tool.id), false);
    assert.deepEqual(p, before);
  }
  const p = freshProgress();
  p.coins = 1000;
  const before = clone(p);
  for (const kind of ["mix", "reserve", "unknown", "__proto__"]) {
    assert.equal(purchaseTool(p, kind), false);
    assert.deepEqual(p, before);
  }
});
test("Tools become purchasable at the same campaign milestones as their use", () => {
  const p = freshProgress();
  p.coins = 500;
  p.completed = CHAPTER.slice(0, 3).map(order => order.id);
  assert.equal(purchaseTool(p, "mix"), true);
  assert.equal(purchaseTool(p, "reserve"), false);
  p.completed = CHAPTER.slice(0, 6).map(order => order.id);
  assert.equal(purchaseTool(p, "reserve"), true);
  assert.equal(p.coins, 0);
});
test("Inventory cannot overflow on purchase and invalid balances cannot create currency", () => {
  const p = shopper();
  p.inventory.hint = Number.MAX_SAFE_INTEGER;
  const before = clone(p);
  assert.equal(purchaseTool(p, "hint"), false);
  assert.deepEqual(p, before);
  for (const coins of [NaN, Infinity, -1, 100.5]) {
    const invalid = shopper();
    invalid.coins = coins;
    const copy = structuredClone(invalid);
    assert.equal(purchaseTool(invalid, "mix"), false);
    assert.deepEqual(invalid, copy);
  }
});
