import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDebugCurrency, applyDebugSceneState, debugSceneHTML, debugScenePreset,
  validDebugSceneState, type DebugSceneState,
} from "../src/debug-scene";
import {
  PROJECT_IDS, nextProjectTask, phaseStatus, projectOrders, projectTasks,
  taskBalance, validCampaign,
} from "../src/campaign";
import { canonicalLevelId } from "../src/content";
import { applyMove, initial, type Definition } from "../src/engine";
import { createOrderAppearance } from "../src/order-supplies";
import {
  freshProgress, loadProgress, purchaseProjectTask, rememberHint, saveProgress, STORAGE_KEY,
  type Attempt,
} from "../src/storage";

function pinnedAttempt(projectId: string, localIndex = 0): Attempt {
  const definitions: Definition[] = JSON.parse(readFileSync(new URL(`../src/levels/projects/${projectId}.json`, import.meta.url), "utf8"));
  const definition = structuredClone(definitions[localIndex]);
  const board = initial(definition);
  return { id: `pinned-${projectId}`, definition, board, undo: [], solution: definition.verifiedSolution,
    appearance: createOrderAppearance(definition), mixCount: 0,
    hints: { exact: definition.verifiedSolution }, reward: null };
}

function reload(progress: ReturnType<typeof freshProgress>) {
  let raw = "";
  assert.equal(saveProgress({ setItem(key, value) { assert.equal(key, STORAGE_KEY); raw = value; } }, progress), true);
  const result = loadProgress({ getItem: () => raw });
  assert.equal(result.warning, undefined);
  assert.equal(result.readOnly, undefined);
  return result.progress;
}

test("Scene debug opens warehouse I immediately and completes only its required shop prerequisite", () => {
  const progress = freshProgress();
  const attempt = pinnedAttempt("shop-1", 7);
  progress.attempt = attempt;
  const result = applyDebugSceneState(progress, debugScenePreset("warehouse-1", "start"));
  assert.equal(result.ok, true);
  assert.deepEqual(result.prerequisites, ["shop-1"]);
  assert.equal(progress.selectedProject, "warehouse-1");
  assert.equal(phaseStatus("shop-1", progress.completed, progress.campaign), "complete");
  assert.equal(phaseStatus("warehouse-1", progress.completed, progress.campaign), "available");
  assert.equal(phaseStatus("shop-2", progress.completed, progress.campaign), "locked");
  assert.equal(progress.completed.filter(id => projectOrders("warehouse-1").some(order => order.id === id)).length, 0);
  assert.equal(progress.campaign.completedTasks.filter(id => projectTasks("warehouse-1").some(task => task.id === id)).length, 0);
  assert.equal(progress.attempt, null);
  assert.equal(progress.attempts["shop-1"], attempt);
  assert.equal(progress.renovations.counter, "sea");
  assert.equal(progress.renovations.sign, "sea");
  assert.equal(progress.renovation, "sea");
  assert.equal(progress.coins, 0, "scene presets emit no gameplay reward");
  assert.equal(progress.stars, 48);
  assert.equal(progress.repairKits, 32);
  const restored = reload(progress);
  assert.equal(restored.selectedProject, "warehouse-1");
  assert.deepEqual(restored.attempts["shop-1"], attempt);
});

test("Every local project preset is reloadable, has a sequential prefix, and funds all remaining works", () => {
  for (const projectId of PROJECT_IDS) for (const preset of ["start", "middle", "built", "complete"] as const) {
    const progress = freshProgress();
    const state = debugScenePreset(projectId, preset);
    assert.equal(validDebugSceneState(state), true);
    assert.equal(applyDebugSceneState(progress, state).ok, true, `${projectId}/${preset}`);
    assert.equal(validCampaign(progress.campaign), true);
    assert.deepEqual(projectTasks(projectId).filter(task => progress.campaign.completedTasks.includes(task.id)).map(task => task.id),
      projectTasks(projectId).slice(0, state.works).map(task => task.id));
    assert.deepEqual(projectOrders(projectId).filter(order => progress.completed.includes(order.id)).map(order => order.id),
      projectOrders(projectId).slice(0, state.orders).map(order => order.id));
    assert.equal(phaseStatus(projectId, progress.completed, progress.campaign), preset === "complete" ? "complete" : "available");
    assert.equal(reload(progress).selectedProject, projectId);
    let task;
    while ((task = nextProjectTask(progress.campaign, projectId))) {
      assert.ok(taskBalance(progress, task) >= task.cost, `${projectId}/${preset}/${task.id}`);
      assert.equal(purchaseProjectTask(progress, task.id), true);
    }
    assert.equal(validCampaign(progress.campaign), true);
  }
});

