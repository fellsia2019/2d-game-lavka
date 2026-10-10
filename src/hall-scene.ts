import type { RenovationColor, RenovationId } from './renovations';
import type { SceneShopDecorations } from './scene-shop';
import { MAIN_LAYERS, PREP_LAYERS } from './hall-scene-layers';
type HallView = 'hall' | 'hall-prep';
interface Options { pending?: string; justBuilt?: string; controls?: string; view: HallView; decor?: SceneShopDecorations; }
export const HALL_CANVAS = { width: 1536, height: 1024 } as const;
export const HALL_ASSETS = [...['main','prep'].flatMap(view => ['master','empty','clean','before'].map(state => `hall-room-${view}-${state}.webp`)), ...['main-before','main-counter','main-lighting','prep-lighting'].map(name=>`hall-polish-${name}.webp`)];
export const HALL_TASK_ART: readonly [string, string, number, number][] = [
  ['shop-s1-r01','hall-room-main-clean',55,79], ['shop-s1-r02','hall-room-main-clean',71,26],
  ['shop-s1-r03','hall-room-main-clean',28,23], ['shop-s1-r04','hall-room-main-empty',39,46],
  ['shop-s1-r05','hall-room-main-master',39,33], ['shop-s1-r06','hall-room-main-empty',72,42],
  ['shop-s1-r07','hall-room-main-master',72,29], ['shop-s1-r08','hall-room-main-master',78,42],
  ['shop-s1-r09','hall-polish-main-counter',68,75], ['shop-s1-r10','hall-room-main-master',78,61],
  ['shop-s1-r11','hall-room-prep-master',53,52], ['shop-s1-r12','hall-room-prep-empty',83,48],
  ['shop-s1-r13','hall-room-prep-master',78,46], ['shop-s1-r14','hall-room-main-master',66,19],
];
let instance = 0;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function hallSurfaceEffects(owned:Set<string>, options:Options, prep:boolean, decor:SceneShopDecorations):string {
  const pendingLight=options.pending==='shop-s1-r14';
  const light=owned.has('shop-s1-r14')||pendingLight;
  const counter=!prep&&(owned.has('shop-s1-r09')||options.pending==='shop-s1-r09');
  if(!counter&&!light)return '';
  const id=`room-surface-${++instance}`;
  const glow=`#${(decor.lighting?.glowColor??0xffd685).toString(16).padStart(6,'0')}`;
  const strength=decor.lighting?.glowStrength??.13;
  const lamps=prep?[[620,155,205,165],[260,243,130,110],[1030,212,145,130]]:[[835,167,215,165],[1100,190,130,110],[1450,317,130,110]];
  return `<svg class="hall-surface-effects" viewBox="0 0 1536 1024" aria-hidden="true"><defs><filter id="${id}-shadow"><feGaussianBlur stdDeviation="10"/></filter><radialGradient id="${id}-glow"><stop stop-color="${glow}" stop-opacity=".8"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>${counter?`<path data-scene-task="shop-s1-r09" data-contact-shadow="counter" d="M734 723 L773 736 L1178 926 L1212 948 L1377 845 L1407 865 L1231 989 L1171 955 L716 750 Z" fill="#51341f" opacity="${owned.has('shop-s1-r09')?.36:.1}" filter="url(#${id}-shadow)"/>`:''}${light?`<g data-scene-task="shop-s1-r14" data-light-glow="installed" opacity="${pendingLight?strength*.27:strength}">${lamps.map(([cx,cy,rx,ry])=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}-glow)"/>`).join('')}</g>`:''}</svg>`;
}
/** A complete room corner. Layer coordinates are fixed; the frame is fitted as a whole. */
export function hallSceneHTML(completed: readonly string[], assets: string,
  decorations: Partial<Record<RenovationId, RenovationColor>>, options: Options): string {
  const owned = new Set(completed);
  const visible = (id: string) => owned.has(id) || options.pending === id;
  const prep = options.view === 'hall-prep';
  const active = (prep ? PREP_LAYERS : MAIN_LAYERS).filter(layer => visible(layer.task) && (!layer.parent || visible(layer.parent)));
  const decor = options.decor ?? {};
  const base = prep ? owned.has('shop-s1-r02') ? 'hall-room-prep-clean' : 'hall-room-prep-before'
    : owned.has('shop-s1-r03') ? 'hall-room-main-clean' : 'hall-polish-main-before';
  const plan = {base: `${assets}${base}.webp`, layers: active.map(layer => ({
    id:layer.id, source:`${assets}${layer.source}.webp`, path:layer.path, kind:layer.kind,
    alpha:options.pending===layer.task ? .27 : 1,
    ...(layer.kind==='counter' ? {color:decorations.counter ?? 'sea'} : {}),
    ...(layer.brightness ? {brightness:layer.brightness} : {}),
    ...(layer.object==='room-floor' && decor.floor ? {hue:decor.floor.hue,saturation:decor.floor.saturation,brightness:decor.floor.brightness} : {}),
    animate:options.justBuilt===layer.task,
  }))};
  if(!prep && visible('shop-s1-r09') && decor.counterTop) plan.layers.splice(plan.layers.findIndex(layer=>layer.id==='counter')+1,0,{
    id:'counter-top-finish',source:`${assets}hall-polish-main-counter.webp`,
    path:'M745 556 L870 490 L1371 685 L1371 699 L1355 715 L746 577 Z',kind:'furniture',
    alpha:options.pending==='shop-s1-r09'?.27:1,
    hue:decor.counterTop.hue,saturation:decor.counterTop.saturation,brightness:decor.counterTop.brightness,
    animate:false,
  });
  const effects = hallSurfaceEffects(owned,options,prep,decor);
  const metadata = active.map(layer => `<span data-scene-task="${layer.task}" data-scene-object="${layer.object}" data-layer-kind="${layer.kind}" data-layer-id="${layer.id}" data-source-sheet="${layer.source}"${layer.parent?` data-layer-parent="${layer.parent}"`:''} class="hall-registered-layer${layer.kind==='counter'?` hall-color-${decorations.counter ?? 'sea'}`:''}${options.pending===layer.task?' scene-planned':''}"></span>`).join('');
  return `<div class="shop-composition hall-composition scene-reset hall-angle-${prep?2:1}" data-scene-view="${options.view}" data-room-id="shop-hall" data-art-version="room-polish-1" data-scene-ready="false" role="${options.controls?'group':'img'}" aria-label="Торговый зал. ${prep?'Подготовка заказов':'Вход и витрины'}"><div class="hall-world-stage"><img class="hall-loading-frame" src="${escape(assets)}${base}.webp" width="1536" height="1024" alt="" /><canvas class="hall-canvas-surface" width="1536" height="1024" aria-hidden="true"></canvas>${effects}<script class="hall-canvas-plan" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script></div><div class="hall-canvas-metadata" hidden>${metadata}</div>${options.controls?`<div class="hall-goal-layer">${options.controls}</div>`:''}</div>`;
}
const thumbBoxes: readonly [number,number,number,number][] = [
  [330,680,770,280], [900,60,400,230], [220,25,420,550], [380,80,480,560],
  [450,125,370,340], [825,80,620,590], [860,125,500,310], [1040,310,260,210],
  [710,460,710,540], [1050,490,270,270], [590,295,430,410], [960,210,575,685],
  [1000,290,310,430], [850,0,520,240],
];
export function hallTaskArtwork(id: string, assets: string): string | undefined {
  const index = HALL_TASK_ART.findIndex(task => task[0]===id);
  if(index<0) return;
  const [x,y,w,h] = thumbBoxes[index];
  return `<svg class="hall-task-artwork" viewBox="${x} ${y} ${w} ${h}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><image href="${escape(assets)}${HALL_TASK_ART[index][1]}.webp" x="0" y="0" width="1536" height="1024" /></svg>`;
}
export function hallCounterPreviewHTML(assets: string, color: RenovationColor): string {
  const clip = `counter-preview-${++instance}`;
  const paint = MAIN_LAYERS.find(layer=>layer.id==='counter-paint')!;
  return `<svg class="hall-task-artwork" viewBox="710 460 710 550" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${clip}"><path d="${paint.path}" /></clipPath></defs><image href="${escape(assets)}hall-polish-main-counter.webp" width="1536" height="1024" /><g class="hall-registered-layer hall-color-${color}"><image href="${escape(assets)}hall-room-main-empty.webp" width="1536" height="1024" clip-path="url(#${clip})" /></g></svg>`;
}
