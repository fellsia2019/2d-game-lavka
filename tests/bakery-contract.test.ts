import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CHAPTER, chapterNumber, createChapterLoader } from "../src/content";
import { offlineChapterLevel, offlineProjectDefinitions } from "../src/content-offline";
import { PROJECTS, TASKS, currentGlobalStage, phaseStatus, isProjectOrderUnlocked, nextProjectOrder,
  nextProjectTask, taskBalance, orderCurrency } from "../src/campaign";
import { freshProgress, selectProject, completeAttempt, purchaseProjectTask } from "../src/storage";
import { GOODS } from "../src/catalog";
import { applyMove, initial } from "../src/engine";
import { createOrderAppearance } from "../src/order-supplies";

// The independently runnable integration checker uses the same pinned production.
const checkerURL = new URL("../scripts/check-bakery-contract.mjs", import.meta.url).href;
const checker = await import(checkerURL);
const contract = checker.readBakeryContract();
const plan = JSON.parse(readFileSync(new URL("../docs/content/full-product-plan.json", import.meta.url), "utf8"));
const taskIds = contract.tasks.map((task: { id: string }) => task.id);
const bakeryPrerequisites = ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"];
const prerequisiteTaskIds = TASKS.filter(task => bakeryPrerequisites.includes(task.phaseId)).map(task => task.id);

test("Pinned bakery production refuses changed Definitions and unversioned metadata instead of silently resealing them", () => {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  mkdirSync(new URL("../artifacts/", import.meta.url), { recursive: true });
  const fixture = mkdtempSync(`${repositoryRoot}artifacts/bakery-pin-`);
  try {
    for (const folder of ["scripts", "src", "docs/content", "src/levels"])
      mkdirSync(`${fixture}/${folder}`, { recursive: true });
    for (const file of ["scripts/produce-bakery.ts", "src/generator.ts", "src/engine.ts", "src/catalog.ts",
      "docs/content/bakery-1-contract.json", "docs/content/bakery-1-production.json", "docs/content/full-product-plan.json",
      "src/levels/stage-block.json"])
      cpSync(`${repositoryRoot}${file}`, `${fixture}/${file}`);
    cpSync(`${repositoryRoot}src/levels/projects`, `${fixture}/src/levels/projects`, { recursive: true });
    const catalog = `${fixture}/src/levels/projects/bakery-1.json`;
    const changed = JSON.parse(readFileSync(catalog, "utf8"));
    changed[0].seed = "changed-valid-seed";
    const changedRaw = JSON.stringify(changed, null, 2) + "\n";
    const manifest = readFileSync(`${fixture}/docs/content/bakery-1-production.json`, "utf8");
    writeFileSync(catalog, changedRaw);
    const run = () => spawnSync(process.execPath, ["--import", "tsx", `${fixture}/scripts/produce-bakery.ts`, "--prepare"],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 });
    const changedResult = run();
    assert.notEqual(changedResult.status, 0);
    assert.match(changedResult.stderr, /Pinned bakery source changed/);
    assert.equal(readFileSync(catalog, "utf8"), changedRaw);
    assert.equal(readFileSync(`${fixture}/docs/content/bakery-1-production.json`, "utf8"), manifest);
    unlinkSync(catalog);
    const missingResult = run();
    assert.notEqual(missingResult.status, 0);
    assert.match(missingResult.stderr, /Produced bakery Definitions are missing/);
    assert.equal(readFileSync(`${fixture}/docs/content/bakery-1-production.json`, "utf8"), manifest);
    cpSync(`${repositoryRoot}src/levels/projects/bakery-1.json`, catalog);
    const pinnedRaw = readFileSync(catalog, "utf8");
    const metadataFile = `${fixture}/src/levels/stage-block.json`;
    const changedMetadata = JSON.parse(readFileSync(metadataFile, "utf8"));
    changedMetadata[638].orderContext.requiresCompletedTaskId = "bakery-s1-t13";
    const changedMetadataRaw = JSON.stringify(changedMetadata, null, 2) + "\n";
    writeFileSync(metadataFile, changedMetadataRaw);
    const metadataResult = spawnSync(process.execPath, ["--import", "tsx", `${fixture}/scripts/produce-bakery.ts`, "--activate"],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 });
    assert.notEqual(metadataResult.status, 0);
    assert.match(metadataResult.stderr, /outside the explicitly versioned revision/);
    assert.equal(readFileSync(catalog, "utf8"), pinnedRaw);
    assert.equal(readFileSync(metadataFile, "utf8"), changedMetadataRaw);
    assert.equal(readFileSync(`${fixture}/docs/content/bakery-1-production.json`, "utf8"), manifest);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Bakery integration replays all 760 and fingerprints the unchanged six baseline catalogs", () => {
  assert.deepEqual(checker.checkBakeryContract(), { planning: false, produced: true, runtimeEnabled: true, bakeryOrders: 80, bakeryWorks: 26,
    repairKits: 32, stars: 48, gate: "bakery-s1-t20 after order 38", baselineOrders: 600, baselineWorks: 126,
    replayed: 760, catalogRange: [1081, 1160], denseRange: [601, 680], completeGlobalStage3: false });
  assert.equal(PROJECTS.length, 8);
  assert.equal(TASKS.length, 178);
  assert.equal(CHAPTER.length, 760);
  assert.equal(phaseStatus("bakery-1", [], freshProgress().campaign), "locked");
  assert.ok(Object.hasOwn(GOODS, "bg") && Object.hasOwn(GOODS, "cr"));
});

