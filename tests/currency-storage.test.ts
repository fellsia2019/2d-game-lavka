import { test } from "node:test";
import assert from "node:assert/strict";
import { offlineChapterLevel } from "../src/content-offline";
import { applyMove, clone, initial } from "../src/engine";
import { SHOP_STEPS, TASKS, projectOrders, projectTasks, nextProjectTask, validCampaign, interiorOpen, isProjectOrderUnlocked } from "../src/campaign";
import { applyDebugSceneState } from "../src/debug-scene";
import { createOrderAppearance } from "../src/order-supplies";
import { completeAttempt, freshProgress, loadProgress, saveProgress, validateAttempt, purchaseProjectTask, rememberHint, type Attempt, type Progress } from "../src/storage";

function pinned(number: number, win = true): Attempt {
  const definition = offlineChapterLevel(number);
  const a: Attempt = { id: `currency-${number}`, definition, board: initial(definition), undo: [],
    solution: clone(definition.verifiedSolution), mixCount: 0, hints: {}, reward: null };
  if (win) {
    for (const move of definition.verifiedSolution) {
      const next = applyMove(a.board, ...move);
      assert.ok(next, definition.id);
      a.board = next;
    }
    a.solution = [];
  }
  return a;
}
function oldSave(): any {
  const p: any = freshProgress();
  p.schema = 7;
  p.campaign.version = "coastal-campaign-5";
  delete p.repairKits;
  return p;
}
function reload(p: Progress): Progress {
  let raw = "";
  assert.equal(saveProgress({ setItem: (_key, value) => { raw = value; } }, p), true);
  const result = loadProgress({ getItem: () => raw });
  assert.equal(result.warning, undefined);
  assert.equal(result.migrated, false);
  return result.progress;
}

test("Every repair/food boundary pays its issuing currency once, and replay pays only capped coins", () => {
  const repairOrders = [1, 19, 81, 112, 161, 178, 281, 298, 401, 432, 481, 540];
  const foodOrders = [20, 80, 113, 160, 179, 280, 299, 400, 433, 480, 541, 600];
  for (const [numbers, repair] of [[repairOrders, true], [foodOrders, false]] as const) for (const number of numbers) {
    const p = freshProgress();
    // An old issued repair can finish while the UI is already targeting furniture.
    p.campaign.completedTasks = SHOP_STEPS.slice(0, 3).map(task => task.id);
    p.attempt = pinned(number);
    const definition = clone(p.attempt.definition), board = clone(p.attempt.board), inventory = clone(p.inventory);
    const expected = { coins: 60, stars: repair ? 0 : 1, repairKits: repair ? 1 : 0, fresh: true };
    assert.deepEqual(completeAttempt(p, "2026-10-07"), expected);
    assert.deepEqual(completeAttempt(p, "2026-10-08"), expected);
    assert.deepEqual([p.coins, p.stars, p.repairKits], [60, expected.stars, expected.repairKits]);
    assert.deepEqual(p.attempt.definition, definition);
    assert.deepEqual(p.attempt.board, board);
    assert.deepEqual(p.inventory, inventory);
    assert.equal(validateAttempt(p.attempt), true);
    for (let repeat = 0; repeat < 12; repeat++) {
      p.attempt = pinned(number);
      assert.deepEqual(completeAttempt(p, "2026-10-08"), { coins: repeat < 10 ? 10 : 0, stars: 0, repairKits: 0, fresh: false });
    }
    assert.deepEqual([p.coins, p.stars, p.repairKits], [160, expected.stars, expected.repairKits]);
    assert.deepEqual(completeAttempt(Object.assign(p, { attempt: pinned(number) }), "2026-10-09"),
      { coins: 10, stars: 0, repairKits: 0, fresh: false });
  }
});

