import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OFFLINE_CHAPTER_DEFINITIONS as CHAPTER_DEFINITIONS } from "../src/content-offline";
import { CAMPAIGN_PHASES } from "../src/campaign";

interface Phase {
  id: string;
  areaId: string;
  stage: number;
  globalStage: number;
  orderCount: number;
  requiresCompletedPhases: string[];
  tasks: { id: string; cost: number; status: string; currency: "stars" | "repairKits" }[];
  construction?: {
    taskIds: string[];
    projectOrders: number;
    interiorOrders: number;
    opensInteriorAfterTaskId: string;
    earningContext: string;
    states: string[];
  };
}
const plan = JSON.parse(readFileSync(new URL("../docs/content/full-product-plan.json", import.meta.url), "utf8")) as {
  phases: Phase[];
  totals: { orders: number; tasks: number };
  globalStages: { stage: number; completionPhaseIds: string[] }[];
  orderSlots: { id: string; phaseId: string; status: string; kind: string; rewardCurrency: "stars" | "repairKits"; requiresCompletedTaskId?: string; executionContext?: string }[];
  nextDelivery: { orders: number; tasks: number; phaseIds: string[] };
};
const slotsByPhase = new Map(plan.phases.map(phase => [phase.id, plan.orderSlots.filter(slot => slot.phaseId === phase.id)]));
const available = (done: Set<string>) => plan.phases.filter(phase => !done.has(phase.id) && phase.requiresCompletedPhases.every(id => done.has(id)));

