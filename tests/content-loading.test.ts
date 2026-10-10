import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHAPTER, createChapterLoader, chapterLevel } from "../src/content";
import { offlineChapterLevel, offlineProjectDefinitions, OFFLINE_CHAPTER_DEFINITIONS } from "../src/content-offline";
import { initial, replay } from "../src/engine";
import { describeStructure } from "../src/generator";

const projectIds = [...new Set(CHAPTER.map(story => story.phaseId))];
const readers = () => Object.fromEntries(projectIds.map(id => [id, async () => offlineProjectDefinitions(id)]));
test("Project loading serves all 680 exact pinned Definitions without mutating its cache", async () => {
  const loader = createChapterLoader(readers());
  for (let number = 1; number <= CHAPTER.length; number++) {
    const definition = await loader.load(number);
    assert.deepEqual(definition, offlineChapterLevel(number));
    assert.equal(replay(definition, definition.verifiedSolution), true);
    definition.shelves[0].front.fill(null);
    definition.verifiedSolution.length = 0;
    assert.deepEqual(await loader.load(number), offlineChapterLevel(number));
    assert.ok(loader.cachedProjectIds().length <= 2);
  }
  assert.throws(() => chapterLevel(31), /loadChapterLevel/);
  await assert.rejects(loader.load(0), /Unknown chapter/);
  await assert.rejects(loader.load(681), /Unknown chapter/);
});
test("Concurrent requests share one load, LRU evicts projects, and failed requests can retry", async () => {
  const calls = new Map<string, number>();
  const loaders = Object.fromEntries(projectIds.map(id => [id, async () => {
    calls.set(id, (calls.get(id) ?? 0) + 1);
    if (id === "shop-2" && calls.get(id) === 1) throw new Error("Temporary network error");
    await Promise.resolve();
    return offlineProjectDefinitions(id);
  }]));
  const loader = createChapterLoader(loaders);
  await Promise.all([loader.load(1), loader.load(2), loader.load(3)]);
  assert.equal(calls.get("shop-1"), 1);
  await loader.load(81);
  await loader.load(1);
  await assert.rejects(loader.load(161), /Temporary network/);
  assert.deepEqual(loader.cachedProjectIds(), ["warehouse-1", "shop-1"]);
  await loader.load(161);
  assert.deepEqual(loader.cachedProjectIds(), ["shop-1", "shop-2"]);
  await loader.load(81);
  assert.equal(calls.get("warehouse-1"), 2);
  assert.deepEqual(loader.cachedProjectIds(), ["shop-2", "warehouse-1"]);
  assert.throws(() => createChapterLoader(loaders, 0), /cache limit/);
});
test("A truncated or cross-project catalog cannot become an available cache entry", async () => {
  let attempt = 0;
  const loader = createChapterLoader({ "shop-1": async () => ++attempt === 1
    ? offlineProjectDefinitions("warehouse-1") : offlineProjectDefinitions("shop-1") });
  await assert.rejects(loader.load(1), /Invalid project catalog/);
  assert.deepEqual(loader.cachedProjectIds(), []);
  assert.deepEqual(await loader.load(1), offlineChapterLevel(1));
});
test("A bakery catalog with a dense number substituted for its stable number is rejected before caching", async () => {
  const wrongNumbers = offlineProjectDefinitions("bakery-1");
  wrongNumbers[79].number = 680;
  let calls = 0;
  const loader = createChapterLoader({ "bakery-1": async () => ++calls === 1 ? wrongNumbers : offlineProjectDefinitions("bakery-1") });
  // Reject the whole catalog, including corrupted entries not yet requested.
  await assert.rejects(loader.load(601), /catalog number|project catalog/);
  assert.deepEqual(loader.cachedProjectIds(), []);
  assert.deepEqual(await loader.load(601), offlineChapterLevel(601));
  assert.equal(calls, 2);
});
test("The produced block keeps exact construction gates, phase assortments, stable numbers and varied structures", () => {
  const plan = JSON.parse(readFileSync(new URL("../docs/content/full-product-plan.json", import.meta.url), "utf8"));
  assert.equal(CHAPTER.length, 680);
  assert.equal(OFFLINE_CHAPTER_DEFINITIONS.length, 680);
  assert.deepEqual(projectIds.map(id => CHAPTER.filter(story => story.phaseId === id).length), [80, 80, 120, 120, 80, 120, 80]);
  for (const [index, story] of CHAPTER.entries()) {
    const phase = plan.phases.find((phase: any) => phase.id === story.phaseId);
    const slot = plan.orderSlots.find((slot: any) => slot.id === story.id);
    assert.equal(story.localNumber, slot.globalNumber - phase.globalOrderRange[0] + 1);
    assert.equal(story.chapterNumber, slot.chapterNumber);
    assert.equal(story.orderContext.kind, slot.kind);
    assert.equal(story.orderContext.requiresCompletedTaskId, slot.requiresCompletedTaskId);
    assert.equal(story.orderContext.executionContext, slot.executionContext);
    const definition = offlineChapterLevel(index + 1);
    assert.equal(definition.number, slot.globalNumber);
    assert.equal(story.catalogNumber ?? index + 1, slot.globalNumber);
    assert.equal(story.denseNumber ?? index + 1, index + 1);
    for (const good of Object.keys(initial(definition).goals)) assert.ok(phase.goodsPool.includes(good));
  }
  const descriptions = OFFLINE_CHAPTER_DEFINITIONS.map(describeStructure);
  assert.deepEqual([...new Set(descriptions.map(description => description.goods / 3))].sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual([...new Set(descriptions.map(description => description.locks))].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.ok(new Set(descriptions.map(description => description.recipe)).size >= 30);
});