test("Schema 7 splits only unspent credit and preserves cross-funded ownership without creating debt", () => {
  for (const [completed, prefix, credit, kits, stars] of [
    [8, 0, 8, 8, 0], [30, 3, 11, 0, 11], [30, 1, 24, 13, 11],
    [30, 1, 5, 5, 0], [4, 3, 7, 0, 7],
  ]) {
    const old = oldSave();
    old.completed = projectOrders("shop-1").slice(0, completed).map(order => order.id);
    old.campaign.completedTasks = SHOP_STEPS.slice(0, prefix).map(task => task.id);
    old.stars = credit;
    old.coins = 991;
    old.inventory = { hint: 5, mix: 4, reserve: 2 };
    old.renovations = { counter: "honey", sign: "coral", window: "sea" };
    old.renovation = "coral";
    const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(loaded.warning, undefined);
    assert.equal(loaded.migrated, true);
    assert.equal(loaded.progress.schema, 10);
    assert.equal(loaded.progress.campaign.version, "coastal-campaign-8");
    assert.deepEqual([loaded.progress.repairKits, loaded.progress.stars], [kits, stars]);
    assert.equal(kits + stars, credit);
    assert.deepEqual(loaded.progress.campaign.completedTasks, old.campaign.completedTasks);
    for (const key of ["completed", "coins", "inventory", "renovations"] as const) assert.deepEqual(loaded.progress[key], old[key]);
    assert.deepEqual(reload(loaded.progress), loaded.progress);
  }
});

test("Old reward receipts migrate to repair kits without another payout; presentation is pinned outside exact puzzle state", () => {
  const old = oldSave();
  old.completed = ["shop-1", "warehouse-1"].flatMap(id => projectOrders(id).map(order => order.id));
  old.campaign.completedTasks = ["shop-1", "warehouse-1"].flatMap(id => projectTasks(id).map(task => task.id));
  old.selectedProject = "warehouse-2";
  old.attempts = { "warehouse-2": pinned(281), "shop-2": pinned(179, false) };
  old.attempt = old.attempts["warehouse-2"];
  old.attempt.reward = { coins: 60, stars: 1, fresh: true };
  old.completed.push(old.attempt.definition.id);
  old.coins = 9660;
  old.stars = 1;
  const exact = clone(old.attempts);
  const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
  assert.equal(loaded.warning, undefined);
  const p = loaded.progress;
  assert.deepEqual([p.coins, p.stars, p.repairKits], [9660, 0, 1]);
  for (const id of ["warehouse-2", "shop-2"] as const) {
    const a = p.attempts[id]!;
    for (const key of ["id", "definition", "board", "undo", "solution", "hints", "mixCount"] as const)
      assert.deepEqual(a[key], exact[id][key]);
    assert.deepEqual(a.appearance, createOrderAppearance(a.definition));
  }
  assert.equal(p.attempt!.appearance!.kind, "repair");
  assert.equal(p.attempts["shop-2"]!.appearance!.kind, "food");
  const receipt = { coins: 60, stars: 0, repairKits: 1, fresh: true };
  assert.deepEqual(completeAttempt(p, "2026-10-07"), receipt);
  assert.deepEqual(completeAttempt(reload(p), "2026-10-08"), receipt);
  assert.deepEqual([p.coins, p.stars, p.repairKits], [9660, 0, 1]);
});

test("A migrated pending victory pays repair kits exactly once and retains independently pinned appearance text", () => {
  const old = oldSave();
  old.attempt = pinned(1);
  old.attempt.appearance = createOrderAppearance(old.attempt.definition);
  old.attempt.appearance.title = "Сохранённое название заказа";
  old.attempt.appearance.customer = "Сохранённый мастер";
  old.attempt.appearance.line = "Сохранённое описание для ремонта.";
  const exact = clone(old.attempt);
  const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
  assert.equal(loaded.warning, undefined);
  assert.deepEqual(loaded.progress.attempt, exact);
  assert.deepEqual(completeAttempt(loaded.progress, "2026-10-07"), { coins: 60, stars: 0, repairKits: 1, fresh: true });
  const restored = reload(loaded.progress);
  assert.deepEqual(completeAttempt(restored, "2026-10-08"), { coins: 60, stars: 0, repairKits: 1, fresh: true });
  assert.deepEqual([restored.coins, restored.stars, restored.repairKits], [60, 0, 1]);
  assert.deepEqual(restored.attempt!.appearance, exact.appearance);
  assert.deepEqual(restored.attempt!.definition, exact.definition);
});

