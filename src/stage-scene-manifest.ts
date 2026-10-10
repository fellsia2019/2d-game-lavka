/** Fixed art anchors for all produced works, including the first bakery. */
import { TASKS } from './campaign';
import { HALL_TASK_ART } from './hall-scene';
import { WAREHOUSE_TASK_ART } from './warehouse-scene';
import { SHOP_EXPANSION_TASK_ART } from './shop-expansion-scene';
import {FRUIT_TASK_ART} from './fruit-scene';
import {BAKERY_TASK_ART} from './bakery-scene';
export type CampaignView = 'hall' | 'hall-prep' | 'cold' | 'shop-bread' | 'shop-service' | 'shop-grocery' | 'shop-front'
  | 'warehouse-yard' | 'warehouse' | 'warehouse-cold' | 'warehouse-receiving'
  | 'fruit-yard' | 'fruit-market' | 'fruit-extension-site' | 'fruit-extension'
  | 'bakery-yard' | 'bakery-oven' | 'bakery-shop';
export interface SceneLayer { asset: string; x: number; y: number; w: number; h: number; z?: number; foot?: boolean; }
export interface SceneTaskArt { id: string; phaseId: string; view: CampaignView; artwork: string;
  anchor: { x: number; y: number }; layers: SceneLayer[]; remove?: string[]; }
const layer = (asset: string, x: number, y: number, w: number, h: number, z = Math.round(y)):
  SceneLayer => ({ asset, x, y, w, h, z });
const tasks: SceneTaskArt[] = [];
const ids = ['first-shelf', 'display-baskets', 'first-stock', 'order-counter', 'shop-opening'];
function work(phase: string, index: number, view: CampaignView, asset: string,
  x: number, y: number, w: number, h: number, more: SceneLayer[] = [], remove: string[] = []) {
  const [area, stage] = phase.match(/^(.*)-(\d)$/)!.slice(1);
  const id = phase === 'shop-1' && index <= 5 ? ids[index - 1] : `${area}-s${stage}-t${String(index).padStart(2, '0')}`;
  const layers = asset ? [layer(asset, x, y, w, h), ...more] : more;
  tasks.push({ id, phaseId: phase, view, artwork: asset || more[0]?.asset || 'site-clear-ground', anchor: { x, y }, layers, ...(remove.length ? { remove } : {}) });
}
const goods = (names: string[], x: number, y: number, gap = 5, size = 8): SceneLayer[] =>
  names.map((asset, i) => layer(asset, x + i * gap, y, size, size * 1.5, Math.round(y) + 2));
const stock = (asset: string,x: number,y: number,w=6,h=8,z=80): SceneLayer => ({asset,x,y,w,h,z,foot:true});

// The first hall now owns 14 major results, registered against one source frame.
for (const [id, artwork, x, y] of HALL_TASK_ART) {
  const task = TASKS.find(task => task.id === id)!;
  tasks.push({id,phaseId:'shop-1',view:task.primaryView as CampaignView,artwork,anchor:{x,y},layers:[]});
}

// Dirt is removed individually, then the outline/foundation/frame are replaced by the next construction state.
function siteWorks(phase: string, view: CampaignView, pavilion = false) {
  const assets = ['site-rubbish','site-ruins','site-vines','site-stumps','site-rough-ground',
    'site-outline','site-foundation','site-frame', pavilion ? 'site-pavilion-roof' : 'site-roof',
    'site-windows-door','furniture-floor-new','furniture-lanterns'];
  assets.forEach((asset, i) => {
    const clearing = i < 5;
    const building = i === 7 && !pavilion ? 'site-walls' : asset;
    work(phase, i + 1, view, clearing ? '' : building, clearing ? [32, 54, 74, 43, 55][i] : 53,
      clearing ? [69, 50, 65, 78, 78][i] : i === 8 ? 34 : i === 11 ? 56 : 64,
      clearing ? 35 : i === 8 ? 64 : i === 11 ? 60 : 63,
      clearing ? 40 : i === 8 ? 59 : i === 11 ? 21 : 65,
      i === 7 && pavilion ? [layer('furniture-wind-screens',70,62,28,40)] : [],
      clearing ? [asset] : i === 6 ? ['site-outline'] : i === 7 ? ['site-foundation'] : []);
    if (clearing) tasks[tasks.length - 1].artwork = asset;
  });
}
siteWorks('warehouse-1', 'warehouse-yard');
work('warehouse-1', 13, 'warehouse-yard', 'furniture-pallet', 31, 86, 30, 16);
work('warehouse-1', 14, 'warehouse-yard', 'furniture-modular-shelf', 74, 73, 19, 30);
work('warehouse-1', 15, 'warehouse', 'furniture-category-boards', 70, 21, 28, 13);
work('warehouse-1', 16, 'warehouse', 'furniture-sacks', 83, 76, 22, 26);
work('warehouse-1', 17, 'warehouse', 'furniture-ice-chest', 33, 78, 29, 23);
work('warehouse-1', 18, 'warehouse', 'furniture-inspection-table', 56, 83, 34, 27);
work('warehouse-1', 19, 'warehouse', 'furniture-trolley', 15, 83, 26, 25);
work('warehouse-1', 20, 'warehouse-receiving', 'furniture-walkway', 47, 76, 48, 33);
work('warehouse-1', 21, 'warehouse', '', 72, 45, 0, 0,
  [stock('flour',63,33,7,11),stock('sugar',72,33,7,11),stock('jam',81,33,7,10),
   stock('flour',63,57,7,11),stock('honey',72,57,7,10),stock('bread',81,57,7,9)]);
