import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAMPAIGN_CHAPTERS, CAMPAIGN_PHASES, FIRST_SHOP_PHASE, PROJECTS, TASKS, SHOP_STEPS,
  areaStatus, availableProjects, blockComplete, constructionState, currentGlobalStage,
  freshCampaign, interiorOpen, isProjectOrderUnlocked, nextProjectOrder, nextProjectTask,
  phaseStatus, projectOrders, projectStatus, projectTasks, orderCurrency, repairOrderCount, taskBalance, validCampaign, type ProjectId,
} from "../src/campaign";
import { CHAPTER } from "../src/content";
import { freshProgress, purchaseProjectTask, selectProject, type Progress } from "../src/storage";

function buyAffordable(p: Progress) {
  let task;
  while ((task = nextProjectTask(p.campaign, p.selectedProject)) && taskBalance(p, task) >= task.cost)
    assert.equal(purchaseProjectTask(p, task.id), true);
}
function earnOrder(p: Progress, number: number) {
  const order = CHAPTER[number - 1];
  assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, number, p.selectedProject), true);
  assert.equal(p.completed.includes(order.id), false);
  p.completed.push(order.id);
  p[orderCurrency(order.id)!]++;
  p.coins += 60;
}
function finishProject(p: Progress, id: ProjectId, delayed = false) {
  assert.equal(selectProject(p, id), true, `select ${id}`);
  let guard = 0;
  while (phaseStatus(id, p.completed, p.campaign) !== "complete") {
    assert.ok(++guard < 250, `progress ${id}`);
    const number = nextProjectOrder(id, p.completed, p.campaign);
    if (number !== null) {
      earnOrder(p, number);
      if (!delayed) buyAffordable(p);
    } else {
      const before = p.campaign.completedTasks.length;
      buyAffordable(p);
      assert.ok(p.campaign.completedTasks.length > before, `gate ${id} must be financeable`);
    }
  }
}
function completedStageOne() {
  const p = freshProgress();
  finishProject(p, "shop-1");
  finishProject(p, "warehouse-1");
  return p;
}

