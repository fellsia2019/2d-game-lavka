import { test } from "node:test";
import assert from "node:assert/strict";
import { compactAmount } from "../src/economy-ui";
import { worldHTML } from "../src/world";
import { freshProgress } from "../src/storage";
import { SHOP_STEPS } from "../src/campaign";

test("world purchase affordance uses the task wallet, never the other currency", () => {
  const progress = freshProgress();
  progress.stars = 100;
  progress.repairKits = 0;
  const render = () => worldHTML(progress, "/assets/", "shop", "shop");
  assert.doesNotMatch(render(), /data-action="buy-task"/);
  progress.repairKits = SHOP_STEPS[0].cost;
  assert.match(render(), /data-action="buy-task"/);
  assert.match(render(), /Цена: 6 ремкомплектов/);
  progress.campaign.completedTasks = SHOP_STEPS.slice(0, 3).map(task => task.id);
  progress.stars = 0;
  progress.repairKits = 100;
  assert.doesNotMatch(render(), /data-action="buy-task"/);
  progress.stars = SHOP_STEPS[3].cost;
  assert.match(render(), /data-action="buy-task"/);
  assert.match(render(), /Цена: 4 звёзд/);
});

test("compact coins preserve complete accessible amounts and all three wallet chips", () => {
  assert.equal(compactAmount(999), "999");
  assert.equal(compactAmount(1800), "1.8k");
  assert.equal(compactAmount(9999), "9.9k");
  assert.equal(compactAmount(36000), "36k");
  assert.equal(compactAmount(999999), "999k");
  assert.equal(compactAmount(1800000), "1.8m");
  const progress = freshProgress();
  progress.coins = 1800;
  const html = worldHTML(progress, "/assets/", "shop", "shop");
  assert.match(html, /aria-label="1800 монет"/);
  assert.match(html, /<b>1.8k<\/b>/);
  for (const currency of ["currency-stars", "currency-repair", "currency-coins"]) assert.ok(html.includes(currency));
});