test("Warehouse II can be selected without playing 160 earlier orders; independent Stage 2 branches remain unchanged", () => {
  const progress = freshProgress();
  assert.equal(applyDebugSceneState(progress, { projectId: "warehouse-2", works: 3, orders: 0 }).ok, true);
  assert.equal(phaseStatus("shop-1", progress.completed, progress.campaign), "complete");
  assert.equal(phaseStatus("warehouse-1", progress.completed, progress.campaign), "complete");
  assert.equal(phaseStatus("warehouse-2", progress.completed, progress.campaign), "available");
  assert.equal(phaseStatus("shop-2", progress.completed, progress.campaign), "available");
  assert.equal(phaseStatus("fruit-yard-1", progress.completed, progress.campaign), "available");
  assert.equal(projectOrders("shop-2").filter(order => progress.completed.includes(order.id)).length, 0);
  assert.equal(projectTasks("fruit-yard-1").filter(task => progress.campaign.completedTasks.includes(task.id)).length, 0);
  assert.equal(progress.completed.length, 160);
  assert.equal(reload(progress).selectedProject, "warehouse-2");
});

test("Explicitly resetting a chosen project removes its attempt only, preserving other Definitions, hints and cosmetics", () => {
  const progress = freshProgress();
  applyDebugSceneState(progress, debugScenePreset("warehouse-2", "complete"));
  const oldActive = pinnedAttempt("warehouse-2", 9), selected = pinnedAttempt("warehouse-1", 7);
  const independent = pinnedAttempt("shop-2", 11);
  progress.selectedProject = "warehouse-2";
  progress.attempt = oldActive;
  progress.attempts = { "warehouse-1": selected, "shop-2": independent };
  progress.renovations.counter = "coral";
  const pinnedBefore = structuredClone({ oldActive, independent });
  assert.equal(applyDebugSceneState(progress, { projectId: "warehouse-1", works: 7, orders: 4 }).ok, true);
  assert.equal(progress.attempt, null);
  assert.equal(progress.attempts["warehouse-1"], undefined);
  assert.equal(progress.attempts["warehouse-2"], oldActive);
  assert.equal(progress.attempts["shop-2"], independent);
  assert.deepEqual({ oldActive, independent }, pinnedBefore);
  assert.equal(progress.renovations.counter, "coral");
  assert.deepEqual(reload(progress).attempts["warehouse-2"], oldActive);
});

test("Debug inspection of an older project preserves a bakery's sparse catalog number, exact board and paid hint", () => {
  const progress = freshProgress();
  assert.equal(applyDebugSceneState(progress, debugScenePreset("bakery-1", "built")).ok, true);
  const bakery = pinnedAttempt("bakery-1", 38);
  assert.equal(bakery.definition.number, 1119);
  const beforeMove = bakery.board;
  bakery.board = applyMove(bakery.board, ...bakery.definition.verifiedSolution[0])!;
  bakery.undo = [beforeMove];
  bakery.solution = bakery.definition.verifiedSolution.slice(1);
  bakery.hints = {};
  assert.equal(rememberHint(bakery, bakery.solution), true);
  progress.attempt = bakery;
  const pinned = structuredClone(bakery);
  assert.equal(applyDebugSceneState(progress, { projectId: "warehouse-1", works: 7, orders: 4 }).ok, true);
  assert.equal(progress.attempt, null);
  assert.deepEqual(progress.attempts["bakery-1"], pinned);
  const restored = reload(progress);
  assert.deepEqual(restored.attempts["bakery-1"], pinned);
  assert.equal(restored.attempts["bakery-1"]!.definition.number, 1119);
});

