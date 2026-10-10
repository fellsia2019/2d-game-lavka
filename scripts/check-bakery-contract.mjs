// Integration contract. This module verifies pinned production and runtime; it never enables a project.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const digest = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const validCount = n => Number.isSafeInteger(n) && n >= 0;
export const readBakeryContract = () => read("docs/content/bakery-1-contract.json");

/** Stable catalog identity and the dense playable lookup are deliberately separate. */
export function bakeryOrderNumbers(contract, localNumber) {
  if (!Number.isSafeInteger(localNumber) || localNumber < 1 || localNumber > contract.orders)
    throw new Error("Unknown bakery order");
  return { localNumber, id: `bakery-s1-order-${String(localNumber).padStart(3, "0")}`,
    catalogNumber: contract.numbering.catalog.first + localNumber - 1,
    denseNumber: (contract.numbering.denseAppend ?? contract.numbering.proposedDenseAppend).first + localNumber - 1 };
}
export function bakeryOrderReward(contract, localNumber) {
  bakeryOrderNumbers(contract, localNumber);
  const repair = localNumber <= contract.economy.lastRepairOrder;
  return { coins: contract.economy.freshCoins, repairKits: repair ? 1 : 0, stars: repair ? 0 : 1 };
}
export function bakeryTaskAffordable(contract, paidWorks, wallet) {
  if (!validCount(paidWorks) || paidWorks > contract.works ||
    ![wallet?.repairKits, wallet?.stars].every(validCount)) return false;
  const next = contract.tasks[paidWorks];
  return !!next && wallet[next.currency] >= next.cost;
}
/** It is still necessary to buy the entry; collecting 38 rewards alone does not open it. */
export function bakeryOrderAllowed(contract, localNumber, completedOrders, completedTaskIds) {
  if (!Number.isSafeInteger(localNumber) || localNumber < 1 || localNumber > contract.orders ||
    !validCount(completedOrders) || completedOrders > contract.orders || !Array.isArray(completedTaskIds)) return false;
  if (localNumber > completedOrders + 1) return false;
  return localNumber <= contract.economy.constructionOrders || completedTaskIds.includes(contract.economy.opensInteriorAfterTaskId);
}
/** Zero-wallet greedy ledger proves each available prefix funds its next work. */
export function bakeryFundingLedger(contract) {
  const wallet = { stars: 0, repairKits: 0, coins: 0 }, paid = [], rows = [];
  for (let order = 1; order <= contract.orders; order++) {
    assert.ok(bakeryOrderAllowed(contract, order, order - 1, paid), `Entry deadlock at order ${order}`);
    const reward = bakeryOrderReward(contract, order);
    for (const currency of Object.keys(wallet)) wallet[currency] += reward[currency];
    const bought = [];
    while (bakeryTaskAffordable(contract, paid.length, wallet)) {
      const task = contract.tasks[paid.length];
      wallet[task.currency] -= task.cost;
      paid.push(task.id);
      bought.push(task.id);
    }
    assert.ok(wallet.stars >= 0 && wallet.repairKits >= 0, `Negative balance ${order}`);
    rows.push({ order, reward, purchased: bought, paidWorks: paid.length, wallet: { ...wallet } });
  }
  return rows;
}