test("Construction 1–32 gives kits; equipment 33–38 and interior 39–80 give one star", () => {
  for (const number of [1, 2, 31, 32]) assert.deepEqual(checker.bakeryOrderReward(contract, number),
    { coins: 60, repairKits: 1, stars: 0 });
  for (const number of [33, 35, 38, 39, 80]) assert.deepEqual(checker.bakeryOrderReward(contract, number),
    { coins: 60, repairKits: 0, stars: 1 });
  for (const number of [0, -1, 81, 1.5, NaN]) assert.throws(() => checker.bakeryOrderReward(contract, number), /Unknown bakery/);
  const all = Array.from({ length: 80 }, (_, index) => checker.bakeryOrderReward(contract, index + 1));
  assert.equal(all.reduce((sum, reward) => sum + reward.repairKits, 0), 32);
  assert.equal(all.reduce((sum, reward) => sum + reward.stars, 0), 48);
  assert.ok(all.every(reward => reward.repairKits + reward.stars === 1));
});

test("The next bakery task requires its own currency and cannot be cross-funded", () => {
  assert.equal(checker.bakeryTaskAffordable(contract, 0, { repairKits: 1, stars: 500 }), false);
  assert.equal(checker.bakeryTaskAffordable(contract, 0, { repairKits: 2, stars: 0 }), true);
  assert.equal(checker.bakeryTaskAffordable(contract, 11, { repairKits: 2, stars: 500 }), false);
  assert.equal(checker.bakeryTaskAffordable(contract, 11, { repairKits: 3, stars: 0 }), true);
  assert.equal(checker.bakeryTaskAffordable(contract, 12, { repairKits: 500, stars: 2 }), false);
  assert.equal(checker.bakeryTaskAffordable(contract, 12, { repairKits: 0, stars: 3 }), true);
  assert.equal(checker.bakeryTaskAffordable(contract, 26, { repairKits: 500, stars: 500 }), false);
  assert.equal(checker.bakeryTaskAffordable(contract, -1, { repairKits: 500, stars: 500 }), false);
  assert.equal(checker.bakeryTaskAffordable(contract, 0, { repairKits: -2, stars: 500 }), false);
});

test("A zero-wallet prefix funds all 26 works, entry at 38 and final work at 80", () => {
  const ledger = checker.bakeryFundingLedger(contract);
  const bought = ledger.flatMap((row: { order: number; purchased: string[] }) => row.purchased.map(() => row.order));
  assert.deepEqual(bought, [2,4,7,10,12,14,17,20,23,26,29,32,35,38,41,44,47,50,54,58,62,65,69,73,77,80]);
  assert.equal(ledger[30].paidWorks, 11);
  assert.deepEqual(ledger[30].wallet, { coins: 1860, repairKits: 2, stars: 0 });
  assert.equal(ledger[31].paidWorks, 12);
  assert.deepEqual(ledger[31].wallet, { coins: 1920, repairKits: 0, stars: 0 });
  assert.equal(ledger[36].paidWorks, 13);
  assert.deepEqual(ledger[36].wallet, { coins: 2220, repairKits: 0, stars: 2 });
  assert.equal(ledger[37].paidWorks, 14);
  assert.deepEqual(ledger[37].purchased, ["bakery-s1-t20"]);
  assert.deepEqual(ledger[79].wallet, { coins: 4800, repairKits: 0, stars: 0 });
});