work('warehouse-1', 22, 'warehouse', 'furniture-tool-cupboard', 40, 42, 21, 35);
work('warehouse-1', 23, 'warehouse', 'furniture-metal-bins', 16, 67, 18, 21);
work('warehouse-1', 24, 'warehouse', 'furniture-packing-station', 53, 68, 30, 23);
work('warehouse-1', 25, 'warehouse', 'furniture-crates', 76, 89, 28, 20,
  goods(['jam','honey','bread'], 71, 76, 7, 7));
work('warehouse-1', 26, 'warehouse-receiving', 'furniture-supply-bell', 83, 67, 12, 38);

// The second shop uses two complete registered room plates, with one task ID per purchase.
for (const art of SHOP_EXPANSION_TASK_ART) {
  tasks.push({id:art.id,phaseId:'shop-2',view:art.view,artwork:art.source,anchor:art.anchor,layers:[]});
}

work('warehouse-2', 1, 'warehouse-cold', '', 25, 54, 35, 40, [], ['site-rubbish']);
tasks[tasks.length - 1].artwork = 'site-rubbish';
work('warehouse-2', 2, 'warehouse-cold', 'furniture-insulation', 27, 43, 38, 48);
work('warehouse-2', 3, 'warehouse-cold', 'furniture-cold-cabinet', 26, 53, 32, 61);
work('warehouse-2', 4, 'warehouse-cold', 'furniture-wire-shelves', 26, 53, 24, 34);
work('warehouse-2', 5, 'warehouse-cold', 'furniture-thermometer', 48, 43, 5, 22);
work('warehouse-2', 6, 'warehouse-cold', '', 26, 53, 0, 0,
  [stock('milk',18,52,7,11),stock('milk',26,52,7,11),stock('eggs',34,52,7,8),
   stock('cheese',18,68,7,8),stock('milk',26,68,7,11),stock('juice',34,68,7,11)]);
work('warehouse-2', 7, 'warehouse-cold', 'furniture-flour-rack', 70, 46, 30, 47);
work('warehouse-2', 8, 'warehouse-cold', '', 70, 46, 0, 0,
  [stock('flour',62,38,7,11),stock('flour',70,38,7,11),stock('flour',78,38,7,11),
   stock('flour',62,59,7,11),stock('flour',70,59,7,11),stock('flour',78,59,7,11)]);
work('warehouse-2', 9, 'warehouse-cold', 'furniture-sugar-containers', 63, 83, 28, 23);
work('warehouse-2', 10, 'warehouse-cold', 'sugar', 58, 66, 9, 15,
  goods(['sugar','sugar'], 68, 66, 9));
work('warehouse-2', 11, 'warehouse-cold', 'furniture-fruit-stand', 90, 75, 18, 26);
work('warehouse-2', 12, 'warehouse-cold', 'apple', 86, 67, 5, 7,
  [...goods(['orange','pear'], 91, 67, 5, 5), ...goods(['apple','orange','banana'], 84, 78, 5, 5)]);
work('warehouse-2', 13, 'warehouse-receiving', 'furniture-order-rack', 26, 51, 28, 31);
work('warehouse-2', 14, 'warehouse-receiving', 'furniture-wash-basin', 52, 73, 28, 34);
work('warehouse-2', 15, 'warehouse-receiving', 'furniture-drying-rack', 55, 52, 22, 17);
work('warehouse-2', 16, 'warehouse-receiving', 'furniture-tool-cupboard', 86, 45, 19, 34);
work('warehouse-2', 17, 'warehouse-receiving', 'furniture-canopy', 50, 30, 65, 40);
work('warehouse-2', 18, 'warehouse-receiving', 'furniture-wind-screens', 81, 58, 27, 35);
work('warehouse-2', 19, 'warehouse-receiving', 'furniture-spotlight', 70, 29, 13, 15);
work('warehouse-2', 20, 'warehouse-receiving', 'furniture-direction-post', 11, 70, 16, 43);

for(const art of FRUIT_TASK_ART){
  const phaseId=art.id.startsWith('fruit-yard-s1')?'fruit-yard-1':'fruit-yard-2';
  tasks.push({id:art.id,phaseId,view:art.view,artwork:art.source,anchor:art.anchor,layers:[]});
}

