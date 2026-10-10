import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_SHOP_TASKS, SHOP_STEPS, blockComplete, currentGlobalStage, nextProjectTask, phaseStatus, projectOrders, projectTasks, orderCurrency, validSchemaSixCampaign } from "../src/campaign";
import { offlineChapterLevel } from "../src/content-offline";
import { applyMove, clone, initial } from "../src/engine";
import { createOrderAppearance } from "../src/order-supplies";
const freshReward = (id: string) => ({ coins: 60, stars: orderCurrency(id) === "stars" ? 1 : 0, repairKits: orderCurrency(id) === "repairKits" ? 1 : 0, fresh: true });
const migratedAttempt = (a: Attempt): Attempt => ({ ...clone(a), appearance: createOrderAppearance(a.definition),
  reward: a.reward ? { ...freshReward(a.definition.id), coins: a.reward.coins, fresh: a.reward.fresh } : null });
import { completeAttempt, freshProgress, loadProgress, purchaseProjectTask, renovationOwned, renovate, saveProgress, type Attempt, type Progress } from "../src/storage";

const oldCosts = [1,2,2,2,3,3,3,4,4,2,4,4,2,4,3,3,4,4,3,3,4,3,3,4,3,3];
const newThresholds = [6,11,19,23,30,36,43,48,54,58,66,71,77,80];
function oldProjectSave(prefix: number): any {
  const p: any = freshProgress();
  p.schema = 6;
  p.campaign = { version: "coastal-campaign-4", completedTasks: LEGACY_SHOP_TASKS.slice(0, prefix).map(t => t.id) };
  p.completed = projectOrders("shop-1").map(order => order.id);
  p.stars = 80 - oldCosts.slice(0, prefix).reduce((sum, n) => sum + n, 0);
  p.coins = 4800;
  if (prefix >= 4) p.renovations.counter = "honey";
  if (prefix >= 5) p.renovations.sign = p.renovation = "coral";
  p.renovations.window = "sea";
  return p;
}
function reload(p: Progress): Progress {
  let raw = "";
  assert.equal(saveProgress({ setItem: (_k, v) => { raw = v; } }, p), true);
  const result = loadProgress({ getItem: () => raw });
  assert.equal(result.warning, undefined);
  assert.equal(result.migrated, false);
  return result.progress;
}
function pinned(number: number, finish = false): Attempt {
  const definition = offlineChapterLevel(number);
  const board = initial(definition);
  const a: Attempt = { id: `old-exact-${number}`, definition, appearance: createOrderAppearance(definition), board: applyMove(board, ...definition.verifiedSolution[0])!,
    undo: [board], solution: definition.verifiedSolution.slice(1), hints: {}, mixCount: 0, reward: null };
  if (finish) {
    for (const move of a.solution!) a.board = applyMove(a.board, ...move)!;
    a.solution = [];
  }
  return a;
}

test("All 27 schema-6 ownership prefixes retain exact paid stars, can finish without another reward and refund only once", () => {
  assert.deepEqual(LEGACY_SHOP_TASKS.map(t => t.cost), oldCosts);
  for (let prefix = 0; prefix <= 26; prefix++) {
    const old = oldProjectSave(prefix);
    const result = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(result.warning, undefined, `old prefix ${prefix}`);
    assert.equal(result.migrated, true);
    const p = result.progress;
    const paid = 80 - old.stars;
    const count = newThresholds.filter(threshold => threshold <= paid).length;
    const spent = count ? newThresholds[count - 1] : 0;
    assert.deepEqual(p.campaign.completedTasks, SHOP_STEPS.slice(0, count).map(t => t.id));
    assert.equal(p.stars + p.repairKits, old.stars + paid - spent);
    assert.equal(p.stars + p.repairKits + spent, 80);
    assert.equal(p.coins, old.coins);
    assert.deepEqual(p.inventory, old.inventory);
    assert.deepEqual(p.renovations, old.renovations);
    assert.deepEqual(p.completed, old.completed);
    assert.equal(p.schema, 11);
    assert.deepEqual(reload(p), p);
    let next;
    while ((next = nextProjectTask(p.campaign, "shop-1"))) assert.equal(purchaseProjectTask(p, next.id), true);
    assert.equal(p.stars, 0);
    assert.equal(p.repairKits, 0);
    assert.equal(phaseStatus("shop-1", p.completed, p.campaign), "complete");
    assert.equal(phaseStatus("warehouse-1", p.completed, p.campaign), "available");
    assert.deepEqual(reload(p), p);
  }
});

test("Schema-6 reset retains warehouse ownership, project selection and exact rewarded or pending attempts", () => {
  const old = oldProjectSave(26);
  old.campaign.completedTasks.push(...projectTasks("warehouse-1").map(t => t.id));
  old.completed.push(...projectOrders("warehouse-1").map(order => order.id));
  old.selectedProject = "fruit-yard-1";
  old.attempts = { "shop-2": pinned(161), "warehouse-2": pinned(281, true), "fruit-yard-1": pinned(401, true) };
  old.attempts["warehouse-2"].reward = { coins: 60, stars: 1, fresh: true };
  old.attempt = old.attempts["fruit-yard-1"];
  const exact = Object.fromEntries(Object.entries(old.attempts).map(([id, a]) => [id, migratedAttempt(a as Attempt)]));
  const result = loadProgress({ getItem: () => JSON.stringify(old) });
  assert.equal(result.warning, undefined);
  assert.equal(result.progress.selectedProject, old.selectedProject);
  assert.deepEqual(result.progress.attempts, exact);
  assert.deepEqual(result.progress.attempt, exact["fruit-yard-1"]);
  assert.deepEqual(result.progress.campaign.completedTasks.slice(14), old.campaign.completedTasks.slice(26));
  assert.deepEqual(completeAttempt(result.progress, "2026-10-07"), freshReward(old.attempt.definition.id));
  const again = reload(result.progress);
  assert.deepEqual(completeAttempt(again, "2026-10-07"), freshReward(old.attempt.definition.id));
  assert.equal(again.coins, old.coins + 60);
  assert.equal(again.stars, old.stars);
  assert.equal(again.repairKits, 1);
  assert.deepEqual(again.attempt!.definition, exact["fruit-yard-1"].definition);
  assert.deepEqual(again.attempts["shop-2"], exact["shop-2"]);
  assert.deepEqual(again.attempts["warehouse-2"], exact["warehouse-2"]);
  // Other branches keep their IDs and every individual price.
  assert.equal(projectTasks("warehouse-1").length + ["shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"].flatMap(projectTasks).length, 112);
});