test("Order 39 waits for the entrance counter and trays, then opens before any kitchen equipment is owned", () => {
  assert.equal(checker.bakeryOrderAllowed(contract, 38, 37, taskIds.slice(0, 13)), true);
  assert.equal(checker.bakeryOrderAllowed(contract, 39, 37, taskIds.slice(0, 14)), false);
  assert.equal(checker.bakeryOrderAllowed(contract, 39, 38, taskIds.slice(0, 13)), false);
  assert.equal(checker.bakeryOrderAllowed(contract, 39, 38, taskIds.slice(0, 14)), true);
  assert.equal(checker.bakeryOrderAllowed(contract, 39, 38, ["bakery-s1-t14"]), false);
  assert.equal(checker.bakeryOrderAllowed(contract, 40, 38, taskIds.slice(0, 14)), false);
  assert.equal(checker.bakeryOrderAllowed(contract, 80, 79, taskIds), true);
  assert.equal(checker.bakeryOrderAllowed(contract, 81, 80, taskIds), false);
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 638).map(story => story.id);
  p.campaign.completedTasks = prerequisiteTaskIds.concat(taskIds.slice(0, 13));
  p.stars = 3;
  assert.equal(nextProjectOrder("bakery-1", p.completed, p.campaign), null);
  assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, 639, "bakery-1"), false);
  assert.equal(selectProject(p, "bakery-1"), true);
  assert.equal(purchaseProjectTask(p, "bakery-s1-t20"), true);
  assert.equal(p.stars, 0);
  assert.equal(nextProjectOrder("bakery-1", p.completed, p.campaign), 639);
  assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, 639, "bakery-1"), true);
  assert.equal(p.campaign.completedTasks.includes("bakery-s1-t13"), false);
  assert.equal(p.campaign.completedTasks.includes("bakery-s1-t14"), false);
});

test("Stable object IDs furnish the entrance hall first, keep the positional prices, and preserve all pinned Definitions", () => {
  const bakery = plan.phases.find((phase: any) => phase.id === "bakery-1");
  const expected = [...Array.from({ length: 12 }, (_, n) => n + 1),19,20,21,22,23,24,25,13,14,15,16,17,18,26]
    .map(n => `bakery-s1-t${String(n).padStart(2, "0")}`);
  assert.deepEqual(taskIds, expected);
  assert.deepEqual(TASKS.filter(task => task.phaseId === "bakery-1").map(task => task.id), expected);
  assert.deepEqual(bakery.tasks.map((task: any) => task.cost), [2,2,3,3,2,2,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,3,4,4,4,3]);
  assert.ok(contract.tasks.slice(10, 19).every((task: any) => task.view === "bakery-shop"));
  assert.ok(contract.tasks.slice(19, 25).every((task: any) => task.view === "bakery-oven"));
  assert.equal(contract.tasks[25].view, "bakery-shop");
  const manifest = JSON.parse(readFileSync(new URL("../docs/content/bakery-1-production.json", import.meta.url), "utf8"));
  assert.equal(manifest.sourceFileDigest, "6b631612960a4aece3007f04c7ee28455cddc05fd714b0fff69e4d112ca7fbad");
  assert.equal(manifest.definitionDigest, "5b82c014ca5659d8afcb407d5ad34f3568ef16bbc52d108fe302be718b2ac42c");
});

