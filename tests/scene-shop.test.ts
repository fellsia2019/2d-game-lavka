import { test } from "node:test";
import assert from "node:assert/strict";
import { clone, initial, applyMove } from "../src/engine";
import { offlineChapterLevel } from "../src/content-offline";
import { SHOP_STEPS, projectOrders } from "../src/campaign";
import { createOrderAppearance } from "../src/order-supplies";
import { freshProgress, loadProgress, saveProgress, renovate, completeAttempt, type Attempt, type Progress } from "../src/storage";
import { SCENE_SHOP_ITEMS, SCENE_SHOP_SLOTS, equipSceneItem, freshSceneDecor, purchaseSceneItem, sceneShopDecorations,
  sceneShopHTML, sceneShopItem, validSceneDecor, type SceneShopDecorations } from "../src/scene-shop";

function finishedShop(): Progress {
  const p = freshProgress();
  p.completed = projectOrders("shop-1").map(order => order.id);
  p.campaign.completedTasks = SHOP_STEPS.map(task => task.id);
  p.renovations = { counter: "coral", sign: "sea" };
  p.renovation = "sea";
  p.coins = 4800;
  return p;
}
function pinned(): Attempt {
  const definition = offlineChapterLevel(20);
  const board = initial(definition);
  return { id: "scene-shop-pinned", definition, board: applyMove(board, ...definition.verifiedSolution[0])!,
    undo: [board], solution: definition.verifiedSolution.slice(1), appearance: createOrderAppearance(definition),
    mixCount: 0, hints: {}, reward: null };
}
function roundTrip(p: Progress): Progress {
  let raw = "";
  assert.equal(saveProgress({ setItem: (_key, value) => { raw = value; } }, p), true);
  const result = loadProgress({ getItem: () => raw });
  assert.equal(result.warning, undefined);
  assert.equal(result.migrated, false);
  return result.progress;
}

