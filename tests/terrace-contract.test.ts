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
const checkerURL = new URL("../scripts/check-terrace-contract.mjs", import.meta.url).href;
const checker = await import(checkerURL);
const contract = checker.readTerraceContract();
const plan = JSON.parse(readFileSync(new URL("../docs/content/full-product-plan.json", import.meta.url), "utf8"));
const taskIds = contract.tasks.map((task: { id: string }) => task.id);

test("Pinned terrace production refuses changed Definitions and unversioned metadata instead of silently resealing them", () => {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  mkdirSync(new URL("../artifacts/", import.meta.url), { recursive: true });
  const fixture = mkdtempSync(`${repositoryRoot}artifacts/terrace-pin-`);
  try {
    for (const folder of ["scripts", "src", "docs/content", "src/levels"])
      mkdirSync(`${fixture}/${folder}`, { recursive: true });
    for (const file of ["scripts/produce-terrace.ts", "src/generator.ts", "src/engine.ts", "src/catalog.ts",
      "docs/content/terrace-1-contract.json", "docs/content/terrace-1-production.json", "docs/content/full-product-plan.json",
      "src/levels/stage-block.json"])
      cpSync(`${repositoryRoot}${file}`, `${fixture}/${file}`);
    cpSync(`${repositoryRoot}src/levels/projects`, `${fixture}/src/levels/projects`, { recursive: true });
    const catalog = `${fixture}/src/levels/projects/terrace-1.json`;
    const changed = JSON.parse(readFileSync(catalog, "utf8"));
    changed[0].seed = "changed-valid-seed";
    const changedRaw = JSON.stringify(changed, null, 2) + "\n";
    const manifest = readFileSync(`${fixture}/docs/content/terrace-1-production.json`, "utf8");
    writeFileSync(catalog, changedRaw);
    const run = () => spawnSync(process.execPath, ["--import", "tsx", `${fixture}/scripts/produce-terrace.ts`, "--prepare"],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 });
    const changedResult = run();
    assert.notEqual(changedResult.status, 0);
    assert.match(changedResult.stderr, /Pinned terrace source changed/);
    assert.equal(readFileSync(catalog, "utf8"), changedRaw);
    assert.equal(readFileSync(`${fixture}/docs/content/terrace-1-production.json`, "utf8"), manifest);
    unlinkSync(catalog);
    const missingResult = run();
    assert.notEqual(missingResult.status, 0);
    assert.match(missingResult.stderr, /Produced terrace Definitions are missing/);
    assert.equal(readFileSync(`${fixture}/docs/content/terrace-1-production.json`, "utf8"), manifest);
    cpSync(`${repositoryRoot}src/levels/projects/terrace-1.json`, catalog);
    const pinnedRaw = readFileSync(catalog, "utf8");
    const metadataFile = `${fixture}/src/levels/stage-block.json`;
    const changedMetadata = JSON.parse(readFileSync(metadataFile, "utf8"));
    if (changedMetadata.length === 680) changedMetadata.push(...JSON.parse(manifest).stories);
    changedMetadata[718].orderContext.requiresCompletedTaskId = "terrace-s1-t13";
    const changedMetadataRaw = JSON.stringify(changedMetadata, null, 2) + "\n";
    writeFileSync(metadataFile, changedMetadataRaw);
    const metadataResult = spawnSync(process.execPath, ["--import", "tsx", `${fixture}/scripts/produce-terrace.ts`, "--activate"],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 });
    assert.notEqual(metadataResult.status, 0);
    assert.match(metadataResult.stderr, /Do not rewrite pinned terrace metadata/);
    assert.equal(readFileSync(catalog, "utf8"), pinnedRaw);
    assert.equal(readFileSync(metadataFile, "utf8"), changedMetadataRaw);
    assert.equal(readFileSync(`${fixture}/docs/content/terrace-1-production.json`, "utf8"), manifest);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Terrace integration replays all 760 and fingerprints the unchanged seven baseline catalogs", () => {
  assert.deepEqual(checker.checkTerraceContract(), { produced: true, runtimeEnabled: true, terraceOrders: 80, terraceWorks: 26,
    repairKits: 32, stars: 48, gate: "terrace-s1-t14 after order 38", baselineOrders: 680, baselineWorks: 152,
    replayed: 760, catalogRange: [2241, 2320], denseRange: [681, 760], completeGlobalStage3: false, completeGlobalStage4: false });
  assert.equal(PROJECTS.length, 8);
  assert.equal(TASKS.length, 178);
  assert.equal(CHAPTER.length, 760);
  assert.equal(phaseStatus("terrace-1", [], freshProgress().campaign), "locked");
  assert.ok(["pr","bu","le"].every(good=>Object.hasOwn(GOODS,good)));
});

