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
const checkerURL = new URL("../scripts/check-restaurant-contract.mjs", import.meta.url).href;
const checker = await import(checkerURL);
const contract = checker.readRestaurantContract();
const plan = JSON.parse(readFileSync(new URL("../docs/content/full-product-plan.json", import.meta.url), "utf8"));
const taskIds = contract.tasks.map((task: { id: string }) => task.id);

test("Pinned restaurant production refuses changed Definitions and unversioned metadata instead of silently resealing them", () => {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  mkdirSync(new URL("../artifacts/", import.meta.url), { recursive: true });
  const fixture = mkdtempSync(`${repositoryRoot}artifacts/restaurant-pin-`);
  try {
    for (const folder of ["scripts", "src", "docs/content", "src/levels"])
      mkdirSync(`${fixture}/${folder}`, { recursive: true });
    for (const file of ["scripts/produce-restaurant.ts", "src/generator.ts", "src/engine.ts", "src/catalog.ts",
      "docs/content/restaurant-1-contract.json", "docs/content/restaurant-1-production.json", "docs/content/full-product-plan.json",
      "src/levels/stage-block.json"])
      cpSync(`${repositoryRoot}${file}`, `${fixture}/${file}`);
    cpSync(`${repositoryRoot}src/levels/projects`, `${fixture}/src/levels/projects`, { recursive: true });
    const catalog = `${fixture}/src/levels/projects/restaurant-1.json`;
    const changed = JSON.parse(readFileSync(catalog, "utf8"));
    changed[0].seed = "changed-valid-seed";
    const changedRaw = JSON.stringify(changed, null, 2) + "\n";
    const manifest = readFileSync(`${fixture}/docs/content/restaurant-1-production.json`, "utf8");
    writeFileSync(catalog, changedRaw);
    const run = () => spawnSync(process.execPath, ["--import", "tsx", `${fixture}/scripts/produce-restaurant.ts`, "--prepare"],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 });
    const changedResult = run();
    assert.notEqual(changedResult.status, 0);
    assert.match(changedResult.stderr, /Pinned restaurant source changed/);
    assert.equal(readFileSync(catalog, "utf8"), changedRaw);
    assert.equal(readFileSync(`${fixture}/docs/content/restaurant-1-production.json`, "utf8"), manifest);
    unlinkSync(catalog);
    const missingResult = run();
    assert.notEqual(missingResult.status, 0);
    assert.match(missingResult.stderr, /Produced restaurant Definitions are missing/);
    assert.equal(readFileSync(`${fixture}/docs/content/restaurant-1-production.json`, "utf8"), manifest);
    cpSync(`${repositoryRoot}src/levels/projects/restaurant-1.json`, catalog);
    const pinnedRaw = readFileSync(catalog, "utf8");
    const metadataFile = `${fixture}/src/levels/stage-block.json`;
    const changedMetadata = JSON.parse(readFileSync(metadataFile, "utf8"));
    if (changedMetadata.length === 760) changedMetadata.push(...JSON.parse(manifest).stories);
    changedMetadata[798].orderContext.requiresCompletedTaskId = "restaurant-s1-t13";
    const changedMetadataRaw = JSON.stringify(changedMetadata, null, 2) + "\n";
    writeFileSync(metadataFile, changedMetadataRaw);
    const metadataResult = spawnSync(process.execPath, ["--import", "tsx", `${fixture}/scripts/produce-restaurant.ts`, "--activate"],
      { cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 });
    assert.notEqual(metadataResult.status, 0);
    assert.match(metadataResult.stderr, /Do not rewrite pinned restaurant metadata/);
    assert.equal(readFileSync(catalog, "utf8"), pinnedRaw);
    assert.equal(readFileSync(metadataFile, "utf8"), changedMetadataRaw);
    assert.equal(readFileSync(`${fixture}/docs/content/restaurant-1-production.json`, "utf8"), manifest);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Restaurant integration replays all 840 and fingerprints the unchanged eight baseline catalogs", () => {
  assert.deepEqual(checker.checkRestaurantContract(), { produced: true, runtimeEnabled: true, restaurantOrders: 80, restaurantWorks: 26,
    repairKits: 32, stars: 48, gate: "restaurant-s1-t14 after order 38", baselineOrders: 760, baselineWorks: 178,
    replayed: 840, catalogRange: [3901, 3980], denseRange: [761, 840], completeGlobalStage3: false, completeGlobalStage4: false, completeGlobalStage5: false });
  assert.equal(PROJECTS.length, 9);
  assert.equal(TASKS.length, 204);
  assert.equal(CHAPTER.length, 840);
  assert.equal(phaseStatus("restaurant-1", [], freshProgress().campaign), "locked");
  assert.ok(["cu","so"].every(good=>Object.hasOwn(GOODS,good)));
});

