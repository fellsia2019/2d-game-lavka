import {isFruitView,fruitSceneHTML,fruitTaskArtwork,FRUIT_ASSETS} from './fruit-scene';
import {isBakeryView,bakerySceneHTML,bakeryTaskArtwork,BAKERY_ASSETS} from './bakery-scene';
import {coastalMapArtHTML,COASTAL_MAP_ASSETS} from './coastal-map-scene';
import type { SceneShopDecorations } from './scene-shop';
import { SHOP_STEPS, shopTaskView, type ShopTaskId, type ShopView } from "./campaign";
import type { RenovationColor, RenovationId } from "./renovations";
import { hallSceneHTML, hallTaskArtwork, HALL_ASSETS } from './hall-scene';
import { isShopExpansionView, shopExpansionSceneHTML, shopExpansionTaskArtwork, SHOP_EXPANSION_ASSETS } from './shop-expansion-scene';
import { isWarehouseView, warehouseSceneHTML, warehouseTaskArtwork, WAREHOUSE_ASSETS } from './warehouse-scene';
import { SCENE_TASKS, SCENE_TASK_BY_ID, SCENE_VIEW_NAMES, SCENE_BACKGROUNDS, SITE_VIEWS,
  INITIAL_SITE_LAYERS, type CampaignView, type SceneLayer } from './stage-scene-manifest';
export { SCENE_TASKS, type CampaignView } from './stage-scene-manifest';
export { SHOP_STEPS, CAMPAIGN_AREAS, type CampaignAreaId } from "./campaign";

export const SCENE_ASSETS = [...new Set([...HALL_ASSETS, ...WAREHOUSE_ASSETS, ...SHOP_EXPANSION_ASSETS, ...FRUIT_ASSETS, ...BAKERY_ASSETS, ...COASTAL_MAP_ASSETS, "hall-corner-empty.webp", "campaign-map.webp",
  "hall-corner-left.webp", "hall-corner-right.webp", "hall-corner-tray-left.webp", "hall-corner-tray-right.webp", "hall-corner-counter.webp", "campaign-basket.webp", "counter.webp",
  "jam.webp", "milk.webp", "honey.webp", "bread.webp", "pear.webp", "lemon.webp",
  "campaign-shop-cold.webp", "campaign-fridge.webp", "eggs.webp", "cheese.webp", "juice.webp", "garden.webp",
  ...SCENE_TASKS.flatMap(task => [task.artwork, ...task.layers.map(layer => layer.asset), ...(task.remove ?? [])]).map(asset => asset.endsWith('.svg') ? asset : `${asset}.webp`),
  ...INITIAL_SITE_LAYERS.map(layer => `${layer.asset}.webp`),
  ...Object.values(SCENE_BACKGROUNDS).map(asset => `${asset}.webp`),
  'site-clear-ground.webp', 'site-walls.webp', 'furniture-canopy.webp', 'furniture-floor-broken.webp',
])];

export function sceneDescription(stage: number): string {
  if (stage === 0) return "Пустая лавка";
  return SHOP_STEPS[stage - 1].name;
}

export function completedOrders(stage: number): number {
  return SHOP_STEPS.slice(0, stage).reduce((sum, step) => sum + step.cost, 0);
}

export function shopSceneHTML(stage: number | readonly string[], assets: string,
  decorations: Partial<Record<RenovationId, RenovationColor>> = {},
  options: { pending?: ShopTaskId; justBuilt?: ShopTaskId; controls?: string; view?: ShopView; decor?: SceneShopDecorations } = {}): string {
  const tasks = typeof stage === "number" ? SHOP_STEPS.slice(0, stage).map(task => task.id) : stage;
  const has = (id: ShopTaskId) => tasks.includes(id) || options.pending === id;
  const state = (id: ShopTaskId) => options.pending === id ? "scene-planned" : options.justBuilt === id ? "scene-built-pop" : "";
  const legacyCount = SHOP_STEPS.filter(task => tasks.includes(task.id)).length;
  const label = legacyCount === 0 ? "Пустая лавка" : `Лавка: ${legacyCount} из ${SHOP_STEPS.length} изменений`;
  const view = options.view ?? shopTaskView((options.pending ?? tasks[tasks.length - 1] ?? "shop-s1-r01") as ShopTaskId);
  if (view === 'hall' || view === 'hall-prep') return hallSceneHTML(tasks, assets, decorations, {...options,view});
  if (view === "cold") {
    const coldGoods = has("shop-s1-t11") ? [
      ["milk", 20, 70, 17], ["eggs", 50, 70, 14], ["cheese", 78, 70, 14],
      ["juice", 22, 46, 20], ["eggs", 50, 46, 14], ["cheese", 78, 46, 14],
      ["milk", 22, 29, 14], ["juice", 50, 29, 14], ["eggs", 78, 29, 11],
    ].map(([file, left, bottom, height]) => `<img class="scene-good ${state("shop-s1-t11")}" src="${assets}${file}.webp" alt="" style="left:${left}%;bottom:${bottom}%;height:${height}%" />`).join("") : "";
    return `<div class="shop-composition cold-composition" data-scene-view="cold" role="${options.controls ? "group" : "img"}" aria-label="Холодильная витрина. ${label}">
      <img class="scene-background" src="${assets}campaign-shop-cold.webp" width="1536" height="1024" alt="" />
      ${has("shop-s1-t09") ? `<div class="scene-fridge" aria-hidden="true"><img class="fridge-base ${state("shop-s1-t09")}" src="${assets}campaign-fridge.webp" width="1100" height="683" alt="" />${coldGoods}</div>` : ""}
      ${has("shop-s1-t10") ? `<div class="scene-receiving ${state("shop-s1-t10")}" aria-hidden="true"><img src="${assets}campaign-basket.webp" width="640" height="188" alt="" /><img src="${assets}campaign-basket.webp" width="640" height="188" alt="" /></div>` : ""}
      ${options.controls ?? ""}
    </div>`;
  }
  throw new Error(`Unknown shop camera: ${view}`);
}