test("Construction 1–32 gives kits; equipment 33–38 and interior 39–80 give one star", () => {
  for (const number of [1, 2, 31, 32]) assert.deepEqual(checker.terraceOrderReward(contract, number),
    { coins: 60, repairKits: 1, stars: 0 });
  for (const number of [33, 35, 38, 39, 80]) assert.deepEqual(checker.terraceOrderReward(contract, number),
    { coins: 60, repairKits: 0, stars: 1 });
  for (const number of [0, -1, 81, 1.5, NaN]) assert.throws(() => checker.terraceOrderReward(contract, number), /Unknown terrace/);
  const all = Array.from({ length: 80 }, (_, index) => checker.terraceOrderReward(contract, index + 1));
  assert.equal(all.reduce((sum, reward) => sum + reward.repairKits, 0), 32);
  assert.equal(all.reduce((sum, reward) => sum + reward.stars, 0), 48);
  assert.ok(all.every(reward => reward.repairKits + reward.stars === 1));
});

test("The next terrace task requires its own currency and cannot be cross-funded", () => {
  assert.equal(checker.terraceTaskAffordable(contract, 0, { repairKits: 1, stars: 500 }), false);
  assert.equal(checker.terraceTaskAffordable(contract, 0, { repairKits: 2, stars: 0 }), true);
  assert.equal(checker.terraceTaskAffordable(contract, 11, { repairKits: 2, stars: 500 }), false);
  assert.equal(checker.terraceTaskAffordable(contract, 11, { repairKits: 3, stars: 0 }), true);
  assert.equal(checker.terraceTaskAffordable(contract, 12, { repairKits: 500, stars: 2 }), false);
  assert.equal(checker.terraceTaskAffordable(contract, 12, { repairKits: 0, stars: 3 }), true);
  assert.equal(checker.terraceTaskAffordable(contract, 26, { repairKits: 500, stars: 500 }), false);
  assert.equal(checker.terraceTaskAffordable(contract, -1, { repairKits: 500, stars: 500 }), false);
  assert.equal(checker.terraceTaskAffordable(contract, 0, { repairKits: -2, stars: 500 }), false);
});

test("A zero-wallet prefix funds all 26 works, entry at 38 and final work at 80", () => {
  const ledger = checker.terraceFundingLedger(contract);
  const bought = ledger.flatMap((row: { order: number; purchased: string[] }) => row.purchased.map(() => row.order));
  assert.deepEqual(bought, [2,4,7,10,12,14,17,20,23,26,29,32,35,38,41,44,47,50,54,58,62,65,69,73,77,80]);
  assert.equal(ledger[30].paidWorks, 11);
  assert.deepEqual(ledger[30].wallet, { coins: 1860, repairKits: 2, stars: 0 });
  assert.equal(ledger[31].paidWorks, 12);
  assert.deepEqual(ledger[31].wallet, { coins: 1920, repairKits: 0, stars: 0 });
  assert.equal(ledger[36].paidWorks, 13);
  assert.deepEqual(ledger[36].wallet, { coins: 2220, repairKits: 0, stars: 2 });
  assert.equal(ledger[37].paidWorks, 14);
  assert.deepEqual(ledger[37].purchased, ["terrace-s1-t14"]);
  assert.deepEqual(ledger[79].wallet, { coins: 4800, repairKits: 0, stars: 0 });
});