test("Construction 1–32 gives kits; equipment 33–38 and interior 39–80 give one star", () => {
  for (const number of [1, 2, 31, 32]) assert.deepEqual(checker.restaurantOrderReward(contract, number),
    { coins: 60, repairKits: 1, stars: 0 });
  for (const number of [33, 35, 38, 39, 80]) assert.deepEqual(checker.restaurantOrderReward(contract, number),
    { coins: 60, repairKits: 0, stars: 1 });
  for (const number of [0, -1, 81, 1.5, NaN]) assert.throws(() => checker.restaurantOrderReward(contract, number), /Unknown restaurant/);
  const all = Array.from({ length: 80 }, (_, index) => checker.restaurantOrderReward(contract, index + 1));
  assert.equal(all.reduce((sum, reward) => sum + reward.repairKits, 0), 32);
  assert.equal(all.reduce((sum, reward) => sum + reward.stars, 0), 48);
  assert.ok(all.every(reward => reward.repairKits + reward.stars === 1));
});

test("The next restaurant task requires its own currency and cannot be cross-funded", () => {
  assert.equal(checker.restaurantTaskAffordable(contract, 0, { repairKits: 1, stars: 500 }), false);
  assert.equal(checker.restaurantTaskAffordable(contract, 0, { repairKits: 2, stars: 0 }), true);
  assert.equal(checker.restaurantTaskAffordable(contract, 11, { repairKits: 2, stars: 500 }), false);
  assert.equal(checker.restaurantTaskAffordable(contract, 11, { repairKits: 3, stars: 0 }), true);
  assert.equal(checker.restaurantTaskAffordable(contract, 12, { repairKits: 500, stars: 2 }), false);
  assert.equal(checker.restaurantTaskAffordable(contract, 12, { repairKits: 0, stars: 3 }), true);
  assert.equal(checker.restaurantTaskAffordable(contract, 26, { repairKits: 500, stars: 500 }), false);
  assert.equal(checker.restaurantTaskAffordable(contract, -1, { repairKits: 500, stars: 500 }), false);
  assert.equal(checker.restaurantTaskAffordable(contract, 0, { repairKits: -2, stars: 500 }), false);
});

test("A zero-wallet prefix funds all 26 works, entry at 38 and final work at 80", () => {
  const ledger = checker.restaurantFundingLedger(contract);
  const bought = ledger.flatMap((row: { order: number; purchased: string[] }) => row.purchased.map(() => row.order));
  assert.deepEqual(bought, [2,4,7,10,12,14,17,20,23,26,29,32,35,38,41,44,47,50,54,58,62,65,69,73,77,80]);
  assert.equal(ledger[30].paidWorks, 11);
  assert.deepEqual(ledger[30].wallet, { coins: 1860, repairKits: 2, stars: 0 });
  assert.equal(ledger[31].paidWorks, 12);
  assert.deepEqual(ledger[31].wallet, { coins: 1920, repairKits: 0, stars: 0 });
  assert.equal(ledger[36].paidWorks, 13);
  assert.deepEqual(ledger[36].wallet, { coins: 2220, repairKits: 0, stars: 2 });
  assert.equal(ledger[37].paidWorks, 14);
  assert.deepEqual(ledger[37].purchased, ["restaurant-s1-t14"]);
  assert.deepEqual(ledger[79].wallet, { coins: 4800, repairKits: 0, stars: 0 });
});

