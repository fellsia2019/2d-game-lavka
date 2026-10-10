import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectTasks } from "../src/campaign";

const prices = [6, 5, 8, 4, 7, 6, 7, 5, 6, 4, 8, 5, 6, 3];
const objects = ["room-floor", "room-walls", "room-entrance", "window-display", "window-display", "main-display", "main-display", "bread-section", "checkout-counter", "checkout-counter", "packing-station", "order-rack", "order-rack", "room-lighting"];
const focus = ["whole", "whole", "whole", "window", "window", "display", "display", "display", "counter", "counter", "packing", "orders", "orders", "whole"];

test("The approved restart has fourteen substantial jobs, an 80-unit budget and explicit primary scenes", () => {
  const tasks = projectTasks("shop-1");
  assert.equal(tasks.length, 14);
  assert.deepEqual(tasks.map(task => task.cost), prices);
  assert.equal(tasks.reduce((sum, task) => sum + task.cost, 0), 80);
  assert.deepEqual(tasks.map(task => task.sceneObjectId), objects);
  assert.deepEqual(tasks.map(task => task.focusZone), focus);
  for (const [i, task] of tasks.entries()) {
    assert.equal(task.id, `shop-s1-r${String(i + 1).padStart(2, "0")}`);
    assert.equal(task.roomId, "shop-hall");
    const view = i >= 10 && i <= 12 ? "hall-prep" : "hall";
    assert.equal(task.primaryView, view);
    assert.deepEqual(task.visibleIn, [0, 1, 5, 6, 7, 13].includes(i) ? ["hall", "hall-prep"] : [view]);
    assert.equal(task.camera, undefined, "Old incompatible angle metadata must not leak into the new source");
  }
  assert.equal(tasks.filter(task => task.primaryView === "hall").length, 11);
  assert.equal(tasks.filter(task => task.primaryView === "hall-prep").length, 3);
});

test("Runtime restoration jobs agree with the production plan including object ownership and phone focus", () => {
  const plan = JSON.parse(readFileSync(new URL("../docs/content/full-product-plan.json", import.meta.url), "utf8"));
  const phase = plan.phases.find((phase: any) => phase.id === "shop-1");
  const fields = ["id", "name", "cost", "target", "roomId", "primaryView", "visibleIn", "sceneObjectId", "focusZone"];
  const properties = (task: any) => Object.fromEntries(fields.map(field => [field, task[field]]));
  assert.deepEqual(projectTasks("shop-1").map(properties), phase.tasks.map(properties));
});