test("The produced block contains Stage 1–2, first bakery and prototype terrace, with exact planned works", () => {
  const plan = JSON.parse(readFileSync(new URL("../docs/content/full-product-plan.json", import.meta.url), "utf8"));
  assert.equal(CHAPTER.length, 760);
  assert.equal(TASKS.length, 178);
  assert.equal(PROJECTS.length, 8);
  assert.equal(FIRST_SHOP_PHASE.orderTarget, 80);
  assert.equal(FIRST_SHOP_PHASE.taskTarget, 14);
  for (const project of PROJECTS) {
    const planned = plan.phases.find((phase: any) => phase.id === project.id);
    assert.deepEqual(projectTasks(project.id).map(({ id, name, cost, target }) => ({ id, name, cost, target })),
      planned.tasks.map(({ id, name, cost, target }: any) => ({ id, name, cost, target })));
    assert.equal(projectOrders(project.id).length, project.orderTarget);
    assert.equal(projectTasks(project.id).reduce((sum, task) => sum + task.cost, 0), project.orderTarget);
  }
  assert.deepEqual(TASKS.slice(0, 14).map(({ id, cost }) => ({ id, cost })), SHOP_STEPS.map(({ id, cost }) => ({ id, cost })));
  assert.equal(CAMPAIGN_PHASES.length, 36);
  assert.equal(CAMPAIGN_PHASES.reduce((sum, phase) => sum + phase.orderTarget, 0), 6000);
  assert.deepEqual(CAMPAIGN_CHAPTERS.map(chapter => [chapter.orderTarget, chapter.taskTarget]), [[1000, 114], ...Array(5).fill([1000, 126])]);
});
test("Completion includes every local order and work; 30 published victories never open the warehouse", () => {
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 30).map(order => order.id);
  p.campaign.completedTasks = SHOP_STEPS.slice(0, 10).map(task => task.id);
  assert.equal(phaseStatus("shop-1", p.completed, p.campaign), "available");
  assert.equal(phaseStatus("warehouse-1", p.completed, p.campaign), "locked");
  assert.equal(currentGlobalStage(p.completed, p.campaign), 1);
  p.completed = projectOrders("shop-1").map(order => order.id);
  assert.equal(phaseStatus("shop-1", p.completed, p.campaign), "available");
  p.campaign.completedTasks = projectTasks("shop-1").map(task => task.id);
  assert.equal(phaseStatus("shop-1", p.completed, p.campaign), "complete");
  assert.equal(projectStatus("warehouse-1", p.completed, p.campaign), "site-available");
  assert.equal(phaseStatus("shop-2", p.completed, p.campaign), "locked");
  assert.equal(areaStatus("bakery", p.completed, p.campaign), "locked");
});
test("Construction workflows pay repair kits then food stars in an open building and gate interior until all base equipment is owned", () => {
  for (const [id, projectCount, gateCount] of [["warehouse-1", 38, 14], ["fruit-yard-1", 38, 14], ["fruit-yard-2", 72, 12], ["bakery-1", 38, 14], ["terrace-1", 38, 14]] as const) {
    const p = freshProgress();
    finishProject(p, "shop-1");
    if (id !== "warehouse-1") finishProject(p, "warehouse-1");
    if (id === "fruit-yard-2") finishProject(p, "fruit-yard-1");
    if (id === "bakery-1" || id === "terrace-1") for (const prerequisite of ["shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"] as const)
      finishProject(p, prerequisite);
    if (id === "terrace-1") finishProject(p, "bakery-1");
    assert.equal(selectProject(p, id), true);
    assert.equal(constructionState(id, p.campaign), "abandoned");
    for (let i = 0; i < projectCount; i++) earnOrder(p, nextProjectOrder(id, p.completed, p.campaign)!);
    assert.equal(nextProjectOrder(id, p.completed, p.campaign), null);
    assert.equal(interiorOpen(id, p.campaign), false);
    const firstInterior = CHAPTER.findIndex(order => order.id === projectOrders(id)[projectCount].id) + 1;
    assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, firstInterior), false);
    for (let step = 0; step < gateCount; step++) {
      const task = nextProjectTask(p.campaign, id)!;
      assert.equal(purchaseProjectTask(p, task.id), true);
      assert.equal(interiorOpen(id, p.campaign), step === gateCount - 1);
      assert.equal(nextProjectOrder(id, p.completed, p.campaign), step === gateCount - 1 ? firstInterior : null);
    }
    assert.equal(p.stars, 0);
    assert.equal(p.repairKits, 0);
    assert.equal(projectStatus(id, p.completed, p.campaign), "open");
    assert.equal(constructionState(id, p.campaign), "open");
  }
});
test("All six independent Stage 2 routes remain affordable with immediate or delayed purchases", () => {
  const permutations: ProjectId[][] = [
    ["shop-2", "warehouse-2", "fruit-yard-1"], ["shop-2", "fruit-yard-1", "warehouse-2"],
    ["warehouse-2", "shop-2", "fruit-yard-1"], ["warehouse-2", "fruit-yard-1", "shop-2"],
    ["fruit-yard-1", "shop-2", "warehouse-2"], ["fruit-yard-1", "warehouse-2", "shop-2"],
  ];
  for (const delayed of [false, true]) for (const route of permutations) {
    const p = freshProgress();
    finishProject(p, "shop-1", delayed);
    finishProject(p, "warehouse-1", delayed);
    assert.equal(currentGlobalStage(p.completed, p.campaign), 2);
    assert.deepEqual(availableProjects(p.completed, p.campaign).filter(project => phaseStatus(project.id, p.completed, p.campaign) === "available").map(project => project.id),
      ["shop-2", "warehouse-2", "fruit-yard-1"]);
    for (const id of route) {
      finishProject(p, id, delayed);
      if (id === "fruit-yard-1") finishProject(p, "fruit-yard-2", delayed);
    }
    assert.equal(p.completed.length, 600);
    assert.equal(p.campaign.completedTasks.length, 126);
    assert.equal(p.stars, 0);
    assert.equal(p.repairKits, 0);
    assert.equal(p.coins, 36000);
    assert.equal(blockComplete(p.completed, p.campaign), false);
    assert.equal(phaseStatus("bakery-1", p.completed, p.campaign), "available");
    assert.equal(currentGlobalStage(p.completed, p.campaign), 3);
    assert.equal(phaseStatus("shop-3", p.completed, p.campaign), "planned");
    assert.equal(validCampaign(p.campaign), true);
  }
});
test("Delayed works may spend a shared wallet across branches without imposing catalog order", () => {
  const p = completedStageOne();
  assert.equal(selectProject(p, "warehouse-2"), true);
  for (let i = 0; i < 120; i++) earnOrder(p, nextProjectOrder("warehouse-2", p.completed, p.campaign)!);
  assert.equal(phaseStatus("warehouse-2", p.completed, p.campaign), "available");
  assert.equal(selectProject(p, "fruit-yard-1"), true);
  for (let i = 0; i < 38; i++) earnOrder(p, nextProjectOrder("fruit-yard-1", p.completed, p.campaign)!);
  buyAffordable(p);
  finishProject(p, "fruit-yard-1", true);
  assert.equal(phaseStatus("fruit-yard-2", p.completed, p.campaign), "available");
  assert.equal(nextProjectOrder("shop-2", p.completed, p.campaign), 161);
  assert.equal(nextProjectOrder("fruit-yard-2", p.completed, p.campaign), 481);
  finishProject(p, "fruit-yard-2", true);
  finishProject(p, "shop-2", true);
  finishProject(p, "warehouse-2", true);
  assert.equal(p.stars, 0);
  assert.equal(p.repairKits, 0);
  assert.equal(blockComplete(p.completed, p.campaign), false);
  assert.equal(phaseStatus("bakery-1", p.completed, p.campaign), "available");
});
test("Purchases require selected available project, local sequence, sufficient funds and unique ownership", () => {
  const p = freshProgress();
  assert.equal(selectProject(p, "warehouse-1"), false);
  p.stars = 1000;
  assert.equal(purchaseProjectTask(p, "warehouse-s1-t01"), false);
  assert.equal(purchaseProjectTask(p, "shop-s1-r14"), false);
  assert.equal(purchaseProjectTask(p, "shop-s1-r01"), false, "stars cannot buy a repair");
  p.repairKits = 1000;
  assert.equal(purchaseProjectTask(p, "shop-s1-r01"), true);
  assert.equal(p.stars, 1000);
  assert.equal(purchaseProjectTask(p, "shop-s1-r01"), false);
  p.repairKits = 1;
  assert.equal(purchaseProjectTask(p, "shop-s1-r02"), false);
  assert.equal(p.stars, 1000);
  assert.equal(p.repairKits, 1);
  assert.equal(validCampaign({ ...freshCampaign(), completedTasks: ["warehouse-s2-t02"] }), false);
  assert.equal(validCampaign({ ...freshCampaign(), completedTasks: ["shop-s1-r01", "shop-s1-r01"] }), false);
  assert.equal(validCampaign({ ...freshCampaign(), completedTasks: ["shop-s1-r14"] }), false);
  assert.equal(validCampaign({ ...freshCampaign(), completedTasks: ["shop-s1-r14"], legacyTaskOrder: true }), false);
  assert.equal(validCampaign({ ...freshCampaign(), completedTasks: ["shop-s1-r06"], legacyTaskOrder: true }), false);
});