test("Order 39 waits for the paid guest seating even when all38 preceding rewards were earned", () => {
  assert.equal(checker.restaurantOrderAllowed(contract, 38, 37, taskIds.slice(0, 13)), true);
  assert.equal(checker.restaurantOrderAllowed(contract, 39, 37, taskIds.slice(0, 14)), false);
  assert.equal(checker.restaurantOrderAllowed(contract, 39, 38, taskIds.slice(0, 13)), false);
  assert.equal(checker.restaurantOrderAllowed(contract, 39, 38, taskIds.slice(0, 14)), true);
  assert.equal(checker.restaurantOrderAllowed(contract, 39, 38, ["restaurant-s1-t13"]), false);
  assert.equal(checker.restaurantOrderAllowed(contract, 40, 38, taskIds.slice(0, 14)), false);
  assert.equal(checker.restaurantOrderAllowed(contract, 80, 79, taskIds), true);
  assert.equal(checker.restaurantOrderAllowed(contract, 81, 80, taskIds), false);
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 798).map(story => story.id);
  p.campaign.completedTasks = TASKS.filter(task => task.phaseId !== "restaurant-1").map(task => task.id).concat(taskIds.slice(0, 13));
  p.stars = 3;
  assert.equal(nextProjectOrder("restaurant-1", p.completed, p.campaign), null);
  assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, 799, "restaurant-1"), false);
  assert.equal(selectProject(p, "restaurant-1"), true);
  assert.equal(purchaseProjectTask(p, "restaurant-s1-t14"), true);
  assert.equal(p.stars, 0);
  assert.equal(nextProjectOrder("restaurant-1", p.completed, p.campaign), 799);
  assert.equal(isProjectOrderUnlocked(p.completed, p.campaign, 799, "restaurant-1"), true);
  assert.equal(p.campaign.completedTasks.includes("restaurant-s1-t14"), true);
});

test("One physical upper floor keeps26 stable tasks and its frozen80 Definition source", () => {
  assert.deepEqual(taskIds, Array.from({length:26},(_,i)=>`restaurant-s1-t${String(i+1).padStart(2,"0")}`));
  assert.deepEqual(contract.rooms.map((room:any)=>room.id),["restaurant-yard","restaurant-hall","restaurant-kitchen"]);
  assert.equal(contract.tasks[11].view,"restaurant-hall");
  assert.ok(contract.tasks.filter((task:any)=>[15,16,17,18,22,23,24].includes(task.index)).every((task:any)=>task.view==="restaurant-kitchen"));
  const manifest=JSON.parse(readFileSync(new URL("../docs/content/restaurant-1-production.json",import.meta.url),"utf8"));
  assert.equal(manifest.sourceFileDigest,"2a9edc3cce1de6005aecb3b14c1e7621d8532f58ea2ee17880c1c50746d4798a");
  assert.equal(manifest.definitionDigest,"7c0422c8b054c5dfc89a89110bc073334ea409cebd006a9d07e205437c707152");
});

test("Catalog 3901–3980 loads through real dense indices 761–840 without rewriting Definition.number", async () => {
  const first = checker.restaurantOrderNumbers(contract, 1), last = checker.restaurantOrderNumbers(contract, 80);
  assert.deepEqual(first, { localNumber: 1, id: "restaurant-s1-order-001", catalogNumber: 3901, denseNumber: 761 });
  assert.deepEqual(last, { localNumber: 80, id: "restaurant-s1-order-080", catalogNumber: 3980, denseNumber: 840 });
  const numbers = Array.from({ length: 80 }, (_, i) => checker.restaurantOrderNumbers(contract, i + 1));
  assert.equal(new Set(numbers.map(entry => entry.id)).size, 80);
  assert.ok(numbers.every(entry => entry.catalogNumber - entry.denseNumber === 3140));
  assert.equal(CHAPTER[760].id, first.id);
  assert.equal(CHAPTER[839].id, last.id);
  assert.equal(CHAPTER[3900], undefined);
  assert.equal(chapterNumber(first.id), 761);
  assert.equal(chapterNumber(last.id), 840);
  const loader = createChapterLoader({ "restaurant-1": async () => offlineProjectDefinitions("restaurant-1") });
  for (const entry of numbers) {
    const definition = await loader.load(entry.denseNumber);
    assert.equal(definition.id, entry.id);
    assert.equal(definition.number, entry.catalogNumber);
    assert.deepEqual(definition, offlineChapterLevel(entry.denseNumber));
    assert.equal(orderCurrency(entry.id), entry.localNumber <= 32 ? "repairKits" : "stars");
  }
  await assert.rejects(loader.load(841), /Unknown chapter/);
  assert.equal(currentGlobalStage(CHAPTER.map(story => story.id), { ...freshProgress().campaign, completedTasks: TASKS.map(task => task.id) }), 3);
  for (const id of ["shop-3", "warehouse-3", "fruit-yard-3", "restaurant-2", "restaurant-2"])
    assert.equal(phaseStatus(id, CHAPTER.map(story => story.id), { ...freshProgress().campaign, completedTasks: TASKS.map(task => task.id) }), "planned");
});

