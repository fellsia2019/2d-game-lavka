import "./campaign-preview.css";
import { CAMPAIGN_AREAS, SHOP_STEPS, completedOrders, sceneDescription,
  shopSceneHTML, type CampaignAreaId } from "./campaign-scene";

const root = document.querySelector<HTMLElement>("#campaign-preview")!;
const assets = `${import.meta.env.BASE_URL}assets/`;
let stage = 0;
let selectedArea: CampaignAreaId = "shop";

root.innerHTML = `<header class="preview-header"><a class="preview-brand" href="./index.html">Лавка у моря</a><a class="back-link" href="./index.html">Вернуться в игру</a></header>
  <section class="preview-intro"><div><span class="eyebrow">ПРЕДПРОСМОТР КАМПАНИИ</span><h1>Здесь начинается ваш прибрежный двор</h1><p>Маленькая лавка станет магазином с пекарней, террасой и рестораном. Каждый заказ помогает обустроить это место.</p></div><div class="preview-note">Карта и состояния первой лавки<br /><span>Первый этап визуального плана</span></div></section>
  <div class="preview-layout">
    <section class="map-section" aria-labelledby="map-heading"><div class="section-heading"><div><span class="eyebrow">БОЛЬШАЯ ЦЕЛЬ</span><h2 id="map-heading">Ваш участок у моря</h2></div><span class="chapter-count">6 глав</span></div>
      <div class="plot-map"><img class="map-image" src="${assets}campaign-map.webp" width="1536" height="1024" alt="Маленькая лавка, закрытый склад и свободные участки у набережной" />
        ${CAMPAIGN_AREAS.map(area => `<button class="map-pin" type="button" data-area="${area.id}" aria-label="Глава ${area.chapter}: ${area.name}" aria-pressed="${area.id === selectedArea}" style="left:${area.x}%;top:${area.y}%"><span>${area.chapter}</span>${area.shortName}</button>`).join("")}
      </div>
      <div class="area-selector" role="group" aria-label="Главы развития участка">${CAMPAIGN_AREAS.map(area => `<button class="area-button" type="button" data-area="${area.id}" aria-pressed="${area.id === selectedArea}"><span>${area.chapter}</span>${area.name}</button>`).join("")}</div>
      <div class="area-description" aria-live="polite" id="area-description"></div>
    </section>
    <section class="shop-section" aria-labelledby="shop-heading"><div class="section-heading"><div><span class="eyebrow">ПЕРВАЯ ГЛАВА</span><h2 id="shop-heading">Из пустого помещения — в лавку</h2></div></div>
      <div class="state-selector" role="group" aria-label="Основные состояния лавки"><button type="button" data-stage="0">Начало</button><button type="button" data-stage="3">Середина</button><button type="button" data-stage="5">Открытие</button></div>
      <div id="scene-container"></div>
      <div class="scene-caption" aria-live="polite"><h3 id="scene-title"></h3><span id="scene-orders"></span><p id="scene-result"></p></div>
      <ol class="purchase-list" aria-label="Пять видимых изменений лавки">${SHOP_STEPS.map((step, index) => `<li><button type="button" data-stage="${index + 1}" aria-label="Показать: ${step.name}"><span class="purchase-number">${index + 1}</span><span class="purchase-name">${step.name}</span><span class="purchase-cost">${step.cost} ★</span></button></li>`).join("")}</ol>
    </section>
  </div>
  <footer class="preview-footer"><p>Переключайте покупки, чтобы увидеть результат каждого шага. Это предпросмотр визуального плана кампании.</p><a href="./author.html">Мастерская заказов</a></footer>`;

function renderScene() {
  const orders = completedOrders(stage);
  root.querySelector<HTMLElement>("#scene-container")!.innerHTML = shopSceneHTML(stage, assets);
  root.querySelector<HTMLElement>("#scene-title")!.textContent = sceneDescription(stage);
  root.querySelector<HTMLElement>("#scene-orders")!.textContent = stage === 0 ? "До первого заказа" : `После ${orders} ${orders === 1 ? "заказа" : "заказов"} · ${orders} ★ обустройства`;
  root.querySelector<HTMLElement>("#scene-result")!.textContent = stage === 0
    ? "Первая цель — поставить полку. Для неё хватит одного нового заказа."
    : SHOP_STEPS[stage - 1].result;
  root.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach(button => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.stage) === stage));
    button.classList.toggle("completed", !!button.closest(".purchase-list") && Number(button.dataset.stage) <= stage);
  });
}

function renderArea() {
  const area = CAMPAIGN_AREAS.find(candidate => candidate.id === selectedArea)!;
  root.querySelector<HTMLElement>("#area-description")!.innerHTML = `<span class="eyebrow">ГЛАВА ${area.chapter} · ${area.chapter === 1 ? "ПЕРВЫЙ ЭТАП" : "ДАЛЬНЕЙШАЯ ЦЕЛЬ"}</span><h3>${area.name}</h3><p>${area.goal}</p><p class="area-result">${area.result}</p>`;
  root.querySelectorAll<HTMLButtonElement>("[data-area]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.area === selectedArea)));
}

root.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button) return;
  if (button.dataset.stage !== undefined) {
    stage = Number(button.dataset.stage);
    renderScene();
  } else if (button.dataset.area) {
    selectedArea = button.dataset.area as CampaignAreaId;
    renderArea();
  }
});
renderScene();
renderArea();
