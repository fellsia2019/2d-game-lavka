import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECTS, projectOrders, projectTasks, type ProjectId } from "../src/campaign";
import { canonicalLevelId } from "../src/content";
import { offlineChapterLevel } from "../src/content-offline";
import { applyMove, clone, initial } from "../src/engine";
import { createOrderAppearance } from "../src/order-supplies";
import { completeAttempt, freshProgress, purchaseProjectTask, rememberHint, type Attempt, type Progress } from "../src/storage";
import { destinationForArea, navigationState, projectLabel } from "../src/world-navigation";

function finish(p: Progress, id: ProjectId) {
  p.completed.push(...projectOrders(id).map(order => order.id));
  p.campaign.completedTasks.push(...projectTasks(id).map(task => task.id));
}
function attempt(number: number): Attempt {
  const definition = offlineChapterLevel(number);
  return { id: `navigation-${number}`, definition, appearance: createOrderAppearance(definition),
    board: initial(definition), undo: [], solution: clone(definition.verifiedSolution), mixCount: 0, hints: {}, reward: null };
}
function stageOne() {
  const p = freshProgress();
  finish(p, "shop-1"); finish(p, "warehouse-1");
  return p;
}

test("A fresh yard points only to the shop and explains the exact warehouse unlock", () => {
  const p = freshProgress(), original = clone(p);
  const n = navigationState(p);
  assert.equal(n.currentProject.id, "shop-1");
  assert.equal(n.currentArea.id, "shop");
  assert.equal(n.currentLabel, "Лавка");
  assert.equal(n.currentComplete, false);
  assert.equal(n.nextDestination, null);
  assert.deepEqual(n.availableDestinations.map(d => d.projectId), ["shop-1"]);
  assert.equal(destinationForArea(p, "warehouse"), null);
  assert.equal(destinationForArea(p, "bakery"), null);
  assert.equal(n.warehouseNotice!.kind, "locked");
  assert.equal(n.warehouseNotice!.remainingOrders, 80);
  assert.equal(n.warehouseNotice!.remainingTasks, 14);
  assert.match(n.warehouseNotice!.body, /80 заказов и 14 работ/);
  assert.deepEqual(p, original);
});

test("Orders alone or work alone never opens the warehouse", () => {
  const p = freshProgress();
  p.completed = projectOrders("shop-1").map(order => order.id);
  p.campaign.completedTasks = projectTasks("shop-1").slice(0,13).map(task => task.id);
  let n = navigationState(p);
  assert.equal(n.currentComplete, false);
  assert.deepEqual([n.remainingOrders, n.remainingTasks], [0,1]);
  assert.equal(n.nextDestination, null);
  assert.equal(destinationForArea(p, "warehouse"), null);
  assert.deepEqual([n.warehouseNotice!.remainingOrders, n.warehouseNotice!.remainingTasks], [0,1]);
  p.campaign.completedTasks.push(projectTasks("shop-1")[13].id);
  p.completed.pop();
  n = navigationState(p);
  assert.equal(n.currentComplete, false);
  assert.deepEqual([n.remainingOrders, n.remainingTasks], [1,0]);
  assert.equal(destinationForArea(p, "warehouse"), null);
});

test("The 80th ordinary reward first funds the last work; buying it then guides to the warehouse", () => {
  const p = freshProgress();
  p.completed = projectOrders("shop-1").slice(0,79).map(order => order.id);
  p.campaign.completedTasks = projectTasks("shop-1").slice(0,13).map(task => task.id);
  p.stars = 2;
  p.attempt = attempt(80);
  for (const move of p.attempt.definition.verifiedSolution) p.attempt.board = applyMove(p.attempt.board, ...move)!;
  p.attempt.solution = [];
  assert.equal(navigationState(p).nextDestination, null);
  assert.deepEqual(completeAttempt(p, "2026-10-07"), { coins: 60, stars: 1, repairKits: 0, fresh: true });
  const awarded = clone(p.attempt), afterReward = navigationState(p);
  assert.equal(afterReward.currentComplete, false);
  assert.deepEqual([afterReward.remainingOrders, afterReward.remainingTasks], [0,1]);
  assert.equal(afterReward.nextDestination, null);
  assert.equal(destinationForArea(p, "warehouse"), null);
  assert.equal(purchaseProjectTask(p, "shop-s1-r14"), true);
  const afterPurchase = navigationState(p);
  assert.equal(afterPurchase.currentComplete, true);
  assert.deepEqual([afterPurchase.remainingOrders, afterPurchase.remainingTasks], [0,0]);
  assert.equal(afterPurchase.nextDestination!.projectId, "warehouse-1");
  assert.equal(afterPurchase.nextDestination!.areaId, "warehouse");
  assert.equal(afterPurchase.nextDestination!.actionLabel, "Открыть склад");
  assert.equal(afterPurchase.nextDestination!.isNew, true);
  assert.equal(afterPurchase.warehouseNotice!.kind, "new");
  assert.equal(afterPurchase.warehouseNotice!.title, "Склад доступен");
  assert.deepEqual(p.attempt, awarded);
  assert.deepEqual([p.stars, p.repairKits], [0,0]);
});