// Registration pass: small flat floor patches, and a roof seated on the wall top.
for (const task of tasks) {
  for (const item of task.layers) {
    if (['jam','milk','bread','pear','honey','lemon','eggs','cheese','juice','apple','orange','banana',
      'rice','tea','olive-oil','flour','sugar','coffee','olives','pasta','canned-tomatoes','peach','grape','strawberry'].includes(item.asset) && !item.foot) {
      item.y += item.h / 2; item.foot = true; item.z = 80;
    }
    if (item.asset === 'furniture-floor-new') {
      item.y = ['warehouse-yard','fruit-yard','fruit-extension-site'].includes(task.view) ? 87 : 86;
      item.h = task.view === 'shop-grocery' ? 17 : 12;
      item.z = 2;
    }
    if (item.asset === 'site-walls' && task.view !== 'fruit-extension-site') {
      Object.assign(item, {x:53,y:61,w:63,h:58,z:50});
    }
    if (item.asset === 'site-roof') Object.assign(item,{x:53,y:32,w:80,h:52,z:51});
    if (item.asset === 'site-pavilion-roof') Object.assign(item,{x:53,y:34,w:65,h:40,z:53});
    if (item.asset === 'site-outline') Object.assign(item,{x:53,y:78,w:63,h:31,z:2});
    if (item.asset === 'site-foundation') Object.assign(item,{x:53,y:78,w:63,h:31,z:2});
    if (item.asset === 'site-windows-door') Object.assign(item,{x:45,y:64,w:31,h:31,z:70});
    if (item.asset === 'furniture-walkway') item.z = 1;
    item.x = Math.max(2 + item.w / 2, Math.min(98 - item.w / 2, item.x));
    item.y = item.foot ? Math.max(2 + item.h, Math.min(98,item.y)) : Math.max(2 + item.h / 2, Math.min(98 - item.h / 2, item.y));
  }
}

// One room, two approved cameras, and stable shared purchase IDs.
for (const [id, artwork, x, y] of HALL_TASK_ART) {
  const scene = tasks.find(task => task.id === id)!;
  const task = TASKS.find(task => task.id === id)!;
  scene.view = task.primaryView as CampaignView;
  scene.artwork = artwork;
  scene.anchor = {x,y};
  scene.layers = [];
  delete scene.remove;
}
for (const art of WAREHOUSE_TASK_ART) {
  const entry = tasks.find(task => task.id === art.id)!;
  entry.view = art.view;
  entry.artwork = art.source;
  entry.anchor = art.anchor;
  entry.layers = [];
  // Map clearing still needs the original five obstacle IDs.
  if (!/^warehouse-s1-t0[1-5]$/.test(entry.id)) delete entry.remove;
}
for (const art of BAKERY_TASK_ART) {
  tasks.push({id:art.id,phaseId:'bakery-1',view:art.view,artwork:art.source,anchor:art.anchor,layers:[]});
}
export const SCENE_TASKS: readonly SceneTaskArt[] = tasks;
export const SCENE_TASK_BY_ID = new Map(tasks.map(task => [task.id, task]));
export const SCENE_VIEW_NAMES: Record<CampaignView, string> = {
  hall: 'Торговый зал', 'hall-prep': 'Подготовка заказов', cold: 'Холодильная витрина', 'shop-bread': 'Хлеб и упаковка',
  'shop-service': 'Касса и вход', 'shop-grocery': 'Бакалея, чай и кофе', 'shop-front': 'Вход в лавку',
  'warehouse-yard': 'Строительство склада', warehouse: 'Приёмка и хранение',
  'warehouse-cold': 'Холодильная комната', 'warehouse-receiving': 'Разгрузочный двор',
  'fruit-yard': 'Строительство павильона', 'fruit-market': 'Фруктовый павильон',
  'fruit-extension-site': 'Строительство пристройки', 'fruit-extension': 'Зал фруктовой лавки',
  'bakery-yard': 'Пекарня и вход', 'bakery-oven': 'Рабочая кухня', 'bakery-shop': 'Вход и торговый зал',
};
export const SCENE_BACKGROUNDS: Partial<Record<CampaignView, string>> = {
  hall: 'hall-v1-empty', 'hall-prep': 'hall-v2-empty',
  'shop-bread': 'stage-shop-expansion-empty', 'shop-service': 'stage-shop-expansion-empty',
  'shop-grocery': 'stage-shop-expansion-empty', warehouse: 'stage-warehouse-empty',
  'warehouse-cold': 'stage-warehouse-empty', 'warehouse-receiving': 'stage-warehouse-yard-empty',
  'shop-front': 'stage-shop-front-empty',
  'fruit-market': 'stage-fruit-market-empty', 'fruit-extension': 'stage-shop-expansion-empty',
};
export const SITE_VIEWS: CampaignView[] = ['warehouse-yard','fruit-yard','fruit-extension-site'];
export const INITIAL_SITE_LAYERS: SceneLayer[] = [
  layer('site-rough-ground',55,78,65,30,1), layer('site-vines',74,65,30,40,55),
  layer('site-ruins',54,50,35,47,50), layer('site-rubbish',32,69,29,29,70),
  layer('site-stumps',43,78,32,22,75),
];
