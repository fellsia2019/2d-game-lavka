import './campaign-preview.css';
import { PROJECTS, TASKS, type ProjectId } from './campaign';
import { campaignSceneHTML, campaignMapHTML, sceneTaskView, sceneViews, type CampaignView } from './campaign-scene';
import { mountHallCanvases } from './hall-canvas';

const root = document.querySelector<HTMLElement>('#campaign-preview')!;
const assets = `${import.meta.env.BASE_URL}assets/`;
const counts: Record<string, number> = Object.fromEntries(PROJECTS.map(p => [p.id, 0]));
let selected: ProjectId = 'shop-1';
let view: CampaignView | undefined;
const url = new URL(location.href);
if (PROJECTS.some(p => p.id === url.searchParams.get('project'))) selected = url.searchParams.get('project') as ProjectId;
const selectedProject = () => PROJECTS.find(p => p.id === selected)!;
function prerequisites(id: string) {
  const project = PROJECTS.find(p => p.id === id);
  if (!project) return;
  project.requiresCompletedPhases.forEach(required => {
    prerequisites(required);
    counts[required] = PROJECTS.find(p => p.id === required)!.taskTarget;
  });
}
prerequisites(selected);
counts[selected] = Math.max(0, Math.min(selectedProject().taskTarget, Number(url.searchParams.get('step')) || 0));
const owned = () => PROJECTS.flatMap(p => p.taskIds.slice(0, counts[p.id]));

root.innerHTML = `<header class="preview-header"><a class="preview-brand" href="./index.html">Лавка у моря</a><a class="back-link" href="./index.html">Вернуться в игру</a></header>
  <section class="preview-intro"><div><span class="eyebrow">МАСТЕРСКАЯ СЦЕН · STAGE 1–2</span><h1>От заросшего участка — к торговому двору</h1><p>Шесть проектов, 126 самостоятельных изменений. Осмотрите стройку, выкладки и оснащение каждого предприятия.</p></div><div class="preview-note">600 заказов · 126 работ<br /><span>Предпросмотр не изменяет сохранение игры</span></div></section>
  <div class="preview-toolbar"><label>Проект<select id="project-select" aria-label="Проект предпросмотра">${PROJECTS.map(p => `<option value="${p.id}">${p.areaId === 'shop' ? 'Лавка' : p.areaId === 'warehouse' ? 'Склад' : 'Фруктовый двор'} · этап ${p.stage}</option>`).join('')}</select></label><label>Помещение / зона<select id="view-select" aria-label="Помещение или зона предпросмотра"></select></label><button type="button" id="all-ready">Все 126 работ</button><button type="button" id="reset-scenes">Заброшенное начало</button></div>
  <div class="preview-layout">
    <section class="map-section" aria-labelledby="map-heading"><div class="section-heading"><div><span class="eyebrow">ОБЩИЙ УЧАСТОК</span><h2 id="map-heading">Ваш участок у моря</h2></div><span class="chapter-count" id="built-count"></span></div><div id="map-container"></div><p class="preview-map-note">Пекарня, терраса и верхняя площадка остаются будущими проектами. Склады, павильон и пристройка появляются по мере оплаченных работ.</p></section>
    <section class="shop-section" aria-labelledby="shop-heading"><div class="section-heading"><div><span class="eyebrow" id="project-eyebrow"></span><h2 id="shop-heading"></h2></div></div>
      <div class="state-selector" role="group" aria-label="Контрольные состояния"><button type="button" data-control="start">Начало</button><button type="button" data-control="middle">Середина</button><button type="button" data-control="finish">Готово</button></div>
      <label class="preview-timeline">Работы <input id="step-range" type="range" min="0" max="14" value="0" aria-label="Число завершённых работ" /><output id="step-output"></output></label>
      <div id="scene-container"></div><div class="scene-caption" aria-live="polite"><h3 id="scene-title"></h3><span id="scene-orders"></span><p id="scene-result"></p></div>
      <ol class="purchase-list" aria-label="126 видимых работ выбранного проекта" id="work-list"></ol>
    </section>
  </div><footer class="preview-footer"><p>Выберите работу, чтобы увидеть её постоянный результат. Каждая стройка проходит очистку, фундамент, стены, крышу, вход и оборудование.</p><a href="./author.html">Мастерская заказов</a></footer>`;