test("Wrong reward currency or material presentation drops only its attempt and leaves both wallets exact", () => {
  for (const corruption of ["reward", "appearance"] as const) {
    const p = freshProgress();
    p.attempt = pinned(1);
    p.stars = 11;
    p.repairKits = 7;
    if (corruption === "reward") p.attempt.reward = { coins: 60, stars: 1, repairKits: 0, fresh: true };
    else p.attempt.appearance = { ...createOrderAppearance(p.attempt.definition), kind: "food" };
    const loaded = loadProgress({ getItem: () => JSON.stringify(p) });
    assert.match(loaded.warning!, /один из заказов/);
    assert.equal(loaded.progress.attempt, null);
    assert.deepEqual([loaded.progress.stars, loaded.progress.repairKits], [11, 7]);
    assert.deepEqual(loaded.progress.campaign, p.campaign);
  }
  const p = freshProgress();
  p.repairKits = -1;
  assert.match(loadProgress({ getItem: () => JSON.stringify(p) }).warning!, /повреждено/);
});


test("A schema-8 optional missing appearance pins once without rewriting wallets, Definition or exact attempt state", () => {
  const p = freshProgress();
  p.stars = 11;
  p.repairKits = 7;
  p.attempt = pinned(1, false);
  p.attempts["warehouse-2"] = pinned(281, false);
  p.attempts["shop-2"] = pinned(179, false);
  p.attempts["shop-2"]!.appearance = createOrderAppearance(p.attempts["shop-2"]!.definition);
  p.attempts["shop-2"]!.appearance!.title = "Закреплённый пищевой заказ";
  const original = clone(p.attempt);
  const otherAttempts = clone(p.attempts);
  const source = { ...p, schema: 8, campaign: { ...p.campaign, version: "coastal-campaign-6" } };
  const result = loadProgress({ getItem: () => JSON.stringify(source) });
  assert.equal(result.warning, undefined);
  assert.equal(result.migrated, true, "the controller persists the newly pinned field once");
  assert.equal(result.progress.schema, 10);
  assert.equal(result.progress.campaign.version, "coastal-campaign-8");
  assert.deepEqual([result.progress.stars, result.progress.repairKits], [11, 7]);
  assert.deepEqual(result.progress.attempt, { ...original, appearance: createOrderAppearance(original.definition) });
  assert.deepEqual(result.progress.attempt!.definition, original.definition);
  assert.deepEqual(result.progress.attempts["warehouse-2"], {
    ...otherAttempts["warehouse-2"], appearance: createOrderAppearance(otherAttempts["warehouse-2"]!.definition),
  });
  assert.deepEqual(result.progress.attempts["shop-2"], otherAttempts["shop-2"]);
  assert.deepEqual(reload(result.progress), result.progress);
});

test("Schema 8 moves to 10 without redistributing either wallet or changing paid ownership and pinned attempts", () => {
  const old = freshProgress() as any;
  old.schema = 8;
  old.campaign.version = "coastal-campaign-6";
  old.coins = 2460; old.stars = 37; old.repairKits = 11;
  old.completed = projectOrders("shop-1").slice(0, 12).map(order => order.id);
  old.campaign.completedTasks = SHOP_STEPS.slice(0, 3).map(task => task.id);
  old.attempt = pinned(13, false);
  const first = old.attempt.solution[0];
  old.attempt.undo.push(clone(old.attempt.board));
  old.attempt.board = applyMove(old.attempt.board, first[0], first[1])!;
  old.attempt.solution = old.attempt.solution.slice(1);
  old.attempt.appearance = createOrderAppearance(old.attempt.definition);
  old.attempts["shop-1"] = clone(old.attempt);
  const snapshot = clone(old);
  const loaded = loadProgress({getItem: () => JSON.stringify(old)});
  assert.equal(loaded.warning, undefined);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.progress.schema, 10);
  assert.equal(loaded.progress.campaign.version, "coastal-campaign-8");
  for (const key of ["coins", "stars", "repairKits", "completed", "renovations", "sceneDecor", "attempt", "attempts", "inventory", "settings"] as const)
    assert.deepEqual(loaded.progress[key], snapshot[key], key);
  assert.deepEqual(loaded.progress.campaign.completedTasks, snapshot.campaign.completedTasks);
  const again = loadProgress({getItem: () => JSON.stringify(loaded.progress)});
  assert.equal(again.warning, undefined);
  assert.deepEqual(again.progress, loaded.progress);
});

