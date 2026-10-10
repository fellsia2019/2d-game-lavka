import { test } from "node:test";
import assert from "node:assert/strict";
import { OFFLINE_CHAPTER_DEFINITIONS } from "../src/content-offline";
import { CHAPTER } from "../src/content";
import { GOODS, GOOD_IDS } from "../src/catalog";
import { projectTasks, PROJECTS } from "../src/campaign";
import { createOrderAppearance, validOrderAppearance, orderItem, orderSummary, MATERIALS } from "../src/order-supplies";

test("all 680 pinned orders have complete stable presentation and 211 repair / 469 food rewards", () => {
  const before = JSON.stringify(OFFLINE_CHAPTER_DEFINITIONS);
  let repairs = 0;
  for (const definition of OFFLINE_CHAPTER_DEFINITIONS) {
    const appearance = createOrderAppearance(definition);
    assert.ok(validOrderAppearance(appearance, definition), definition.id);
    assert.deepEqual(createOrderAppearance(structuredClone(definition)), appearance);
    const { version, items, ...summary } = appearance;
    assert.deepEqual(orderSummary(definition.id), summary);
    if (appearance.kind === "repair") {
      repairs++;
      assert.ok(appearance.title.length <= 17, `Compact repair title: ${appearance.title}`);
      const present = new Set(definition.shelves.flatMap(shelf => [...shelf.front, ...shelf.rear.flat()]).filter(Boolean));
      assert.deepEqual(Object.keys(appearance.items).sort(), [...present].sort());
      assert.equal(new Set(Object.values(appearance.items)).size, present.size);
      assert.ok(present.size <= 4);
      for (const good of GOOD_IDS.filter(good => present.has(good))) {
        const item = orderItem(appearance, good);
        assert.ok(item.file.startsWith("material-"));
        assert.ok(!Object.values(GOODS).some(food => food.name === item.name));
      }
    } else {
      const story = CHAPTER.find(order => order.id === definition.id)!;
      assert.equal(appearance.title, story.name);
      assert.equal(appearance.customer, story.customer);
      assert.equal(appearance.line, story.line);
      assert.deepEqual(appearance.items, {});
    }
  }
  assert.equal(repairs, 211);
  assert.equal(OFFLINE_CHAPTER_DEFINITIONS.length - repairs, 469);
  assert.equal(JSON.stringify(OFFLINE_CHAPTER_DEFINITIONS), before);
});

test("repair briefs follow each funded task boundary, then retain food customer metadata", () => {
  for (const project of PROJECTS) {
    const stories = CHAPTER.filter(order => order.phaseId === project.id);
    let local = 0;
    for (const task of projectTasks(project.id).filter(task => task.currency === "repairKits")) {
      for (let i = 0; i < task.cost; i++) {
        const story = stories[local++];
        const definition = OFFLINE_CHAPTER_DEFINITIONS.find(def => def.id === story.id)!;
        assert.equal(createOrderAppearance(definition).taskId, task.id);
      }
    }
    const next = OFFLINE_CHAPTER_DEFINITIONS.find(def => def.id === stories[local].id)!;
    assert.equal(createOrderAppearance(next).kind, "food");
  }
});

test("persisted presentation rejects corruption while preserving valid pinned edits", () => {
  const definition = OFFLINE_CHAPTER_DEFINITIONS.find(def => Object.keys(createOrderAppearance(def).items).length >= 2)!;
  const valid = createOrderAppearance(definition);
  assert.ok(validOrderAppearance({ ...valid, title: "Закреплённое название" }, definition));
  for (const altered of [null, [], { ...valid, version: 2 }, { ...valid, kind: "food" },
    { ...valid, title: "" }, { ...valid, customer: 3 }, { ...valid, taskId: "wrong-task" },
    { ...valid, items: {} }, { ...valid, items: { ...valid.items, unknown: "paint" } },
    { ...valid, items: Object.fromEntries(Object.keys(valid.items).map(good => [good, "paint"])) },
    { ...valid, items: Object.fromEntries(Object.keys(valid.items).map(good => [good, "unknown"])) }]) {
    assert.equal(validOrderAppearance(altered, definition), false);
  }
  const food = OFFLINE_CHAPTER_DEFINITIONS.find(def => createOrderAppearance(def).kind === "food")!;
  assert.equal(validOrderAppearance({ ...createOrderAppearance(food), items: { j: "paint" } }, food), false);
  assert.deepEqual(orderItem(undefined, "j"), GOODS.j);
  assert.equal(Object.keys(MATERIALS).length, 10);
});