test("Order 39 waits for the paid guest seating even when all38 preceding rewards were earned", () => {
  assert.equal(checker.terraceOrderAllowed(contract, 38, 37, taskIds.slice(0, 13)), true);
  assert.equal(checker.terraceOrderAllowed(contract, 39, 37, taskIds.slice(0, 14)), false);
  assert.equal(checker.terraceOrderAllowed(contract, 39, 38, taskIds.slice(0, 13)), false);
  assert.equal(checker.terraceOrderAllowed(contract, 39, 38, taskIds.slice(0, 14)), true);
  assert.equal(checker.terraceOrderAllowed(contract, 39, 38, ["terrace-s1-t13"]), false);
  assert.equal(checker.terraceOrderAllowed(contract, 40, 38, taskIds.slice(0, 14)), false);
  assert.equal(checker.terraceOrderAllowed(contract, 80, 79, taskIds), true);
  assert.equal(checker.terraceOrderAllowed(contract, 81, 80, taskIds), false);
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 718).map(story => story.id);
  p.campaign.completedTasks = TASKS.filter(task => task.phaseId !== "terrace-1").map(task => task.id).concat(taskIds.slice(0, 13));
  p.stars = 3;
  assert.equal(nextProjectOrder("terrace-1", p.completed, p.campaign), null);
  assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, 719, "terrace-1"), false);
  assert.equal(selectProject(p, "terrace-1"), true);
  assert.equal(purchaseProjectTask(p, "terrace-s1-t14"), true);
  assert.equal(p.stars, 0);
  assert.equal(nextProjectOrder("terrace-1", p.completed, p.campaign), 719);
  assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, 719, "terrace-1"), true);
  assert.equal(p.campaign.completedTasks.includes("terrace-s1-t14"), true);
});

test("One physical deck keeps26 stable tasks and its frozen80 Definition source", () => {
  assert.deepEqual(taskIds, Array.from({length:26},(_,i)=>`terrace-s1-t${String(i+1).padStart(2,"0")}`));
  assert.ok(contract.tasks.every((task:any)=>task.view==="terrace-deck"));
  const manifest=JSON.parse(readFileSync(new URL("../docs/content/terrace-1-production.json",import.meta.url),"utf8"));
  assert.equal(manifest.sourceFileDigest,"68f28e86c6c0c7b225233512ecfa54468cec475163155a153d0ded087c318a34");
  assert.equal(manifest.definitionDigest,"797d0927105db63104ac1722ec8a0ac76c66e830941a83d8c232b01b2f2d87c5");
});