test("Produced budgets keep the old 179/421 and add exactly each bakery/terrace32/48, independent of construction gates", () => {
  const expected = [
    ["shop-1", 3, 19], ["warehouse-1", 12, 32], ["fruit-yard-1", 12, 32],
    ["shop-2", 3, 18], ["warehouse-2", 3, 18], ["fruit-yard-2", 10, 60], ["bakery-1", 12, 32], ["terrace-1", 12, 32],
  ] as const;
  for (const [id, prefix, units] of expected) {
    const tasks = projectTasks(id), orders = projectOrders(id);
    assert.deepEqual(tasks.map(task => task.currency), tasks.map((_, index) => index < prefix ? "repairKits" : "stars"));
    assert.equal(repairOrderCount(id), units);
    assert.deepEqual(orders.map(order => orderCurrency(order.id)), orders.map((_, index) => index < units ? "repairKits" : "stars"));
  }
  const oldSix = ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"];
  const baselineTasks = TASKS.filter(task => oldSix.includes(task.phaseId));
  const baselineOrders = CHAPTER.filter(order => oldSix.includes(order.phaseId));
  assert.equal(baselineTasks.length, 126);
  assert.equal(baselineOrders.length, 600);
  assert.equal(baselineTasks.filter(task => task.currency === "repairKits").reduce((sum, task) => sum + task.cost, 0), 179);
  assert.equal(baselineTasks.filter(task => task.currency === "stars").reduce((sum, task) => sum + task.cost, 0), 421);
  assert.equal(baselineOrders.filter(order => orderCurrency(order.id) === "repairKits").length, 179);
  assert.equal(baselineOrders.filter(order => orderCurrency(order.id) === "stars").length, 421);
  assert.equal(TASKS.filter(task => task.currency === "repairKits").reduce((sum, task) => sum + task.cost, 0), 243);
  assert.equal(TASKS.filter(task => task.currency === "stars").reduce((sum, task) => sum + task.cost, 0), 517);
  assert.equal(CHAPTER.filter(order => orderCurrency(order.id) === "repairKits").length, 243);
  assert.equal(CHAPTER.filter(order => orderCurrency(order.id) === "stars").length, 517);
  assert.equal(orderCurrency("coastal-slice-1:tutorial:1"), "repairKits");
  assert.equal(orderCurrency("missing-order"), undefined);
});

test("Cosmetic work cannot spend kits, and an unsuccessful purchase leaves both wallets and ownership exact", () => {
  const p = freshProgress();
  p.campaign.completedTasks = SHOP_STEPS.slice(0, 3).map(task => task.id);
  p.repairKits = 100;
  p.stars = 3;
  const before = structuredClone(p);
  assert.equal(purchaseProjectTask(p, "shop-s1-r04"), false);
  assert.deepEqual(p, before);
  p.stars = 4;
  assert.equal(purchaseProjectTask(p, "shop-s1-r04"), true);
  assert.equal(p.repairKits, 100);
  assert.equal(p.stars, 0);
});