test("Production validation rejects lost readiness, wrong currency, price, numbering or entry gate", () => {
  const rejected = [
    (changed: any) => { changed.phases.find((p: any) => p.id === "restaurant-1").tasks[0].currency = "stars"; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "restaurant-1").tasks[0].cost = 3; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "restaurant-1").tasks[0].status = "planned"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "restaurant-s1-order-032").rewardCurrency = "stars"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "restaurant-s1-order-001").status = "planned-no-definition"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "restaurant-s1-order-001").denseNumber = 1081; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "restaurant-s1-order-039").requiresCompletedTaskId = "restaurant-s1-t13"; },
    (changed: any) => { changed.orderSlots.find((s: any) => s.id === "restaurant-s1-order-039").requiresCompletedTaskId = "restaurant-s1-t20"; },
    (changed: any) => { changed.phases.find((p: any) => p.id === "restaurant-1").tasks.reverse(); },
  ];
  for (const corrupt of rejected) {
    const changed = structuredClone(plan);
    corrupt(changed);
    assert.throws(() => checker.validateRestaurantPlan(contract, changed));
  }
});

test("The 80 actual restaurant wins finance exactly its 26 purchases from empty wallets", () => {
  const p = freshProgress();
  p.completed = CHAPTER.slice(0, 760).map(story => story.id);
  p.campaign.completedTasks = TASKS.filter(task => task.phaseId !== "restaurant-1").map(task => task.id);
  assert.equal(selectProject(p, "restaurant-1"), true);
  let wins = 0, purchases = 0;
  while (phaseStatus("restaurant-1", p.completed, p.campaign) !== "complete") {
    const task = nextProjectTask(p.campaign, "restaurant-1");
    if (task && taskBalance(p, task) >= task.cost) {
      assert.equal(purchaseProjectTask(p, task.id), true);
      assert.equal(purchaseProjectTask(p, task.id), false);
      purchases++;
      continue;
    }
    const number = nextProjectOrder("restaurant-1", p.completed, p.campaign);
    assert.ok(number, `Restaurant deadlock after ${wins} wins / ${purchases} works`);
    const definition = offlineChapterLevel(number);
    let board = initial(definition);
    for (const move of definition.verifiedSolution) board = applyMove(board, ...move)!;
    p.attempt = { id: definition.id, definition, appearance: createOrderAppearance(definition), board,
      undo: [], solution: [], mixCount: 0, hints: {}, reward: null };
    assert.deepEqual(completeAttempt(p, "2026-10-11"), { ...checker.restaurantOrderReward(contract, ++wins), fresh: true });
    assert.deepEqual(completeAttempt(p, "2026-10-11"), p.attempt.reward);
    assert.ok(p.stars >= 0 && p.repairKits >= 0);
    assert.ok(wins <= 80 && purchases <= 26);
  }
  assert.equal(wins, 80); assert.equal(purchases, 26);
  assert.equal(p.coins, 4800); assert.equal(p.stars, 0); assert.equal(p.repairKits, 0);
  assert.equal(currentGlobalStage(p.completed, p.campaign), 3);
});