test("A fully completed old 600-order campaign keeps all other 112 works, six attempts and its unlocked stage", () => {
  const old = oldProjectSave(26);
  const oldProjects = ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"] as const;
  old.completed = oldProjects.flatMap(id => projectOrders(id).map(order => order.id));
  const otherIds = oldProjects.filter(id => id !== "shop-1").flatMap(id => projectTasks(id).map(task => task.id));
  old.campaign.completedTasks.push(...otherIds);
  old.coins = 36000;
  old.selectedProject = "shop-2";
  for (const [id, number] of [["shop-1", 80], ["warehouse-1", 160], ["shop-2", 280], ["warehouse-2", 400], ["fruit-yard-1", 480], ["fruit-yard-2", 600]] as const) {
    old.attempts[id] = pinned(number, true);
    old.attempts[id].reward = { coins: 60, stars: 1, fresh: true };
  }
  old.attempt = old.attempts["shop-2"];
  const result = loadProgress({ getItem: () => JSON.stringify(old) });
  assert.equal(result.warning, undefined);
  const p = result.progress;
  assert.deepEqual(p.campaign.completedTasks, [...SHOP_STEPS.map(task => task.id), ...otherIds]);
  assert.equal(otherIds.length, 112);
  assert.equal(p.campaign.completedTasks.length, 126);
  assert.equal(blockComplete(p.completed, p.campaign), false);
  assert.equal(phaseStatus("bakery-1", p.completed, p.campaign), "available");
  assert.equal(currentGlobalStage(p.completed, p.campaign), 3);
  assert.equal(p.stars, 0);
  assert.equal(p.coins, 36000);
  assert.equal(p.selectedProject, "shop-2");
  assert.deepEqual(p.attempts, Object.fromEntries(Object.entries(old.attempts).map(([id, a]) => [id, migratedAttempt(a as Attempt)])));
  assert.deepEqual(reload(p), p);
  assert.deepEqual(completeAttempt(p, "2026-10-07"), freshReward(p.attempt!.definition.id));
  assert.equal(p.coins, 36000);
  assert.equal(p.stars, 0);
});

test("Legacy first-five repair exceptions migrate to a valid prefix, while later skipped jobs acquire no credit", () => {
  const old = oldProjectSave(0);
  old.campaign.completedTasks = ["shop-opening", "first-stock"];
  old.campaign.legacyTaskOrder = true;
  old.renovations.sign = "coral";
  old.renovation = "coral";
  old.stars = 15;
  const result = loadProgress({ getItem: () => JSON.stringify(old) });
  assert.equal(result.warning, undefined);
  assert.deepEqual(result.progress.campaign.completedTasks, []);
  assert.equal(result.progress.stars, 1);
  assert.equal(result.progress.repairKits, 19);
  assert.equal("legacyTaskOrder" in result.progress.campaign, false);
  for (const bad of [["shop-s1-t06"], ["shop-s1-t12"], ["first-shelf", "first-shelf"], ["shop-s1-r01"]]) {
    old.campaign.completedTasks = bad;
    assert.equal(validSchemaSixCampaign(old.campaign), false);
    assert.match(loadProgress({ getItem: () => JSON.stringify(old) }).warning!, /повреждено/);
  }
});

test("Retained color preferences never buy new modules and purchases preserve their selected color", () => {
  const p = freshProgress();
  p.stars = 61;
  p.repairKits = 19;
  p.renovations = { sign: "coral", counter: "honey", window: "sea" };
  p.renovation = "coral";
  assert.deepEqual(reload(p).renovations, p.renovations);
  for (const id of ["sign", "counter", "window"] as const) {
    assert.equal(renovationOwned(p, id), false);
    assert.equal(renovate(p, "sea", id), false);
  }
  for (const [index, task] of SHOP_STEPS.entries()) {
    assert.equal(purchaseProjectTask(p, task.id), true);
    assert.equal(renovationOwned(p, "counter"), index >= 8);
    assert.equal(renovationOwned(p, "sign"), index === 13);
    assert.equal(renovationOwned(p, "window"), index >= 2);
    assert.deepEqual(p.renovations, { sign: "coral", counter: "honey", window: "sea" });
  }
  assert.equal(renovate(p, "sea", "counter"), true);
  assert.equal(renovate(p, "honey", "sign"), true);
  assert.equal(p.renovation, "honey");
  assert.equal(p.stars, 0);
});

test("Refund overflow and unknown campaign/schema versions preserve raw storage read-only", () => {
  const old = oldProjectSave(1);
  old.stars = Number.MAX_SAFE_INTEGER;
  for (const fixture of [old, { ...freshProgress(), schema: 12 }, { ...old, campaign: { ...old.campaign, version: "coastal-campaign-99" } }]) {
    const raw = JSON.stringify(fixture);
    let saved = raw;
    const result = loadProgress({ getItem: () => saved });
    assert.equal(result.readOnly, true);
    assert.equal(saved, raw);
  }
});
