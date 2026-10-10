import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAPTER, chapterLevel } from "../src/content";
import { offlineChapterLevel } from "../src/content-offline";
import { LEGACY_SHOP_STEPS, migrateCampaign, migrateShopCampaign, TASKS, blockComplete, nextProjectOrder, nextProjectTask, phaseStatus, projectOrders, projectTasks, orderCurrency, taskBalance, type ProjectId } from "../src/campaign";
import { applyMove, clone, initial, type Definition } from "../src/engine";
import {
  cachedHint, completeAttempt, freshProgress, loadProgress, purchaseProjectTask,
  rememberHint, saveProgress, selectProject, type Attempt, type Progress,
} from "../src/storage";
import { createOrderAppearance } from "../src/order-supplies";
const freshReward = (id: string) => ({ coins: 60, stars: orderCurrency(id) === "stars" ? 1 : 0, repairKits: orderCurrency(id) === "repairKits" ? 1 : 0, fresh: true });

function attempt(definition: Definition): Attempt {
  const board = initial(definition);
  const path = definition.verifiedSolution;
  const a: Attempt = { id: `pinned-${definition.id}`, definition, appearance: createOrderAppearance(definition), board: applyMove(board, ...path[0])!,
    undo: [board], solution: path.slice(1), mixCount: 0, hints: {}, reward: null };
  assert.equal(rememberHint(a, a.solution!), true);
  return a;
}
function persist(p: Progress) {
  let raw = "";
  assert.equal(saveProgress({ setItem: (_key, value) => { raw = value; } }, p), true);
  return loadProgress({ getItem: () => raw });
}
function unlockStageTwo(p: Progress) {
  p.completed = ["shop-1", "warehouse-1"].flatMap(id => projectOrders(id).map(order => order.id));
  p.campaign.completedTasks = ["shop-1", "warehouse-1"].flatMap(id => projectTasks(id).map(task => task.id));
  p.renovations = { sign: "coral", counter: "honey", window: "sea" } as Progress["renovations"];
  p.renovation = "coral";
}
function legacySave(schema: number, prefix: number) {
  const p: any = freshProgress();
  p.schema = schema;
  delete p.selectedProject;
  delete p.attempts;
  p.coins = 1873;
  p.stars = 7;
  p.inventory = { hint: 6, mix: 2, reserve: 3 };
  p.repeatDay = "2026-10-05";
  p.repeatCount = 8;
  p.completed = CHAPTER.slice(0, 20).map(order => order.id);
  p.recentStructures = ["stored-structure"];
  p.tutorialSeen = ["spotlight-transfer"];
  p.attempt = attempt(chapterLevel(21));
  if (schema <= 2) {
    delete p.campaign;
    p.renovations = { sign: "coral", counter: "honey", window: "sea" };
    p.renovation = "coral";
    if (schema === 1) {
      // The original schema owned only a sign; it had no hint payment cache.
      delete p.renovations;
      delete p.tutorialSeen;
      delete p.recentStructures;
      delete p.attempt.hints;
    }
  } else {
    p.campaign.version = `coastal-campaign-${schema - 2}`;
    p.campaign.completedTasks = LEGACY_SHOP_STEPS.slice(0, prefix).map(task => task.id);
    p.renovations = { window: "honey" };
    if (prefix >= 4) p.renovations.counter = "honey";
    if (prefix >= 5) p.renovations.sign = p.renovation = "coral";
  }
  return p;
}