test("Catalog 1081–1160 loads through real dense indices 601–680 without rewriting Definition.number", async () => {
  const first = checker.bakeryOrderNumbers(contract, 1), last = checker.bakeryOrderNumbers(contract, 80);
  assert.deepEqual(first, { localNumber: 1, id: "bakery-s1-order-001", catalogNumber: 1081, denseNumber: 601 });
  assert.deepEqual(last, { localNumber: 80, id: "bakery-s1-order-080", catalogNumber: 1160, denseNumber: 680 });
  const numbers = Array.from({ length: 80 }, (_, i) => checker.bakeryOrderNumbers(contract, i + 1));
  assert.equal(new Set(numbers.map(entry => entry.id)).size, 80);
  assert.ok(numbers.every(entry => entry.catalogNumber - entry.denseNumber === 480));
  assert.equal(CHAPTER[600].id, first.id);
  assert.equal(CHAPTER[679].id, last.id);
  assert.equal(CHAPTER[1080], undefined);
  assert.equal(chapterNumber(first.id), 601);
  assert.equal(chapterNumber(last.id), 680);
  const loader = createChapterLoader({ "bakery-1": async () => offlineProjectDefinitions("bakery-1") });
  for (const entry of numbers) {
    const definition = await loader.load(entry.denseNumber);
    assert.equal(definition.id, entry.id);
    assert.equal(definition.number, entry.catalogNumber);
    assert.deepEqual(definition, offlineChapterLevel(entry.denseNumber));
    assert.equal(orderCurrency(entry.id), entry.localNumber <= 32 ? "repairKits" : "stars");
  }
  await assert.rejects(loader.load(761), /Unknown chapter/);
  assert.equal(currentGlobalStage(CHAPTER.map(story => story.id), { ...freshProgress().campaign, completedTasks: TASKS.map(task => task.id) }), 3);
  for (const id of ["shop-3", "warehouse-3", "fruit-yard-3", "bakery-2", "bakery-3", "terrace-2"])
    assert.equal(phaseStatus(id, CHAPTER.map(story => story.id), { ...freshProgress().campaign, completedTasks: TASKS.map(task => task.id) }), "planned");
});

test("Production validation rejects lost readiness, wrong currency, price, numbering or entry gate", () => {
  const rejected = [
    (changed: any) => { changed.phases.find((p: any) => p.id === "bakery-1").tasks[0].currency = "stars"; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "bakery-1").tasks[0].cost = 3; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "bakery-1").tasks[0].status = "planned"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "bakery-s1-order-032").rewardCurrency = "stars"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "bakery-s1-order-001").status = "planned-no-definition"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "bakery-s1-order-001").denseNumber = 1081; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "bakery-s1-order-039").requiresCompletedTaskId = "bakery-s1-t13"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "bakery-s1-order-039").requiresCompletedTaskId = "bakery-s1-t14"; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "bakery-1").tasks.reverse(); },
  ];
  for (const corrupt of rejected) {
    const changed = structuredClone(plan);
    corrupt(changed);
    assert.throws(() => checker.validateBakeryPlan(contract, changed));
  }
});

test("The 80 actual bakery wins finance exactly its 26 purchases from empty wallets", () => {
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 600).map(story => story.id);
  p.campaign.completedTasks = [...prerequisiteTaskIds];
  assert.equal(selectProject(p, "bakery-1"), true);
  let wins = 0, purchases = 0;
  while (phaseStatus("bakery-1", p.completed, p.campaign) !== "complete") {
    const task = nextProjectTask(p.campaign, "bakery-1");
    if (task && taskBalance(p, task) >= task.cost) {
      assert.equal(purchaseProjectTask(p, task.id), true);
      assert.equal(purchaseProjectTask(p, task.id), false);
      purchases++;
      continue;
    }
    const number = nextProjectOrder("bakery-1", p.completed, p.campaign);
    assert.ok(number, `Bakery deadlock after ${wins} wins / ${purchases} works`);
    const definition = offlineChapterLevel(number);
    let board = initial(definition);
    for (const move of definition.verifiedSolution) board = applyMove(board, ...move)!;
    p.attempt = { id: definition.id, definition, appearance: createOrderAppearance(definition), board,
      undo: [], solution: [], mixCount: 0, hints: {}, reward: null };
    assert.deepEqual(completeAttempt(p, "2026-10-09"), { ...checker.bakeryOrderReward(contract, ++wins), fresh: true });
    assert.deepEqual(completeAttempt(p, "2026-10-09"), p.attempt.reward);
    assert.ok(p.stars >= 0 && p.repairKits >= 0);
    assert.ok(wins <= 80 && purchases <= 26);
  }
  assert.equal(wins, 80); assert.equal(purchases, 26);
  assert.equal(p.coins, 4800); assert.equal(p.stars, 0); assert.equal(p.repairKits, 0);
  assert.equal(currentGlobalStage(p.completed, p.campaign), 3);
});
