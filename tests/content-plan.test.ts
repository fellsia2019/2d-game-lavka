import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHAPTER_DEFINITIONS } from "../src/content";
import { CAMPAIGN_PHASES } from "../src/campaign";

interface Phase {
  id: string;
  areaId: string;
  stage: number;
  globalStage: number;
  orderCount: number;
  requiresCompletedPhases: string[];
  tasks: { id: string; cost: number; status: string }[];
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
  orderSlots: { id: string; phaseId: string; status: string; kind: string; requiresCompletedTaskId?: string; executionContext?: string }[];
  nextDelivery: { orders: number; tasks: number; phaseIds: string[] };
};
const available = (done: Set<string>) => plan.phases.filter(phase => !done.has(phase.id) && phase.requiresCompletedPhases.every(id => done.has(id)));

test("Accepted design has 6000 slots, while production status still matches only pinned playable Definitions", () => {
  assert.equal(plan.totals.orders, 6000);
  assert.equal(plan.totals.tasks, 756);
  assert.equal(plan.phases.length, 36);
  assert.equal(plan.globalStages.length, 6);
  for (const area of new Set(plan.phases.map(phase => phase.areaId))) {
    assert.deepEqual(plan.phases.filter(phase => phase.areaId === area).map(phase => phase.orderCount), [80,120,160,200,220,220]);
  }
  assert.deepEqual(plan.orderSlots.filter(slot => slot.status !== "planned-no-definition").map(slot => slot.id), CHAPTER_DEFINITIONS.map(definition => definition.id));
  assert.equal(CAMPAIGN_PHASES.reduce((sum, phase) => sum + phase.orderTarget, 0), 6000);
  const firstBlock = plan.phases.filter(phase => plan.nextDelivery.phaseIds.includes(phase.id));
  assert.equal(firstBlock.reduce((sum, phase) => sum + phase.orderCount, 0), 600);
  assert.equal(firstBlock.reduce((sum, phase) => sum + phase.tasks.length, 0), 138);
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

test("Design economy finishes in 16 mixed branch/purchase orders without borrowing from locked interiors", () => {
  const firstStage2Choices = new Set<string>();
  for (let scenario = 1; scenario <= 16; scenario++) {
    let random = scenario, stars = 0, steps = 0, earned = 0, purchased = 0;
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
        if (builds < phase.tasks.length && stars >= phase.tasks[builds].cost) options.push({phase,kind:"purchase"});
      }
      assert.ok(options.length, `Design deadlock in scenario ${scenario} after ${steps} actions`);
      random = (Math.imul(random,1664525) + 1013904223) >>> 0;
      const choice = options[Math.floor(random / 4294967296 * options.length)];
      if (choice.phase.globalStage === 2 && !firstStage2) { firstStage2Choices.add(choice.phase.id); firstStage2 = true; }
      const id = choice.phase.id;
      if (choice.kind === "order") { orders.set(id,(orders.get(id) ?? 0)+1); stars++; earned++; }
      else { const index = tasks.get(id) ?? 0; stars -= choice.phase.tasks[index].cost; tasks.set(id,index+1); purchased++; }
      assert.ok(stars >= 0);
      if (orders.get(id) === choice.phase.orderCount && tasks.get(id) === choice.phase.tasks.length) done.add(id);
      assert.ok(++steps <= 6756, "Unexpected extra reward/purchase in design simulation");
    }
    assert.equal(stars,0);
    assert.equal(earned,6000);
    assert.equal(purchased,756);
  }
  assert.equal(firstStage2Choices.size,3);
});