export function sceneTaskView(id: string): CampaignView {
  return SCENE_TASK_BY_ID.get(id)?.view ?? 'hall';
}
export function sceneDecorationAnchors(view: CampaignView): Partial<Record<RenovationId, {x:number;y:number}>> {
  return view === 'hall' ? {counter:{x:66,y:75}} : {};
}
export function sceneOverview(areaId: string, phaseId?: string): CampaignView {
  if (areaId === 'warehouse') return phaseId?.endsWith('-2') ? 'warehouse-cold' : 'warehouse';
  if (areaId === 'fruit-yard') return phaseId?.endsWith('-2') ? 'fruit-extension' : 'fruit-market';
  if (areaId === 'bakery') return 'bakery-shop';
  return phaseId?.endsWith('-2') ? 'shop-grocery' : 'hall';
}
export function sceneTaskAnchor(id: string): { view: CampaignView; x: number; y: number } {
  const entry = SCENE_TASK_BY_ID.get(id);
  return { view: entry?.view ?? 'hall', x: entry?.anchor.x ?? 50, y: entry?.anchor.y ?? 50 };
}
export function sceneTaskArtwork(id: string, assets: string): string {
  const hall = hallTaskArtwork(id, assets);
  if (hall) return hall;
  const expansion = shopExpansionTaskArtwork(id, assets);
  if (expansion) return expansion;
  const fruit=fruitTaskArtwork(id,assets);
  if(fruit)return fruit;
  const warehouse = warehouseTaskArtwork(id, assets);
  if (warehouse) return warehouse;
  const bakery = bakeryTaskArtwork(id, assets);
  if (bakery) return bakery;
  const entry = SCENE_TASK_BY_ID.get(id);
  return `<img src="${assets}${entry?.artwork ?? 'furniture-opening-sign'}.webp" alt="" width="160" height="160" />`;
}
export function sceneViews(areaId: string, completed: readonly string[]): { id: CampaignView; name: string }[] {
  const owned = new Set(completed);
  const areaPhases = areaId === 'shop' ? ['shop-1','shop-2'] : areaId === 'warehouse'
    ? ['warehouse-1','warehouse-2'] : areaId === 'fruit-yard' ? ['fruit-yard-1','fruit-yard-2'] : areaId === 'bakery' ? ['bakery-1'] : [];
  const views = new Set<CampaignView>();
  if (areaId === 'shop') { views.add('hall'); views.add('hall-prep'); }
  for (const phase of areaPhases) {
    const phaseTasks = SCENE_TASKS.filter(task => task.phaseId === phase);
    const next = phaseTasks.find(task => !owned.has(task.id));
    // An unreached second phase is inspected once its preceding project has been built.
    if (phase.endsWith('-2') && !completed.some(id => SCENE_TASK_BY_ID.get(id)?.phaseId === phase)
      && !SCENE_TASKS.filter(task => task.phaseId === `${areaId}-1`).every(task => owned.has(task.id))) continue;
    for (const task of phaseTasks) if (owned.has(task.id) || task.id === next?.id) views.add(task.view);
  }
  return [...views].map(id => ({ id, name: SCENE_VIEW_NAMES[id] }));
}