test("Every scene cosmetic has a unique fixed price and requires its restored base", () => {
  assert.equal(SCENE_SHOP_ITEMS.length, 6);
  assert.equal(new Set(SCENE_SHOP_ITEMS.map(item => item.id)).size, 6);
  assert.deepEqual(SCENE_SHOP_ITEMS.map(item => item.cost), [600, 900, 900, 1200, 300, 600]);
  for (const item of SCENE_SHOP_ITEMS) {
    assert.ok(Number.isSafeInteger(item.cost) && item.cost > 0);
    assert.ok(SHOP_STEPS.some(task => task.id === item.requires));
    assert.ok(SCENE_SHOP_SLOTS.includes(item.slot));
    assert.ok(/^#[0-9a-f]{6}$/i.test(item.swatch));
  }
});

test("Cosmetics cannot pay for repairs, skip a task or mutate exact attempts", () => {
  for (const item of SCENE_SHOP_ITEMS) {
    const p = freshProgress();
    p.coins = 1_000_000;
    p.stars = 50;
    p.repairKits = 50;
    p.attempt = pinned();
    p.attempts["shop-1"] = p.attempt;
    const before = clone(p);
    assert.deepEqual(purchaseSceneItem(p, item.id), { ok: false, reason: "locked" });
    assert.equal(equipSceneItem(p, item.id), false);
    assert.deepEqual(sceneShopDecorations(p, item.id), {});
    assert.deepEqual(p, before);
  }
});

test("A first cosmetic purchase charges coins once and equips its permanent right", () => {
  const p = finishedShop();
  p.stars = 12;
  p.repairKits = 8;
  p.attempt = pinned();
  p.attempts["shop-1"] = p.attempt;
  const before = clone(p);
  for (const item of SCENE_SHOP_ITEMS) {
    const wallet = p.coins;
    assert.deepEqual(purchaseSceneItem(p, item.id), { ok: true, item });
    assert.equal(p.coins, wallet - item.cost);
    assert.ok(p.sceneDecor?.owned.includes(item.id));
    assert.equal(p.sceneDecor?.equipped[item.slot], item.id);
    const paid = clone(p);
    assert.deepEqual(purchaseSceneItem(p, item.id), { ok: false, reason: "owned" });
    assert.deepEqual(p, paid);
    assert.deepEqual(roundTrip(p), p);
  }
  assert.equal(p.coins, 300);
  assert.equal(p.completed.length, 80);
  for (const key of ["completed", "campaign", "stars", "repairKits", "inventory", "renovations", "attempt", "attempts"] as const) assert.deepEqual(p[key], before[key], key);
});

test("Preview is free and applying owned or restored variants never charges", () => {
  const p = finishedShop();
  const before = clone(p);
  const preview = sceneShopItem("counter-smoked-oak")!;
  assert.equal(sceneShopDecorations(p, preview.id).counterTop, preview);
  assert.deepEqual(p, before);
  assert.equal(equipSceneItem(p, preview.id), false);
  assert.equal(purchaseSceneItem(p, preview.id).ok, true);
  assert.equal(purchaseSceneItem(p, "counter-cherry").ok, true);
  const wallet = p.coins;
  assert.equal(equipSceneItem(p, preview.id), true);
  assert.equal(equipSceneItem(p, preview.id), false);
  assert.equal(equipSceneItem(p, null, "counterTop"), true);
  assert.deepEqual(sceneShopDecorations(p), {});
  assert.equal(equipSceneItem(p, null, "counterTop"), false);
  assert.equal(equipSceneItem(p, "counter-cherry"), true);
  assert.equal(p.coins, wallet);
  for (const color of ["sea", "honey", "coral"] as const) assert.equal(renovate(p, color, "counter"), true);
  assert.equal(p.coins, wallet);
  // A debug rewind keeps the cosmetic right but does not restore a missing counter.
  p.campaign.completedTasks = [];
  assert.deepEqual(sceneShopDecorations(p), {});
  assert.equal(equipSceneItem(p, preview.id), false);
  assert.ok(p.sceneDecor?.owned.includes(preview.id));
});

test("Unknown, unaffordable, corrupt and unsafe wallet buys are atomic", () => {
  for (const amount of [0, 599, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const p = finishedShop();
    p.coins = amount;
    const before = clone(p);
    assert.equal(purchaseSceneItem(p, "counter-smoked-oak").ok, false);
    assert.deepEqual(p, before);
  }
  const p = finishedShop();
  const before = clone(p);
  assert.deepEqual(purchaseSceneItem(p, "../coin"), { ok: false, reason: "unknown" });
  assert.equal(equipSceneItem(p, "invalid"), false);
  assert.deepEqual(p, before);
  p.sceneDecor = { owned: ["invalid"], equipped: {} };
  const corrupted = clone(p);
  assert.deepEqual(purchaseSceneItem(p, "counter-smoked-oak"), { ok: false, reason: "invalid-state" });
  assert.equal(equipSceneItem(p, null, "floor"), false);
  assert.deepEqual(p, corrupted);
});

test("Schema-8 saves without a cosmetic catalog initialize it without touching campaign or exact attempts", () => {
  const p = finishedShop();
  p.stars = 12;
  p.repairKits = 8;
  p.attempt = pinned();
  p.attempts["shop-1"] = p.attempt;
  delete p.sceneDecor;
  const source = { ...p, schema: 8, campaign: { ...p.campaign, version: "coastal-campaign-6" } };
  const result = loadProgress({ getItem: () => JSON.stringify(source) });
  assert.equal(result.warning, undefined);
  assert.equal(result.migrated, true);
  assert.equal(result.progress.schema, 10);
  assert.equal(result.progress.campaign.version, "coastal-campaign-8");
  assert.deepEqual(result.progress, { ...p, sceneDecor: freshSceneDecor() });
  assert.deepEqual(roundTrip(result.progress), result.progress);
});

test("A malformed cosmetic catalog does not reset orders, paid works, free paint, wallet or attempts", () => {
  for (const sceneDecor of [null, [], { owned: ["invalid"], equipped: {} },
    { owned: ["counter-cherry", "counter-cherry"], equipped: {} },
    { owned: ["counter-cherry"], equipped: { floor: "counter-cherry" } },
    { owned: [], equipped: { counterTop: "counter-cherry" } },
    { owned: [], equipped: { mystery: "counter-cherry" } }]) {
    assert.equal(validSceneDecor(sceneDecor), false);
    const p = finishedShop();
    p.attempt = pinned();
    p.attempts["shop-1"] = p.attempt;
    const result = loadProgress({ getItem: () => JSON.stringify({ ...p, sceneDecor }) });
    assert.match(result.warning!, /оформление/);
    assert.equal(result.migrated, true);
    assert.deepEqual(result.progress, { ...p, sceneDecor: freshSceneDecor() });
  }
});

test("Fresh food reward keeps one star and one completed order regardless of owned cosmetics", () => {
  const p = freshProgress();
  p.campaign.completedTasks = SHOP_STEPS.map(task => task.id);
  p.coins = 2000;
  assert.equal(purchaseSceneItem(p, "counter-cherry").ok, true);
  p.attempt = pinned();
  for (const move of p.attempt.solution!) p.attempt.board = applyMove(p.attempt.board, ...move)!;
  p.attempt.solution = [];
  assert.deepEqual(completeAttempt(p, "2026-10-08"), { fresh: true, coins: 60, stars: 1, repairKits: 0 });
  assert.equal(p.completed.length, 1);
  assert.equal(p.stars, 1);
  assert.equal(p.coins, 1160);
  const before = clone(p);
  completeAttempt(p, "2026-10-08");
  assert.deepEqual(p, before);
});

test("Catalog UI has a real preview, price, owned state and explicit default for each slot", () => {
  const p = finishedShop();
  purchaseSceneItem(p, "counter-cherry");
  let received: SceneShopDecorations = {};
  const html = sceneShopHTML(p, "/assets/", { previewId: "floor-weathered", renderPreview: (decor) => {
    received = decor;
    return '<div data-preview-registered="true"></div>';
  } });
  assert.equal(received?.floor?.id, "floor-weathered");
  assert.equal(received?.counterTop?.id, "counter-cherry");
  assert.ok(html.includes('data-preview-registered="true"'));
  assert.ok(html.includes('data-action="scene-shop-reset" data-slot="counterTop"'));
  assert.ok(html.includes('data-action="scene-shop-equip" data-item="counter-cherry"'));
  assert.ok(html.includes('Купить: Дымчатый дуб за 900 монет'));
  assert.ok(html.includes('Примерка не тратит монеты'));
  assert.ok(!html.includes("Пропуск") && !html.includes("Реклама"));
  assert.equal(validSceneDecor(p.sceneDecor), true);
});
