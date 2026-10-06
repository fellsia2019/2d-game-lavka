import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_AREAS, CAMPAIGN_CHAPTERS, CAMPAIGN_PHASES, FIRST_SHOP_PHASE, SHOP_STEPS, areaStatus, nextShopTask, shopComplete, phaseStatus } from "../src/campaign";
import { CHAPTER, chapterLevel, nextOrder } from "../src/content";
import { initial, applyMove, clone } from "../src/engine";
import { freshProgress, loadProgress, saveProgress, purchaseShopTask, completeAttempt, type Attempt } from "../src/storage";
import { shopSceneHTML } from "../src/campaign-scene";

function oldSave(repairs: number, wins: number) {
  const p: any = freshProgress();
  p.schema = 2;
  delete p.campaign;
  p.completed = CHAPTER.slice(0, wins).map(order => order.id);
  p.coins = 73 + wins * 60;
  p.stars = wins - [0, 3, 6, 10][repairs];
  p.renovations = repairs === 0 ? {} : repairs === 1 ? { sign: "coral" }
    : repairs === 2 ? { sign: "coral", counter: "honey" }
    : { sign: "coral", counter: "honey", window: "sea" };
  p.renovation = p.renovations.sign ?? null;
  const definition = chapterLevel(Math.min(10, wins + 1));
  const board = initial(definition);
  p.attempt = { id: "active-old-attempt", definition, board: applyMove(board, ...definition.verifiedSolution[0])!,
    undo: [board], solution: definition.verifiedSolution.slice(1), mixCount: 0, hints: {}, reward: null } satisfies Attempt;
  p.tutorialSeen = ["spotlight-transfer", "spotlight-rear"];
  p.inventory = { hint: 1, mix: 0, reserve: 2 };
  return p;
}
test("Every valid legacy repair prefix migrates without changing any currency or active task and can afford the remaining chain", () => {
  for (let repairs = 0; repairs <= 3; repairs++) {
    for (let wins = [0, 3, 6, 10][repairs]; wins <= 10; wins++) {
      const old = oldSave(repairs, wins), original = clone(old);
      const result = loadProgress({ getItem: () => JSON.stringify(old) });
      assert.equal(result.warning, undefined);
      assert.equal(result.migrated, true);
      const p = result.progress;
      assert.equal(p.schema, 4);
      for (const key of ["coins", "stars", "inventory", "completed", "renovations", "tutorialSeen", "attempt", "settings", "repeatDay", "repeatCount"] as const)
        assert.deepEqual(p[key], original[key], `${repairs} repairs / ${wins} wins: ${key}`);
      const credited = SHOP_STEPS.filter(task => p.campaign.completedTasks.includes(task.id)).reduce((sum, task) => sum + task.cost, 0);
      assert.equal(credited, [0, 3, 6, 10][repairs]);
      p.stars += CHAPTER.length - wins; // Remaining new wins, never repeats or a migration bonus.
      let next;
      while ((next = nextShopTask(p.campaign))) assert.equal(purchaseShopTask(p, next.id), true);
      assert.equal(p.stars, 0);
    }
  }
});
test("Migration is one-time and preserves completed demo ownership and colors after persistence", () => {
  const old = oldSave(3, 10);
  const p = loadProgress({ getItem: () => JSON.stringify(old) }).progress;
  assert.equal(shopComplete(p.completed, p.campaign), false);
  assert.equal(nextOrder(p.completed), 11);
  assert.equal(nextShopTask(p.campaign)?.id, "shop-s1-t06");
  let raw = "";
  saveProgress({ setItem: (_, value) => { raw = value; } }, p);
  const again = loadProgress({ getItem: () => raw });
  assert.equal(again.migrated, false);
  assert.deepEqual(again.progress, p);
  assert.equal(purchaseShopTask(again.progress, "shop-opening"), false);
  assert.equal(again.progress.stars, 0);
  const html = shopSceneHTML(p.campaign.completedTasks, "assets/", p.renovations);
  assert.match(html, /scene-sign coral/);
  assert.match(html, /scene-counter honey/);
  assert.match(html, /scene-garden sea/);
});
test("Purchases require order, funds and a new task; each adds a distinct permanent scene layer", () => {
  const p = freshProgress();
  assert.equal(purchaseShopTask(p, "first-shelf"), false);
  p.stars = 20;
  assert.equal(purchaseShopTask(p, "shop-opening"), false);
  let before = shopSceneHTML(p.campaign.completedTasks, "assets/");
  for (const task of SHOP_STEPS) {
    assert.equal(purchaseShopTask(p, task.id), true);
    const after = shopSceneHTML(p.campaign.completedTasks, "assets/", p.renovations);
    assert.notEqual(after, before);
    assert.equal(purchaseShopTask(p, task.id), false);
    before = after;
  }
  assert.equal(p.stars, 0);
  assert.equal(shopComplete([], p.campaign), false);
  p.completed = CHAPTER.map(order => order.id);
  assert.equal(shopComplete(p.completed, p.campaign), false);
  for (const area of CAMPAIGN_AREAS.slice(1)) assert.equal(areaStatus(area.id, p.completed, p.campaign), "planned");
  assert.deepEqual(CAMPAIGN_CHAPTERS.slice(1).map(c => [c.orderIds, c.taskIds]), Array(5).fill([[], []]));
});
test("Schema 3 keeps every old task prefix and a pinned active order; old finale continues at eleven", () => {
  for (let prefix = 0; prefix <= 5; prefix++) {
    const old: any = freshProgress();
    old.schema = 3;
    old.campaign.version = "coastal-campaign-1";
    old.campaign.completedTasks = SHOP_STEPS.slice(0, prefix).map(task => task.id);
    old.completed = CHAPTER.slice(0, 10).map(order => order.id);
    old.coins = 600;
    old.stars = 10 - SHOP_STEPS.slice(0, prefix).reduce((sum, task) => sum + task.cost, 0);
    if (prefix >= 4) old.renovations.counter = "honey";
    if (prefix >= 5) old.renovations.sign = old.renovation = "coral";
    const definition = chapterLevel(10), board = initial(definition);
    old.attempt = { id: "schema-three-pinned", definition, board: applyMove(board, ...definition.verifiedSolution[0]),
      undo: [board], solution: definition.verifiedSolution.slice(1), mixCount: 0, hints: {}, reward: null };
    const result = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(result.warning, undefined);
    assert.equal(result.migrated, true);
    assert.equal(result.progress.schema, 4);
    for (const key of ["coins", "stars", "inventory", "completed", "renovations", "attempt"] as const)
      assert.deepEqual(result.progress[key], old[key]);
    assert.deepEqual(result.progress.campaign.completedTasks, old.campaign.completedTasks);
    assert.equal(nextOrder(result.progress.completed), 11);
  }
});
test("Available slice cannot masquerade as the sixty-order phase or unlock later projects", () => {
  const p = freshProgress();
  p.completed = CHAPTER.map(order => order.id);
  p.campaign.completedTasks = SHOP_STEPS.map(task => task.id);
  assert.equal(FIRST_SHOP_PHASE.orderTarget, 60);
  assert.equal(FIRST_SHOP_PHASE.taskTarget, 20);
  assert.equal(CAMPAIGN_PHASES.length, 24);
  assert.equal(CAMPAIGN_PHASES.reduce((sum, phase) => sum + phase.orderTarget, 0), 1800);
  assert.equal(phaseStatus("shop-1", p.completed, p.campaign), "available");
  for (const phase of CAMPAIGN_PHASES.slice(1)) assert.equal(phaseStatus(phase.id, p.completed, p.campaign), "planned");
  assert.equal(shopComplete(p.completed, p.campaign), false);
});
test("An in-flight old victory retains its exact proof and grants its new reward once after migration", () => {
  const old = oldSave(1, 3);
  const p = loadProgress({ getItem: () => JSON.stringify(old) }).progress;
  const pinned = clone(p.attempt!.definition);
  for (const move of p.attempt!.solution!) p.attempt!.board = applyMove(p.attempt!.board, ...move)!;
  p.attempt!.solution = [];
  assert.deepEqual(completeAttempt(p, "2026-10-05"), { coins: 60, stars: 1, fresh: true });
  const paid = clone(p);
  completeAttempt(p, "2026-10-05");
  assert.deepEqual(p, paid);
  assert.deepEqual(p.attempt!.definition, pinned);
});
test("Unknown campaign versions stay read-only; malformed tasks cannot be silently credited", () => {
  const future = freshProgress();
  (future.campaign.version as string) = "coastal-campaign-99";
  const raw = JSON.stringify(future);
  const result = loadProgress({ getItem: () => raw });
  assert.equal(result.readOnly, true);
  assert.equal(result.migrated, undefined);
  for (const tasks of [["unknown"], ["first-shelf", "first-shelf"], ["shop-opening"], ["shop-s1-t06"], ["shop-s1-t08"]]) {
    const p = freshProgress();
    (p.campaign.completedTasks as string[]) = tasks;
    assert.match(loadProgress({ getItem: () => JSON.stringify(p) }).warning!, /повреждено/);
  }
});