test("Schemas 1–5 migrate once with exact paid credit, preserved preferences and pinned Definition", () => {
  for (const schema of [1, 2, 3, 4, 5]) {
    const max = schema === 3 ? 5 : schema === 4 ? 8 : schema === 5 ? 11 : 0;
    for (let prefix = 0; prefix <= max; prefix++) {
      const old = legacySave(schema, prefix);
      const result = loadProgress({ getItem: () => JSON.stringify(old) });
      assert.equal(result.warning, undefined, `schema ${schema}, prefix ${prefix}`);
      assert.equal(result.migrated, true);
      const p = result.progress;
      assert.equal(p.schema, 10);
      assert.equal(p.selectedProject, "shop-1");
      for (const key of ["coins", "inventory", "completed", "settings", "repeatDay", "repeatCount"] as const)
        assert.deepEqual(p[key], old[key], `schema ${schema}: ${key}`);
      assert.deepEqual(p.attempt!.definition, old.attempt.definition);
      assert.deepEqual(p.attempt!.board, old.attempt.board);
      assert.deepEqual(p.attempt!.undo, old.attempt.undo);
      assert.deepEqual(p.attempt!.solution, old.attempt.solution);
      assert.deepEqual(p.attempts["shop-1"], p.attempt);
      assert.deepEqual(cachedHint(p.attempt!), old.attempt.solution);
      if (schema > 1) {
        assert.deepEqual(p.renovations, old.renovations);
        assert.deepEqual(p.attempt!.hints, old.attempt.hints);
      }
      const oldCampaign = schema <= 2 ? migrateCampaign(schema === 1 ? { sign: old.renovation } : old.renovations) : old.campaign;
      const credit = migrateShopCampaign(oldCampaign);
      assert.deepEqual(p.campaign, credit.campaign);
      assert.equal(p.stars + p.repairKits, old.stars + credit.refund);
      assert.deepEqual(p.attempt!.appearance, createOrderAppearance(old.attempt.definition));
      const again = persist(p);
      assert.equal(again.warning, undefined);
      assert.equal(again.migrated, false);
      assert.deepEqual(again.progress, p);
    }
  }
});
test("Every out-of-order legacy repair combination retains its price credit and can finish the full 80-star first project", () => {
  for (let mask = 0; mask < 8; mask++) {
    const old = legacySave(2, 0);
    old.renovations = {};
    if (mask & 1) old.renovations.sign = "coral";
    if (mask & 2) old.renovations.counter = "honey";
    if (mask & 4) old.renovations.window = "sea";
    old.renovation = old.renovations.sign ?? null;
    const spent = (mask & 1 ? 3 : 0) + (mask & 2 ? 3 : 0) + (mask & 4 ? 4 : 0);
    old.stars = 20 - spent;
    const result = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(result.warning, undefined);
    const p = result.progress;
    assert.equal(TASKS.filter(task => p.campaign.completedTasks.includes(task.id)).reduce((sum, task) => sum + task.cost, 0) + (p.stars + p.repairKits - old.stars), spent);
    p.stars += 60;
    let next;
    while ((next = nextProjectTask(p.campaign, "shop-1"))) assert.equal(purchaseProjectTask(p, next.id), true);
    assert.equal(p.stars, 0);
    assert.equal(p.repairKits, 0);
    assert.equal(persist(p).warning, undefined);
  }
});
test("Switching three independent projects and reload preserves exact boards, undo, seeds, versions and paid hints", async () => {
  const p = freshProgress();
  unlockStageTwo(p);
  p.coins = 942;
  p.stars = 9;
  const expected: Partial<Record<ProjectId, Attempt>> = {};
  for (const [id, number] of [["shop-2", 161], ["warehouse-2", 281], ["fruit-yard-1", 401]] as const) {
    assert.equal(selectProject(p, id), true);
    assert.equal(p.attempt, null);
    p.attempt = attempt(offlineChapterLevel(number));
    p.attempt.mixCount = 1;
    expected[id] = clone(p.attempt);
  }
  for (const id of ["shop-2", "warehouse-2", "fruit-yard-1"] as const) {
    assert.equal(selectProject(p, id), true);
    assert.deepEqual(p.attempt, expected[id]);
    assert.deepEqual(cachedHint(p.attempt!), expected[id]!.solution);
  }
  const loaded = persist(p);
  assert.equal(loaded.warning, undefined);
  assert.equal(loaded.progress.selectedProject, "fruit-yard-1");
  assert.equal(loaded.progress.coins, 942);
  assert.equal(loaded.progress.stars, 9);
  for (const id of ["shop-2", "warehouse-2", "fruit-yard-1"] as const) {
    assert.equal(selectProject(loaded.progress, id), true);
    assert.deepEqual(loaded.progress.attempt, expected[id]);
  }
});
test("A malformed project attempt is discarded independently while other branches and completed ownership survive", async () => {
  const p = freshProgress();
  unlockStageTwo(p);
  selectProject(p, "shop-2");
  p.attempt = attempt(offlineChapterLevel(161));
  selectProject(p, "warehouse-2");
  p.attempt = attempt(offlineChapterLevel(281));
  p.attempts["shop-2"]!.board.shelves[0].front.push("j");
  const loaded = persist(p);
  assert.match(loaded.warning!, /один из заказов/);
  assert.equal(loaded.progress.attempts["shop-2"], undefined);
  assert.deepEqual(loaded.progress.attempt, p.attempt);
  assert.deepEqual(loaded.progress.campaign, p.campaign);
});
test("A completed project reward is paid once across switching, reload and stable orderId repeats", async () => {
  const p = freshProgress();
  unlockStageTwo(p);
  selectProject(p, "warehouse-2");
  p.attempt = attempt(offlineChapterLevel(281));
  const pinned = clone(p.attempt.definition);
  for (const move of p.attempt.solution!) p.attempt.board = applyMove(p.attempt.board, ...move)!;
  p.attempt.solution = [];
  assert.deepEqual(completeAttempt(p, "2026-10-06"), freshReward(pinned.id));
  selectProject(p, "shop-2");
  const loaded = persist(p);
  selectProject(loaded.progress, "warehouse-2");
  assert.deepEqual(completeAttempt(loaded.progress, "2026-10-06"), freshReward(pinned.id));
  assert.equal(loaded.progress.coins, 60);
  assert.equal(loaded.progress.stars, 0);
  assert.equal(loaded.progress.repairKits, 1);
  assert.equal(loaded.progress.completed.filter(id => id === pinned.id).length, 1);
  assert.deepEqual(loaded.progress.attempt!.definition, pinned);
});
test("Unknown schemas and campaign versions are read-only; impossible local ownership and foreign attempt projects do not acquire credit", () => {
  for (const future of [{ ...freshProgress(), schema: 11 }, { ...freshProgress(), campaign: { version: "coastal-campaign-99", completedTasks: [] } }]) {
    const raw = JSON.stringify(future);
    assert.equal(loadProgress({ getItem: () => raw }).readOnly, true);
  }
  for (const tasks of [["unknown"], ["first-shelf", "first-shelf"], ["shop-s1-t06"], ["warehouse-s2-t02"]]) {
    const p = freshProgress();
    p.campaign.completedTasks = tasks;
    assert.match(loadProgress({ getItem: () => JSON.stringify(p) }).warning!, /повреждено/);
  }
  const p = freshProgress();
  p.attempts["warehouse-1"] = attempt(chapterLevel(8));
  const result = loadProgress({ getItem: () => JSON.stringify(p) });
  assert.equal(result.progress.attempts["warehouse-1"], undefined);
  assert.match(result.warning!, /один из заказов/);
});