test("Scene settings retain other fields, canonicalize aliases and do not repeatedly add currency", () => {
  const progress = freshProgress();
  progress.completed = ["coastal-slice-1:tutorial:1", "morning-first"];
  progress.coins = 1950;
  progress.stars = 900;
  progress.inventory = { hint: 7, mix: 3, reserve: 2 };
  progress.settings.reducedMotion = true;
  progress.tutorialSeen = ["transfer", "tools"];
  const extra = { owned: ["optional-finish"], equipped: { counterTop: "optional-finish" } };
  Object.assign(progress, { sceneDecor: extra });
  const settings = progress.settings, inventory = progress.inventory, tutorial = progress.tutorialSeen;
  const state = { projectId: "warehouse-1", works: 0, orders: 0 } as const;
  assert.equal(applyDebugSceneState(progress, state).ok, true);
  const wallet = { stars: progress.stars, repairKits: progress.repairKits, coins: progress.coins };
  assert.equal(applyDebugSceneState(progress, state).ok, true);
  assert.deepEqual({ stars: progress.stars, repairKits: progress.repairKits, coins: progress.coins }, wallet);
  assert.equal(progress.completed.length, new Set(progress.completed.map(canonicalLevelId)).size);
  assert.equal(progress.settings, settings);
  assert.equal(progress.inventory, inventory);
  assert.equal(progress.tutorialSeen, tutorial);
  assert.equal((progress as unknown as { sceneDecor: unknown }).sceneDecor, extra);
});

test("Invalid state and unsafe currency reject atomically; adding currency alone leaves every Attempt exact", () => {
  const progress = freshProgress();
  progress.attempt = pinnedAttempt("shop-1", 5);
  const before = structuredClone(progress);
  for (const state of [
    { projectId: "unknown", works: 0, orders: 0 },
    { projectId: "shop-1", works: 15, orders: 0 },
    { projectId: "shop-1", works: 1.5, orders: 0 },
    { projectId: "warehouse-1", works: 0, orders: 81 },
    { projectId: "warehouse-1", works: 0, orders: -1 },
  ]) {
    assert.equal(applyDebugSceneState(progress, state as DebugSceneState).ok, false);
    assert.deepEqual(progress, before);
  }
  for (const amount of [NaN, Infinity, -1, 1.2, 0]) {
    assert.equal(addDebugCurrency(progress, "stars", amount), false);
    assert.deepEqual(progress, before);
  }
  progress.coins = Number.MAX_SAFE_INTEGER;
  const overflow = structuredClone(progress);
  assert.equal(addDebugCurrency(progress, "coins", 1), false);
  assert.deepEqual(progress, overflow);
  assert.equal(addDebugCurrency(progress, "stars", 17), true);
  assert.equal(progress.stars, 17);
  assert.equal(addDebugCurrency(progress, "repairKits", 9), true);
  assert.equal(progress.repairKits, 9);
  assert.deepEqual(progress.attempt, before.attempt);
  assert.deepEqual(progress.completed, before.completed);
  assert.deepEqual(progress.campaign, before.campaign);
});

test("Debug controls show all seven projects with explicit edits and separate currency grants, without query flags", () => {
  const html = debugSceneHTML(freshProgress());
  for (const id of PROJECT_IDS) assert.ok(html.includes(`value="${id}"`));
  for (const action of ["debug-scene-preset", "debug-scene-apply", "debug-scene-currency"]) assert.ok(html.includes(`data-action="${action}"`));
  assert.ok(html.includes("Текущий заказ этого этапа сбросится"));
  assert.ok(html.includes('max="80"'));
  assert.ok(!html.includes("location.search"));
});