export function validateBakeryPlan(contract, plan) {
  const bakery = plan.phases.find(phase => phase.id === "bakery-1");
  const slots = plan.orderSlots.filter(slot => slot.phaseId === "bakery-1");
  assert.ok(bakery, "Missing bakery");
  assert.equal(contract.produced, true, "Produce the pinned bakery catalog before advertising readiness");
  assert.equal(contract.runtimeEnabled, true, "Integrate production before advertising readiness");
  assert.equal(contract.state, "implemented");
  assert.equal(contract.contractVersion, "bakery-1-production-2");
  assert.equal(contract.contentVersion, "coastal-stage-1-2-bakery-v2");
  assert.equal(contract.schema, 10);
  assert.equal(contract.campaignVersion, "coastal-campaign-8");
  assert.equal(plan.planVersion, "coastal-full-product-plan-6");
  assert.equal(contract.planVersion, plan.planVersion);
  assert.equal(contract.orders, 80);
  assert.equal(contract.works, 26);
  assert.equal(contract.globalStage, 3);
  assert.equal(contract.localStage, 1);
  assert.equal(bakery.globalStage, 3);
  assert.equal(bakery.orderCount, 80);
  assert.equal(slots.length, 80);
  assert.equal(bakery.tasks.length, 26);
  assert.deepEqual(bakery.requiresCompletedPhases, ["shop-2", "warehouse-2", "fruit-yard-2"]);
  assert.deepEqual(contract.requiresCompletedPhases, bakery.requiresCompletedPhases);
  assert.deepEqual(contract.implementedBlock, { orders: 680, works: 152, stars: 469, repairKits: 211, completeGlobalStage3: false });
  assert.deepEqual(bakery.globalOrderRange, [1081, 1160]);
  assert.deepEqual(bakery.localOrderRange, [1, 80]);
  assert.deepEqual(contract.numbering.catalog, { first: 1081, last: 1160 });
  assert.deepEqual(contract.numbering.local, { first: 1, last: 80 });
  assert.deepEqual(contract.numbering.denseAppend, { first: 601, last: 680, status: "runtime" });
  assert.deepEqual(contract.rooms.map(room => room.id), ["bakery-yard", "bakery-shop", "bakery-oven"]);
  assert.ok(contract.rooms.every(room => room.status === "implemented"));
  const expectedCosts = [2,2,3,3,2,2,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,3,4,4,4,3];
  const semanticOrder = [...Array.from({ length: 12 }, (_, n) => n + 1), 19,20,21,22,23,24,25,13,14,15,16,17,18,26];
  assert.deepEqual(bakery.tasks.map(task => task.cost), expectedCosts);
  let firstOrder = 1;
  for (const [index, task] of bakery.tasks.entries()) {
    const currency = index < 12 ? "repairKits" : "stars";
    assert.equal(task.id, `bakery-s1-t${String(semanticOrder[index]).padStart(2, "0")}`);
    assert.equal(task.currency, currency);
    assert.equal(task.status, "implemented");
    assert.equal(task.fundingSource, index < 12 ? "repair-orders" : "food-orders");
    const actual = contract.tasks[index];
    assert.deepEqual(actual, { id: task.id, name: task.name, index: index + 1, cost: task.cost, currency,
      fundingSource: task.fundingSource, status: "implemented", view: index < 10 ? "bakery-yard" : index >= 19 && index < 25 ? "bakery-oven" : "bakery-shop",
      funding: { firstOrder, lastOrder: firstOrder + task.cost - 1 } });
    firstOrder += task.cost;
  }
  assert.equal(firstOrder, 81);
  assert.equal(bakery.tasks.slice(0, 12).reduce((sum, task) => sum + task.cost, 0), 32);
  assert.equal(bakery.tasks.slice(12).reduce((sum, task) => sum + task.cost, 0), 48);
  const construction = bakery.construction;
  assert.equal(construction.opensInteriorAfterTaskId, "bakery-s1-t20");
  assert.equal(construction.projectOrders, 38);
  assert.equal(construction.interiorOrders, 42);
  assert.deepEqual(construction.taskIds, bakery.tasks.slice(0, 14).map(task => task.id));
  assert.equal(construction.earningContext, "any-already-open-building");
  assert.deepEqual(contract.economy, { repairKits: 32, stars: 48, freshCoins: 60,
    firstRepairOrder: 1, lastRepairOrder: 32, firstFoodOrder: 33, lastFoodOrder: 80,
    constructionOrders: 38, interiorOrders: 42, earningContext: "already-open-building",
    opensInteriorAfterTaskId: "bakery-s1-t20", opensInteriorAfterPaidWorks: 14,
    interiorFirstOrder: 39, allWorksAffordableAfterOrder: 80,
    requiredPurchaseThresholds: contract.tasks.map(task => ({ taskId: task.id,
      minimumCompletedOrders: task.funding.lastOrder, currency: task.currency, cost: task.cost })) });
  let fundingIndex = 0;
  for (const [index, slot] of slots.entries()) {
    const numbers = bakeryOrderNumbers(contract, index + 1);
    while (index + 1 > contract.tasks[fundingIndex].funding.lastOrder) fundingIndex++;
    assert.equal(slot.id, numbers.id);
    assert.equal(slot.globalNumber, numbers.catalogNumber);
    assert.equal(slot.chapterNumber, numbers.localNumber);
    assert.equal(slot.status, "implemented-definition");
    assert.equal(slot.catalogNumber, numbers.catalogNumber);
    assert.equal(slot.denseNumber, numbers.denseNumber);
    assert.equal(slot.definitionFile, "src/levels/projects/bakery-1.json");
    assert.equal(slot.rewardCurrency, index < 32 ? "repairKits" : "stars");
    assert.equal(slot.supplyKind, index < 32 ? "repair" : "food");
    assert.equal(slot.fundingTaskId, contract.tasks[fundingIndex].id);
    assert.equal(slot.kind, index < 38 ? "construction-project" : "interior");
    assert.equal(slot.executionContext, index < 38 ? "already-open-building" : undefined);
    assert.equal(slot.requiresCompletedTaskId, index < 38 ? undefined : "bakery-s1-t20");
  }
  const ledger = bakeryFundingLedger(contract);
  const purchases = ledger.flatMap(row => row.purchased.map(taskId => ({ taskId, minimumCompletedOrders: row.order })));
  assert.deepEqual(purchases, contract.economy.requiredPurchaseThresholds.map(({ taskId, minimumCompletedOrders }) => ({ taskId, minimumCompletedOrders })));
  assert.equal(ledger[37].paidWorks, 14);
  assert.equal(ledger.at(-1).paidWorks, 26);
  assert.deepEqual(ledger.at(-1).wallet, { coins: 4800, stars: 0, repairKits: 0 });
  return ledger;
}

