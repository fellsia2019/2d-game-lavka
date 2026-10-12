import { test } from "node:test";
import assert from "node:assert/strict";
import { worldHTML } from "../src/world";
import { freshProgress } from "../src/storage";
import { CHAPTER } from "../src/content";
import { SHOP_STEPS } from "../src/campaign";
import { applyDebugSceneState } from '../src/debug-scene';

test("world has a globe and explicit map return without permanent room selectors", () => {
  const progress = freshProgress();
  const html = worldHTML(progress, "/assets/", "shop", "shop");
  assert.match(html, /data-action="world-navigation" aria-label="Навигация по двору"/);
  assert.match(html, /class="world-scene-back" data-action="show-map" aria-label="На карту двора"/);
  assert.doesNotMatch(html, /world-hall-views|world-room-switch|world-room-selector/);
});

test('map and completed map hide the globe and expose achievements without changing selection', () => {
  const p = freshProgress();
  for (const complete of [false, true]) {
    if (complete) applyDebugSceneState(p, { projectId: 'restaurant-1', works: 26, orders: 80 });
    for (const mode of complete ? ['map', 'finish'] as const : ['map'] as const) {
      const before = structuredClone(p);
      const html = worldHTML(p, '/assets/', mode, 'shop');
      assert.doesNotMatch(html, /world-globe|data-action="world-navigation"/);
      assert.match(html, /world-achievements.*data-action="achievements"/);
      if (complete) assert.match(html, /data-action="achievement-finale">Итоги двора/);
      assert.deepEqual(p, before);
    }
  }
});

test("80 orders retain the final job CTA until purchase then recommend the warehouse", () => {
  const progress = freshProgress();
  progress.completed = CHAPTER.slice(0,80).map(order => order.id);
  progress.campaign.completedTasks = SHOP_STEPS.slice(0,13).map(task => task.id);
  progress.stars = SHOP_STEPS[13].cost;
  let html = worldHTML(progress,"/assets/","shop","shop");
  assert.match(html,/data-action="buy-task"/);
  assert.doesNotMatch(html,/Открыт склад/);
  progress.campaign.completedTasks.push(SHOP_STEPS[13].id);
  progress.stars = 0;
  html = worldHTML(progress,"/assets/","shop","shop");
  assert.match(html,/<h2>Склад<\/h2>/);
  assert.match(html,/data-action="continue-journey" data-project="warehouse-1"/);
  assert.match(html,/>К складу/);
});

test("warehouse map marks the current shop and offers room choice without changing progress", () => {
  const progress = freshProgress();
  progress.completed = CHAPTER.slice(0,80).map(order => order.id);
  progress.campaign.completedTasks = SHOP_STEPS.map(task => task.id);
  const before = structuredClone(progress);
  const html = worldHTML(progress,"/assets/","map","warehouse");
  assert.match(html,/world-pin [^"]*current-area[^\n]*data-area="shop"/);
  assert.match(html,/data-action="select-project" data-project="warehouse-1"/);
  assert.match(html,/world-main-action world-map-action game-guidance" data-action="continue-journey" data-project="warehouse-1"/);
  assert.doesNotMatch(html,/world-map-stages|>Этап [12]|Доступен этап|Можно начинать/);
  assert.match(html,/>Выбрать помещение/);
  assert.match(html,/Вернуться: Лавка/);
  assert.deepEqual(progress,before);
});

test("the map continuation names its real destination while a locked building is selected", () => {
  const progress=freshProgress(),before=structuredClone(progress);
  const html=worldHTML(progress,"/assets/","map","warehouse");
  assert.match(html,/world-map-action[^>]*data-project="shop-1"[^>]*>В лавку/);
  assert.match(html,/Осталось заказов: 80, работ: 14/);
  assert.deepEqual(progress,before);
});