test("A mixed route replays all 680 pinned solutions, finances all 152 works and restores each completed project", () => {
  let p = freshProgress();
  for (const id of ["shop-1", "warehouse-1", "fruit-yard-1", "fruit-yard-2", "warehouse-2", "shop-2", "bakery-1"] as const) {
    assert.equal(selectProject(p, id), true);
    let guard = 0;
    while (phaseStatus(id, p.completed, p.campaign) !== "complete") {
      assert.ok(++guard < 300);
      const number = nextProjectOrder(id, p.completed, p.campaign);
      if (number !== null) {
        const definition = offlineChapterLevel(number);
        p.attempt = { id: `full-route-${definition.id}`, definition, board: initial(definition), undo: [],
          solution: clone(definition.verifiedSolution), mixCount: 0, hints: {}, reward: null };
        for (const move of definition.verifiedSolution) {
          const next = applyMove(p.attempt.board, ...move);
          assert.ok(next, `${definition.id}: replay`);
          p.attempt.board = next;
        }
        p.attempt.solution = [];
        assert.deepEqual(completeAttempt(p, "2026-10-06"), freshReward(definition.id));
        const balance = [p.coins, p.stars, p.repairKits];
        completeAttempt(p, "2026-10-06");
        assert.deepEqual([p.coins, p.stars, p.repairKits], balance);
      }
      let next;
      while ((next = nextProjectTask(p.campaign, id)) && taskBalance(p, next) >= next.cost) {
        assert.equal(purchaseProjectTask(p, next.id), true);
        assert.equal(purchaseProjectTask(p, next.id), false);
      }
    }
    const restored = persist(p);
    assert.equal(restored.warning, undefined);
    assert.deepEqual(restored.progress.attempt!.definition, p.attempt!.definition);
    assert.deepEqual(restored.progress.attempt!.reward, p.attempt!.reward);
    p = restored.progress;
  }
  assert.equal(blockComplete(p.completed, p.campaign), true);
  assert.equal(p.completed.length, 680);
  assert.equal(p.campaign.completedTasks.length, 152);
  assert.equal(p.coins, 40800);
  assert.equal(p.stars, 0);
  assert.equal(p.repairKits, 0);
  assert.equal(Object.keys(p.attempts).length, 7);
});

test("A saved victory without a reward restores its pinned task and pays exactly once after migration or reload", () => {
  for (const schema of [5, 6]) {
    const old: any = schema === 5 ? legacySave(5, 11) : freshProgress();
    if (schema === 6) {
      old.schema = 6;
      old.campaign.version = "coastal-campaign-4";
      old.coins = 1873;
      old.stars = 7;
      old.completed = CHAPTER.slice(0, 20).map(order => order.id);
      old.attempt = attempt(chapterLevel(21));
    }
    for (const move of old.attempt.solution) old.attempt.board = applyMove(old.attempt.board, move[0], move[1])!;
    old.attempt.solution = [];
    const exact = clone(old.attempt);
    const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(loaded.warning, undefined);
    assert.deepEqual(loaded.progress.attempt, { ...exact, appearance: createOrderAppearance(exact.definition) });
    assert.equal(loaded.progress.attempt!.reward, null);
    assert.equal(loaded.progress.coins, old.coins);
    const refund = migrateShopCampaign(old.campaign).refund;
    assert.equal(loaded.progress.stars + loaded.progress.repairKits, old.stars + refund);
    const initialStars = loaded.progress.stars;
    const initialKits = loaded.progress.repairKits;
    assert.deepEqual(completeAttempt(loaded.progress, "2026-10-06"), freshReward(exact.definition.id));
    assert.deepEqual(loaded.progress.attempt!.definition, exact.definition);
    const restored = persist(loaded.progress).progress;
    assert.deepEqual(completeAttempt(restored, "2026-10-06"), freshReward(exact.definition.id));
    assert.equal(restored.coins, old.coins + 60);
    assert.equal(restored.stars, initialStars + 1);
    assert.equal(restored.repairKits, initialKits);
    assert.equal(restored.completed.filter(id => id === exact.definition.id).length, 1);
  }
});