function render() {
  const project = selectedProject();
  const completed = owned();
  const count = counts[selected];
  const task = TASKS.find(t => t.id === project.taskIds[count - 1]);
  const targetView = view ?? sceneTaskView(task?.id ?? project.taskIds[0]);
  const availableViews = sceneViews(project.areaId, [...completed, ...project.taskIds]);
  root.querySelector<HTMLSelectElement>('#project-select')!.value = selected;
  const viewSelect = root.querySelector<HTMLSelectElement>('#view-select')!;
  viewSelect.innerHTML = availableViews.map(v => `<option value="${v.id}" ${v.id === targetView ? 'selected' : ''}>${v.name}</option>`).join('');
  root.querySelector<HTMLElement>('#map-container')!.innerHTML = campaignMapHTML(completed, assets);
  root.querySelector<HTMLElement>('#scene-container')!.innerHTML = campaignSceneHTML(completed, assets, {areaId: project.areaId, phaseId: project.id, view: targetView, justBuilt: task?.id});
  root.querySelector<HTMLElement>('#project-eyebrow')!.textContent = `STAGE ${project.globalStage} · ЭТАП ${project.stage}`;
  root.querySelector<HTMLElement>('#shop-heading')!.textContent = project.title;
  root.querySelector<HTMLElement>('#built-count')!.textContent = `${completed.length} / 126`;
  root.querySelector<HTMLElement>('#scene-title')!.textContent = task?.name ?? 'До первой работы';
  const spent = TASKS.filter(t => t.phaseId === selected).slice(0, count).reduce((sum,t) => sum + t.cost,0);
  root.querySelector<HTMLElement>('#scene-orders')!.textContent = `Обустройство ${count} / ${project.taskTarget} · ${spent} ★`;
  root.querySelector<HTMLElement>('#scene-result')!.textContent = task?.result ?? (project.construction ? 'Участок заброшен. Сначала уберём мусор и старые конструкции.' : 'Помещение готово для первой выкладки.');
  root.querySelector<HTMLOutputElement>('#step-output')!.value = `${count} / ${project.taskTarget}`;
  const range = root.querySelector<HTMLInputElement>('#step-range')!; range.max = String(project.taskTarget); range.value = String(count);
  root.querySelector<HTMLElement>('#work-list')!.innerHTML = project.taskIds.map((id, i) => {
    const t = TASKS.find(t => t.id === id)!;
    return `<li><button type="button" data-step="${i + 1}" aria-pressed="${i + 1 === count}" class="${i < count ? 'completed' : ''}"><span class="purchase-number">${i + 1}</span><span class="purchase-name">${t.name}</span><span class="purchase-cost">${t.cost} ★</span></button></li>`;
  }).join('');
  const params = new URLSearchParams({project:selected,step:String(count)});
  history.replaceState(null,'',`${location.pathname}?${params}`);
  void mountHallCanvases(root);
}
root.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;
  const project = selectedProject();
  if (button.dataset.step) { counts[selected] = Number(button.dataset.step); view = undefined; }
  else if (button.dataset.control) { counts[selected] = button.dataset.control === 'start' ? 0 : button.dataset.control === 'middle' ? Math.round(project.taskTarget / 2) : project.taskTarget; view = undefined; }
  else if (button.id === 'all-ready') { PROJECTS.forEach(p => {counts[p.id] = p.taskTarget;}); counts[selected] = project.taskTarget; }
  else if (button.id === 'reset-scenes') { PROJECTS.forEach(p => {counts[p.id] = 0;}); selected = 'shop-1'; view = undefined; }
  else return;
  render();
});
root.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'project-select') { selected = input.value as ProjectId; prerequisites(selected); view = undefined; }
  else if (input.id === 'view-select') view = input.value as CampaignView;
  else if (input.id === 'step-range') { counts[selected] = Number(input.value); view = undefined; }
  else return;
  render();
});
root.querySelector<HTMLInputElement>('#step-range')!.addEventListener('input', event => {
  counts[selected] = Number((event.target as HTMLInputElement).value); view = undefined; render();
});
render();