test("Catalog 2241–2320 loads through real dense indices 681–760 without rewriting Definition.number", async () => {
  const first = checker.terraceOrderNumbers(contract, 1), last = checker.terraceOrderNumbers(contract, 80);
  assert.deepEqual(first, { localNumber: 1, id: "terrace-s1-order-001", catalogNumber: 2241, denseNumber: 681 });
  assert.deepEqual(last, { localNumber: 80, id: "terrace-s1-order-080", catalogNumber: 2320, denseNumber: 760 });
  const numbers = Array.from({ length: 80 }, (_, i) => checker.terraceOrderNumbers(contract, i + 1));
  assert.equal(new Set(numbers.map(entry => entry.id)).size, 80);
  assert.ok(numbers.every(entry => entry.catalogNumber - entry.denseNumber === 1560));
  assert.equal(CHAPTER[680].id, first.id);
  assert.equal(CHAPTER[759].id, last.id);
  assert.equal(CHAPTER[2240], undefined);
  assert.equal(chapterNumber(first.id), 681);
  assert.equal(chapterNumber(last.id), 760);
  const loader = createChapterLoader({ "terrace-1": async () => offlineProjectDefinitions("terrace-1") });
  for (const entry of numbers) {
    const definition = await loader.load(entry.denseNumber);
    assert.equal(definition.id, entry.id);
    assert.equal(definition.number, entry.catalogNumber);
    assert.deepEqual(definition, offlineChapterLevel(entry.denseNumber));
    assert.equal(orderCurrency(entry.id), entry.localNumber <= 32 ? "repairKits" : "stars");
  }
  await assert.rejects(loader.load(761), /Unknown chapter/);
  assert.equal(currentGlobalStage(CHAPTER.map(story => story.id), { ...freshProgress().campaign, completedTasks: TASKS.map(task => task.id) }), 3);
  for (const id of ["shop-3", "warehouse-3", "fruit-yard-3", "terrace-2", "restaurant-1"])
    assert.equal(phaseStatus(id, CHAPTER.map(story => story.id), { ...freshProgress().campaign, completedTasks: TASKS.map(task => task.id) }), "planned");
});

test("Production validation rejects lost readiness, wrong currency, price, numbering or entry gate", () => {
  const rejected = [
    (changed: any) => { changed.phases.find((p: any) => p.id === "terrace-1").tasks[0].currency = "stars"; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "terrace-1").tasks[0].cost = 3; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "terrace-1").tasks[0].status = "planned"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "terrace-s1-order-032").rewardCurrency = "stars"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "terrace-s1-order-001").status = "planned-no-definition"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "terrace-s1-order-001").denseNumber = 1081; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "terrace-s1-order-039").requiresCompletedTaskId = "terrace-s1-t13"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "terrace-s1-order-039").requiresCompletedTaskId = "terrace-s1-t20"; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "terrace-1").tasks.reverse(); },
  ];
  for (const corrupt of rejected) {
    const changed = structuredClone(plan);
    corrupt(changed);
    assert.throws(() => checker.validateTerracePlan(contract, changed));
  }
});

test("The 80 actual terrace wins finance exactly its 26 purchases from empty wallets", () => {
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 680).map(story => story.id);
  p.campaign.completedTasks = TASKS.filter(task => task.phaseId !== "terrace-1").map(task => task.id);
  assert.equal(selectProject(p, "terrace-1"), true);
  let wins = 0, purchases = 0;
  while (phaseStatus("terrace-1", p.completed, p.campaign) !== "complete") {
    const task = nextProjectTask(p.campaign, "terrace-1");
    if (task && taskBalance(p, task) >= task.cost) {
      assert.equal(purchaseProjectTask(p, task.id), true);
      assert.equal(purchaseProjectTask(p, task.id), false);
      purchases++;
      continue;
    }
    const number = nextProjectOrder("terrace-1", p.completed, p.campaign);
    assert.ok(number, `Terrace deadlock after ${wins} wins / ${purchases} works`);
    const definition = offlineChapterLevel(number);
    let board = initial(definition);
    for (const move of definition.verifiedSolution) board = applyMove(board, ...move)!;
    p.attempt = { id: definition.id, definition, appearance: createOrderAppearance(definition), board,
      undo: [], solution: [], mixCount: 0, hints: {}, reward: null };
    assert.deepEqual(completeAttempt(p, "2026-10-09"), { ...checker.terraceOrderReward(contract, ++wins), fresh: true });
    assert.deepEqual(completeAttempt(p, "2026-10-09"), p.attempt.reward);
    assert.ok(p.stars >= 0 && p.repairKits >= 0);
    assert.ok(wins <= 80 && purchases <= 26);
  }
  assert.equal(wins, 80); assert.equal(purchases, 26);
  assert.equal(p.coins, 4800); assert.equal(p.stars, 0); assert.equal(p.repairKits, 0);
  assert.equal(currentGlobalStage(p.completed, p.campaign), 3);
});