test("New notices last through map inspection, but issued attempts, victories or work count as started", () => {
  const p = freshProgress(); finish(p, "shop-1");
  p.selectedProject = "warehouse-1";
  assert.equal(navigationState(p).warehouseNotice!.kind, "new");
  assert.equal(navigationState(p).warehouseNotice!.kind, "new");
  const variants: Progress[] = [clone(p), clone(p), clone(p)];
  variants[0].attempts["warehouse-1"] = attempt(81);
  variants[1].completed.push(projectOrders("warehouse-1")[0].id);
  variants[2].campaign.completedTasks.push(projectTasks("warehouse-1")[0].id);
  for (const begun of variants) {
    assert.equal(navigationState(begun).warehouseNotice, null);
    assert.equal(destinationForArea(begun, "warehouse")!.started, true);
    assert.equal(destinationForArea(begun, "warehouse")!.isNew, false);
    assert.equal(navigationState(begun).unlockedUnstarted.some(d => d.projectId === "warehouse-1"), false);
  }
});

test("Independent branches and a fruit successor follow actual dependencies without catalog locking", () => {
  const p = stageOne(); p.selectedProject = "warehouse-1";
  let n = navigationState(p);
  assert.deepEqual(n.unlockedUnstarted.map(d => d.projectId), ["shop-2", "warehouse-2", "fruit-yard-1"]);
  assert.equal(n.nextDestination!.projectId, "warehouse-2", "a local successor leads when available");
  assert.equal(destinationForArea(p, "shop")!.projectId, "shop-2");
  assert.equal(destinationForArea(p, "fruit-yard")!.projectId, "fruit-yard-1");
  finish(p, "fruit-yard-1"); p.selectedProject = "fruit-yard-1";
  n = navigationState(p);
  assert.equal(n.nextDestination!.projectId, "fruit-yard-2");
  assert.equal(destinationForArea(p, "fruit-yard")!.projectId, "fruit-yard-2");
  assert.equal(n.availableDestinations.find(d => d.projectId === "shop-2")!.status, "available");
  assert.equal(n.availableDestinations.find(d => d.projectId === "warehouse-2")!.status, "available");
});

test("Explicit older-stage inspection stays selected and map pins resolve their next exact phase", () => {
  const p = stageOne(); p.selectedProject = "shop-1";
  const original = clone(p), n = navigationState(p);
  assert.equal(n.currentProject.id, "shop-1");
  assert.equal(n.currentComplete, true);
  assert.equal(n.nextDestination!.projectId, "shop-2");
  assert.equal(destinationForArea(p, "shop")!.projectId, "shop-2");
  assert.equal(projectLabel("shop-1"), "Лавка");
  assert.equal(projectLabel("shop-1", { includeStage: true }), "Лавка · этап 1");
  assert.equal(projectLabel("shop-2", { includeStage: true }), "Лавка · этап 2");
  assert.equal(projectLabel("fruit-yard-1"), "Фруктовый двор");
  assert.deepEqual(p, original);
});

test("Completed siblings are inspectable but never recommended as the next unfinished destination", () => {
  const p = stageOne(); finish(p, "shop-2");
  p.selectedProject = "shop-2";
  p.attempts["warehouse-2"] = attempt(281);
  assert.equal(navigationState(p).nextDestination!.projectId, "fruit-yard-1", "new work precedes an already issued sibling");
  assert.equal(destinationForArea(p, "shop")!.projectId, "shop-2");
  assert.equal(destinationForArea(p, "shop")!.status, "complete");
  p.attempts["fruit-yard-1"] = attempt(401);
  assert.equal(navigationState(p).nextDestination!.projectId, "warehouse-2", "started unfinished branches remain valid");
  finish(p, "warehouse-2"); finish(p, "fruit-yard-1"); finish(p, "fruit-yard-2");
  const n = navigationState(p);
  assert.equal(n.nextDestination!.projectId, "bakery-1");
  assert.deepEqual(n.unlockedUnstarted.map(destination => destination.projectId), ["bakery-1"]);
  assert.equal(n.availableDestinations.length, 7, "the terrace still waits for the bakery");
  assert.equal(n.warehouseNotice, null);
  finish(p, "bakery-1");
  assert.equal(navigationState(p).nextDestination!.projectId, "terrace-1");
  assert.deepEqual(navigationState(p).unlockedUnstarted.map(destination => destination.projectId), ["terrace-1"]);
  assert.equal(navigationState(p).availableDestinations.length, PROJECTS.length);
  finish(p, "terrace-1");
  assert.equal(navigationState(p).nextDestination, null);
  assert.deepEqual(navigationState(p).unlockedUnstarted, []);
});

test("Legacy canonical ids count for notice progress and navigation leaves every pinned state unchanged", () => {
  const p = freshProgress();
  p.completed = ["coastal-slice-2:tutorial:1"];
  p.attempt = attempt(1);
  p.attempt.definition.id = "coastal-slice-2:tutorial:1";
  p.attempt.undo = [clone(p.attempt.board)];
  rememberHint(p.attempt, p.attempt.solution!);
  const original = clone(p);
  assert.equal(canonicalLevelId(p.completed[0]), "morning-first");
  assert.equal(navigationState(p).remainingOrders, 79);
  assert.equal(destinationForArea(p, "shop")!.started, true);
  assert.equal(navigationState(p).warehouseNotice!.remainingOrders, 79);
  assert.deepEqual(p, original);
});