test("All kitchen-first schema-9 prefixes keep their paid objects, wallets and unlocked pinned bakery order", () => {
  const formerTasks = projectTasks("bakery-1").map(task => task.id).sort();
  for (let count = 0; count <= 26; count++) {
    const old: any = freshProgress();
    old.schema = 9; old.campaign.version = "coastal-campaign-7";
    old.selectedProject = "bakery-1";
    old.campaign.completedTasks = TASKS.filter(task => task.phaseId !== "bakery-1").map(task => task.id).concat(formerTasks.slice(0, count));
    old.completed = ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"]
      .flatMap(id => projectOrders(id).map(order => order.id));
    old.coins = 2460; old.stars = 17; old.repairKits = 9;
    if (count >= 14) {
      old.completed.push(...projectOrders("bakery-1").slice(0, 38).map(order => order.id));
      old.attempt = pinned(639, false);
      old.attempt.appearance = createOrderAppearance(old.attempt.definition);
      old.attempt.undo.push(clone(old.attempt.board));
      old.attempt.board = applyMove(old.attempt.board, old.attempt.solution[0][0], old.attempt.solution[0][1])!;
      old.attempt.solution = old.attempt.solution.slice(1);
      assert.equal(rememberHint(old.attempt, old.attempt.solution), true);
      old.attempts["bakery-1"] = clone(old.attempt);
    }
    const snapshot = clone(old);
    const result = loadProgress({getItem: () => JSON.stringify(old)});
    assert.equal(result.warning, undefined, `old prefix ${count}`);
    const p = result.progress;
    assert.equal(p.schema, 10);
    assert.equal(p.campaign.version, "coastal-campaign-8");
    assert.deepEqual(p.campaign.completedTasks, snapshot.campaign.completedTasks);
    for (const key of ["coins", "stars", "repairKits", "completed", "attempt", "attempts", "inventory"] as const)
      assert.deepEqual(p[key], snapshot[key], `${count}: ${key}`);
    assert.equal(validCampaign(p.campaign), true);
    assert.deepEqual(reload(p), p);
    if (count >= 14) {
      assert.equal(interiorOpen("bakery-1", p.campaign), true);
      assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, 639, "bakery-1"), true);
    }
    const alreadyPaid = new Set(p.campaign.completedTasks);
    p.stars = 100; p.repairKits = 100;
    for (let task = nextProjectTask(p.campaign, "bakery-1"); task; task = nextProjectTask(p.campaign, "bakery-1")) {
      assert.equal(alreadyPaid.has(task.id), false);
      assert.equal(purchaseProjectTask(p, task.id), true);
      assert.equal(validCampaign(p.campaign), true);
    }
    assert.deepEqual(reload(p), p);
  }
});

test("Bakery migration only permits the paid former prefix plus the normal remaining sequence, and debug resets it", () => {
  const p = freshProgress(), old = projectTasks("bakery-1").map(task => task.id).sort();
  p.campaign.bakeryLegacyPrefix = 14;
  assert.equal(validCampaign(p.campaign), false, "missing already paid objects");
  p.campaign.completedTasks = old.slice(0, 14);
  assert.equal(validCampaign(p.campaign), true);
  p.campaign.completedTasks.push("bakery-s1-t25");
  assert.equal(validCampaign(p.campaign), false, "cannot skip unpaid front-room works");
  p.campaign.completedTasks.pop();
  assert.equal(applyDebugSceneState(p, {projectId:"bakery-1", works:14, orders:38}).ok, true);
  assert.equal(p.campaign.bakeryLegacyPrefix, undefined);
  assert.equal(validCampaign(p.campaign), true);
  assert.deepEqual(reload(p), p);
});