interface SceneOptions {
  areaId: string; phaseId?: string; view?: CampaignView; pending?: string; justBuilt?: string;
  controls?: string; decorations?: Partial<Record<RenovationId, RenovationColor>>; decor?: SceneShopDecorations;
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
function spriteHTML(item: SceneLayer, assets: string, options: { task?: string; pending?: string; justBuilt?: string; removed?: boolean } = {}): string {
  const state = options.task && options.task === options.pending ? 'scene-planned' : options.task && options.task === options.justBuilt ? 'scene-built-pop' : '';
  return `<img class="scene-layer ${state}${options.removed ? ' scene-clearing-target' : ''}" src="${assets}${item.asset}.webp" alt="" loading="eager" decoding="async"${options.task ? ` data-scene-task="${escape(options.task)}"` : ''} style="left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;z-index:${item.z ?? Math.round(item.y)}${item.foot ? ';transform:translate(-50%,-100%);object-position:center bottom' : ''}" />`;
}
function initialLayers(view: CampaignView): SceneLayer[] {
  if (SITE_VIEWS.includes(view)) return INITIAL_SITE_LAYERS;
  if (view === 'warehouse-cold') return [{ asset:'site-rubbish',x:25,y:65,w:35,h:30,z:65 }];
  return [];
}
const siteFocus: Partial<Record<CampaignView, { x: number; y: number; scale: number }>> = {
  'warehouse-yard': {x:80,y:21,scale:2.5}, 'fruit-yard': {x:24,y:49,scale:2.3},
  'fruit-extension-site': {x:23,y:24,scale:2.7},
};
export function campaignSceneHTML(completed: readonly string[], assets: string, options: SceneOptions): string {
  const phaseTasks = SCENE_TASKS.filter(task => task.phaseId === options.phaseId || (!options.phaseId && task.phaseId.startsWith(`${options.areaId}-`)));
  const view = options.view ?? sceneTaskView(options.pending ?? phaseTasks.filter(task => completed.includes(task.id)).at(-1)?.id ?? phaseTasks[0]?.id ?? 'first-shelf');
  const expansionView = view === 'shop-front' && options.areaId === 'shop' ? 'shop-service' : view;
  if (isShopExpansionView(expansionView)) return shopExpansionSceneHTML(completed, assets, {...options, view:expansionView});
  if(isFruitView(view))return fruitSceneHTML(completed,assets,{...options,view});
  if(isBakeryView(view))return bakerySceneHTML(completed,assets,{...options,view});
  if (isWarehouseView(view)) return warehouseSceneHTML(completed, assets, {...options, view});
  if (view === 'hall' || view === 'hall-prep' || view === 'cold') return shopSceneHTML(completed, assets, options.decorations, {
    pending: options.pending as ShopTaskId, justBuilt: options.justBuilt as ShopTaskId, controls: options.controls, view, decor: options.decor,
  });
  const owned = new Set(completed);
  const viewTasks = SCENE_TASKS.filter(task => task.view === view);
  const removed = new Set(viewTasks.filter(task => owned.has(task.id)).flatMap(task => task.remove ?? []));
  const layers: { item: SceneLayer; task?: string; clearing?: boolean }[] = initialLayers(view)
    .filter(item => !removed.has(item.asset)).map(item => ({item, clearing: SCENE_TASK_BY_ID.get(options.pending ?? '')?.remove?.includes(item.asset)}));
  for (const task of viewTasks) if (owned.has(task.id) || options.pending === task.id) {
    for (const item of task.layers) if (!removed.has(item.asset)) layers.push({ item, task: task.id });
  }
  if (view === 'shop-front' && owned.has('shop-opening')) {
    layers.push({item:{asset:'furniture-opening-sign',x:59,y:16,w:24,h:17,z:30},task:'shop-opening'});
  }
  const focus = siteFocus[view];
  const base = focus ? `<div class="scene-site-backdrop" style="--site-scale:${focus.scale};--site-x:${50 - focus.x * focus.scale}%;--site-y:${50 - focus.y * focus.scale}%"><img src="${assets}campaign-map.webp" alt="" /></div>`
    : `<img class="scene-background" src="${assets}${SCENE_BACKGROUNDS[view] ?? 'stage-shop-expansion-empty'}.webp" width="1536" height="1024" alt="" />`;
  const label = SCENE_VIEW_NAMES[view];
  return `<div class="shop-composition stage-composition${focus ? ' site-composition' : ''}" data-scene-view="${view}" role="${options.controls ? 'group' : 'img'}" aria-label="${label}">${base}
    <div class="scene-art-layers" aria-hidden="true">${layers.sort((a,b) => (a.item.z ?? a.item.y) - (b.item.z ?? b.item.y)).map(({item,task,clearing}) => spriteHTML(item,assets,{task,pending:options.pending,justBuilt:options.justBuilt,removed:clearing})).join('')}</div>
    ${options.controls ? `<div class="scene-interaction-layer">${options.controls}</div>` : ''}</div>`;
}

export function campaignMapHTML(completed:readonly string[],assets:string,
  options:{controls?:string;pending?:string;justBuilt?:string}={}):string {
  return `<div class="shop-composition campaign-map-composition" role="${options.controls?'group':'img'}" aria-label="Двор у моря: лавка, склад, фруктовый павильон, пекарня и терраса">${coastalMapArtHTML(completed,assets)}${options.controls?`<div class="scene-interaction-layer">${options.controls}</div>`:''}</div>`;
}