function validateBaseline(contract, plan) {
  const block = read("src/campaign-block.json"), stories = read("src/levels/stage-block.json");
  assert.equal(contract.baseline.orders, 600);
  assert.equal(contract.baseline.works, 126);
  assert.equal(contract.baseline.campaignVersion, "coastal-campaign-6");
  assert.equal(contract.baseline.contentVersion, "coastal-stage-1-2-v1");
  assert.equal(contract.baseline.schema, 8);
  assert.deepEqual(contract.baseline.projectIds, ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"]);
  assert.deepEqual(contract.prerequisiteClosure, contract.baseline.projectIds);
  assert.deepEqual(block.slice(0, 6).map(project => project.id), contract.baseline.projectIds);
  assert.equal(stories.length, 680, "Playable metadata must contain only the 680 real produced orders");
  assert.equal(block.flatMap(project => project.tasks).length, 152);
  assert.deepEqual(block.map(project => project.id), [...contract.baseline.projectIds, "bakery-1"]);
  assert.equal(existsSync(new URL("src/levels/projects/bakery-1.json", root)), true, "Missing bakery production");
  const readySlots = plan.orderSlots.filter(slot => slot.status !== "planned-no-definition");
  const readyTasks = plan.phases.flatMap(phase => phase.tasks).filter(task => task.status !== "planned");
  assert.equal(readySlots.length, 680);
  assert.equal(readyTasks.length, 152);
  assert.deepEqual(plan.nextDelivery.phaseIds, [...contract.baseline.projectIds, "bakery-1"]);
  assert.equal(plan.nextDelivery.orders, 680);
  assert.equal(plan.nextDelivery.tasks, 152);
  assert.equal(plan.nextDelivery.completeGlobalStage3, false);
  assert.equal(readySlots.filter(slot => slot.rewardCurrency === "stars").length, 469);
  assert.equal(readySlots.filter(slot => slot.rewardCurrency === "repairKits").length, 211);
  assert.equal(contract.baseline.stars, 421);
  assert.equal(contract.baseline.repairKits, 179);
  for (const recorded of contract.baseline.projects) {
    const raw = readFileSync(new URL(recorded.definitionFile, root), "utf8"), definitions = JSON.parse(raw);
    assert.equal(digest(raw), recorded.sourceFileDigest, `Baseline file changed: ${recorded.id}`);
    assert.equal(digest(definitions), recorded.definitionDigest, `Definition changed: ${recorded.id}`);
    assert.equal(definitions.length, recorded.orders);
    assert.deepEqual(definitions.map(definition => definition.id), recorded.orderIds);
    const phase = block.find(project => project.id === recorded.id);
    const tasks = phase.tasks.map(({ id, cost, currency }) => ({ id, cost, currency }));
    assert.equal(tasks.length, recorded.works);
    assert.deepEqual(tasks, recorded.tasks, `Paid task contract changed: ${recorded.id}`);
    assert.equal(digest(tasks), recorded.taskDigest);
    const planTasks = plan.phases.find(project => project.id === recorded.id).tasks.map(({ id, cost, currency }) => ({ id, cost, currency }));
    assert.deepEqual(planTasks, tasks, `Plan/runtime baseline differs: ${recorded.id}`);
    assert.deepEqual(readySlots.filter(slot => slot.phaseId === recorded.id).map(({ id, rewardCurrency: currency }) => ({ id, currency })), recorded.rewards);
  }
  assert.deepEqual(stories.slice(0, 600).map(story => story.id), contract.baseline.projects.flatMap(project => project.orderIds));
  assert.deepEqual(readyTasks.filter(task => contract.baseline.projects.some(project => project.tasks.some(baseline => baseline.id === task.id)))
    .map(({ id, cost, currency }) => ({ id, cost, currency })), contract.baseline.projects.flatMap(project => project.tasks));
}

/** Reuse the actual engine and current reward registry; no copied puzzle implementation. */
function replayProduction(contract, manifest) {
  const code = `import assert from 'node:assert/strict';
    import { OFFLINE_CHAPTER_DEFINITIONS } from './src/content-offline.ts';
    import { replay, validateDefinition } from './src/engine.ts';
    import { CHAPTER, CONTENT_VERSION, chapterNumber } from './src/content.ts';
    import { offlineChapterLevel } from './src/content-offline.ts';
    import { GOODS } from './src/catalog.ts';
    import { structuralKey } from './src/generator.ts';
    import { CAMPAIGN_VERSION, PROJECTS, TASKS, orderCurrency } from './src/campaign.ts';
    import { freshProgress } from './src/storage.ts';
    assert.equal(CHAPTER.length, 680); assert.equal(OFFLINE_CHAPTER_DEFINITIONS.length, 680);
    assert.equal(TASKS.length, 152); assert.equal(CAMPAIGN_VERSION, ${JSON.stringify(contract.campaignVersion)});
    assert.equal(CONTENT_VERSION, ${JSON.stringify(manifest.contentVersion)}); assert.equal(freshProgress().schema, ${contract.schema});
    assert.equal(PROJECTS.length, 7); assert.ok(PROJECTS.some(p => p.id === 'bakery-1'));
    assert.equal(chapterNumber('bakery-s1-order-001'), 601); assert.equal(chapterNumber('bakery-s1-order-080'), 680);
    assert.ok(Object.hasOwn(GOODS, 'bg') && Object.hasOwn(GOODS, 'cr'));
    for (const definition of OFFLINE_CHAPTER_DEFINITIONS) { validateDefinition(definition);
      assert.equal(replay(definition, definition.verifiedSolution), true, definition.id); }
    for (let number = 1; number <= CHAPTER.length; number++) {
      const story = CHAPTER[number - 1], definition = offlineChapterLevel(number);
      assert.equal(definition.id, story.id); assert.equal(definition.number, story.catalogNumber ?? number);
      assert.equal(chapterNumber(story.id), number);
    }
    const structures = OFFLINE_CHAPTER_DEFINITIONS.map(definition => ({ id: definition.id,
      key: structuralKey(definition), moves: definition.verifiedSolution.length }));
    assert.equal(new Set(structures.map(entry => entry.key)).size, 680);
    console.log(JSON.stringify({ replayed: OFFLINE_CHAPTER_DEFINITIONS.length,
      structures: structures.slice(600), rewards: CHAPTER.map(order => ({ id: order.id, currency: orderCurrency(order.id) })) }));`;
  const execution = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code],
    { cwd: fileURLToPath(root), encoding: "utf8", timeout: 60_000 });
  assert.equal(execution.status, 0, execution.stderr || execution.error?.message || "Production replay failed");
  const result = JSON.parse(execution.stdout.trim());
  assert.equal(result.replayed, 680);
  assert.deepEqual(result.rewards.slice(0, 600), contract.baseline.projects.flatMap(project => project.rewards));
  assert.deepEqual(result.rewards.slice(600), manifest.entries.map(entry => ({ id: entry.id,
    currency: entry.localNumber <= 32 ? "repairKits" : "stars" })));
  assert.deepEqual(result.structures, manifest.entries.map(entry => ({ id: entry.id, key: entry.structuralKey, moves: entry.replayedMoves })));
  return result.replayed;
}