test("Accepted design has 6000 slots, while production status still matches only pinned playable Definitions", () => {
  assert.equal(plan.totals.orders, 6000);
  assert.equal(plan.totals.tasks, 744);
  assert.equal(plan.phases.length, 36);
  assert.equal(plan.globalStages.length, 6);
  for (const area of new Set(plan.phases.map(phase => phase.areaId))) {
    assert.deepEqual(plan.phases.filter(phase => phase.areaId === area).map(phase => phase.orderCount), [80,120,160,200,220,220]);
  }
  assert.deepEqual(plan.orderSlots.filter(slot => slot.status !== "planned-no-definition").map(slot => slot.id), CHAPTER_DEFINITIONS.map(definition => definition.id));
  assert.equal(CAMPAIGN_PHASES.reduce((sum, phase) => sum + phase.orderTarget, 0), 6000);
  const firstBlock = plan.phases.filter(phase => plan.nextDelivery.phaseIds.includes(phase.id));
  assert.equal(firstBlock.reduce((sum, phase) => sum + phase.orderCount, 0), 680);
  assert.equal(firstBlock.reduce((sum, phase) => sum + phase.tasks.length, 0), 152);
  assert.deepEqual(plan.nextDelivery.phaseIds, ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2", "bakery-1"]);
  assert.deepEqual(plan.phases.filter(phase => phase.globalStage === 3 && !plan.nextDelivery.phaseIds.includes(phase.id)).map(phase => phase.id),
    ["shop-3", "warehouse-3", "fruit-yard-3", "bakery-2", "bakery-3"]);
});

test("Stage 2 projects can be chosen independently, and Stage 3 waits for all required branches", () => {
  assert.deepEqual(available(new Set()).map(phase => phase.id), ["shop-1"]);
  assert.deepEqual(available(new Set(["shop-1"])).map(phase => phase.id), ["warehouse-1"]);
  const done = new Set(["shop-1", "warehouse-1"]);
  assert.deepEqual(available(done).map(phase => phase.id), ["shop-2", "warehouse-2", "fruit-yard-1"]);
  done.add("fruit-yard-1");
  assert.deepEqual(available(done).map(phase => phase.id), ["shop-2", "warehouse-2", "fruit-yard-2"]);
  done.add("warehouse-2");
  done.add("fruit-yard-2");
  assert.deepEqual(available(done).map(phase => phase.id), ["shop-2"]);
  done.add("shop-2");
  assert.deepEqual(available(done).map(phase => phase.id), ["shop-3", "warehouse-3", "fruit-yard-3", "bakery-1"]);
});

test("Construction earns externally until entry and basic equipment are paid; interior slots preserve their gate", () => {
  for (const phase of plan.phases.filter(phase => phase.construction)) {
    const construction = phase.construction!;
    const prefix = phase.tasks.slice(0, construction.taskIds.length);
    assert.equal(prefix.at(-1)!.id, construction.opensInteriorAfterTaskId);
    assert.equal(prefix.reduce((sum, task) => sum + task.cost, 0), construction.projectOrders);
    assert.equal(construction.projectOrders + construction.interiorOrders, phase.orderCount);
    assert.equal(construction.earningContext, "any-already-open-building");
    for (const state of ["foundation", "walls", "roof", "base-equipment", "open"]) assert.ok(construction.states.includes(state));
    const slots = plan.orderSlots.filter(slot => slot.phaseId === phase.id);
    for (const [index, slot] of slots.entries()) {
      if (index < construction.projectOrders) {
        assert.equal(slot.kind, "construction-project");
        assert.equal(slot.executionContext, "already-open-building");
        assert.equal(slot.requiresCompletedTaskId, undefined);
      } else {
        assert.equal(slot.kind, "interior");
        assert.equal(slot.requiresCompletedTaskId, construction.opensInteriorAfterTaskId);
      }
    }
  }
});

test("Bakery sorting starts in the entrance hall after its paid trays and does not wait for kitchen equipment", () => {
  const bakery = plan.phases.find(phase => phase.id === "bakery-1")!;
  assert.deepEqual(bakery.tasks.slice(12, 19).map(task => task.id), [19,20,21,22,23,24,25].map(n => `bakery-s1-t${n}`));
  assert.deepEqual(bakery.tasks.slice(19, 25).map(task => task.id), [13,14,15,16,17,18].map(n => `bakery-s1-t${n}`));
  assert.equal(bakery.construction!.opensInteriorAfterTaskId, "bakery-s1-t20");
  assert.equal(bakery.construction!.projectOrders, 38);
  assert.equal(bakery.construction!.interiorOrders, 42);
  assert.equal(bakery.construction!.taskIds.at(-1), bakery.tasks[13].id);
  assert.ok(!bakery.construction!.taskIds.includes("bakery-s1-t13"));
  const slots = slotsByPhase.get(bakery.id)!;
  assert.ok(slots.slice(38).every(slot => slot.requiresCompletedTaskId === "bakery-s1-t20"));
});

test("Design economy finishes in 16 mixed branch/purchase orders without borrowing from locked interiors", () => {
  const firstStage2Choices = new Set<string>();
  for (let scenario = 1; scenario <= 16; scenario++) {
    let random = scenario, steps = 0, earned = 0, purchased = 0;
    const wallet = { stars: 0, repairKits: 0 };
    let firstStage2 = false;
    const done = new Set<string>();
    const orders = new Map<string,number>();
    const tasks = new Map<string,number>();
    while (done.size < plan.phases.length) {
      const options: { phase: Phase; kind: "order" | "purchase" }[] = [];
      for (const phase of available(done)) {
        const wins = orders.get(phase.id) ?? 0, builds = tasks.get(phase.id) ?? 0;
        const construction = phase.construction;
        if (wins < phase.orderCount && (!construction || wins < construction.projectOrders || builds >= construction.taskIds.length)) options.push({phase,kind:"order"});
        if (builds < phase.tasks.length && wallet[phase.tasks[builds].currency] >= phase.tasks[builds].cost) options.push({phase,kind:"purchase"});
      }
      assert.ok(options.length, `Design deadlock in scenario ${scenario} after ${steps} actions`);
      random = (Math.imul(random,1664525) + 1013904223) >>> 0;
      const choice = options[Math.floor(random / 4294967296 * options.length)];
      if (choice.phase.globalStage === 2 && !firstStage2) { firstStage2Choices.add(choice.phase.id); firstStage2 = true; }
      const id = choice.phase.id;
      if (choice.kind === "order") {
        const count = orders.get(id) ?? 0;
        const slot = slotsByPhase.get(id)![count];
        orders.set(id,count+1); wallet[slot.rewardCurrency]++; earned++;
      } else {
        const index = tasks.get(id) ?? 0, task = choice.phase.tasks[index];
        wallet[task.currency] -= task.cost; tasks.set(id,index+1); purchased++;
      }
      assert.ok(wallet.stars >= 0 && wallet.repairKits >= 0);
      if (orders.get(id) === choice.phase.orderCount && tasks.get(id) === choice.phase.tasks.length) done.add(id);
      assert.ok(++steps <= 6744, "Unexpected extra reward/purchase in design simulation");
    }
    assert.deepEqual(wallet,{ stars: 0, repairKits: 0 });
    assert.equal(earned,6000);
    assert.equal(purchased,744);
  }
  assert.equal(firstStage2Choices.size,3);
});