function validateProduction(contract) {
  const manifest = read(contract.productionManifest), raw = readFileSync(new URL(manifest.definitionFile, root), "utf8");
  const definitions = JSON.parse(raw), stories = read("src/levels/stage-block.json").slice(600);
  assert.equal(manifest.produced, true); assert.equal(manifest.runtimeEnabled, true);
  assert.equal(manifest.productionVersion, "bakery-1-production-2");
  assert.equal(manifest.contentVersion, contract.contentVersion);
  assert.equal(manifest.orders, 80); assert.equal(manifest.works, 26);
  assert.deepEqual(manifest.catalogRange, [1081, 1160]); assert.deepEqual(manifest.denseRange, [601, 680]);
  assert.deepEqual(manifest.localRange, [1, 80]);
  assert.equal(manifest.definitionDigest, digest(definitions)); assert.equal(manifest.sourceFileDigest, digest(raw));
  assert.equal(manifest.sourceFileDigest, contract.metadataRevision.preservedDefinitionSourceDigest);
  assert.equal(manifest.definitionDigest, contract.metadataRevision.preservedDefinitionDigest);
  assert.deepEqual(manifest.metadataRevision, contract.metadataRevision);
  assert.equal(manifest.storiesDigest, digest(stories)); assert.deepEqual(manifest.stories, stories);
  assert.equal(definitions.length, 80); assert.equal(manifest.entries.length, 80);
  for (const [index, entry] of manifest.entries.entries()) {
    const numbers = bakeryOrderNumbers(contract, index + 1), definition = definitions[index], story = stories[index];
    assert.deepEqual({ localNumber: entry.localNumber, id: entry.id, catalogNumber: entry.catalogNumber, denseNumber: entry.denseNumber }, numbers);
    assert.equal(definition.id, entry.id); assert.equal(definition.number, entry.catalogNumber);
    assert.equal(definition.seed, entry.seed); assert.equal(definition.generatorVersion, entry.generatorVersion);
    assert.ok(typeof entry.structuralKey === "string" && entry.structuralKey.length);
    assert.equal(story.id, entry.id); assert.equal(story.catalogNumber, entry.catalogNumber); assert.equal(story.denseNumber, entry.denseNumber);
    const goods = [...new Set(definition.shelves.flatMap(shelf => [...shelf.front, ...shelf.rear.flat()]).filter(Boolean))];
    if (index < 38) assert.ok(!goods.includes("bg") && !goods.includes("cr"), "Bakery goods must wait for the purchased interior gate");
    else assert.ok(goods.includes("bg") && goods.includes("cr"), "Interior orders must introduce the produced bakery goods");
  }
  assert.deepEqual(manifest.baseline, contract.baseline.projects.map(({ id, sourceFileDigest, definitionDigest }) => ({ id, sourceFileDigest, definitionDigest })));
  return manifest;
}

export function checkBakeryContract() {
  const contract = readBakeryContract(), plan = read("docs/content/full-product-plan.json");
  validateBakeryPlan(contract, plan);
  validateBaseline(contract, plan);
  const manifest = validateProduction(contract), replayed = replayProduction(contract, manifest);
  return { planning: false, produced: true, runtimeEnabled: true, bakeryOrders: 80, bakeryWorks: 26, repairKits: 32, stars: 48,
    gate: "bakery-s1-t20 after order 38", baselineOrders: 600, baselineWorks: 126, replayed,
    catalogRange: [1081, 1160], denseRange: [601, 680], completeGlobalStage3: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(checkBakeryContract(), null, 2));
}
