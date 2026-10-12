import type { RenovationColor, RenovationId } from './renovations';
import type { SceneShopDecorations } from './scene-shop';
import type { SceneMaterial } from './scene-material';
import { MAIN_LAYERS, PREP_LAYERS, MAIN_FLOOR_FINISH, PREP_FLOOR_FINISH, MAIN_COUNTER_FINISH, PREP_COUNTER_FINISH, PREP_COUNTER_TOOLS } from './hall-scene-layers';
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
  const customLight=!!decor.lighting;
  const cores=prep?[[620,145,28,12],[269,232,24,27],[1030,207,24,25]]:[[834,169,25,14],[1099,180,22,21],[1449,310,24,24]];
  const washes=prep?[[620,250,190,210],[269,300,135,160],[1030,275,145,170]]:[[835,258,185,210],[1100,238,145,150],[1450,367,130,160]];
  const lamps=prep?[[620,155,205,165],[260,243,130,110],[1030,212,145,130]]:[[835,167,215,165],[1100,190,130,110],[1450,317,130,110]];
  return `<svg class="hall-surface-effects" viewBox="0 0 1536 1024" aria-hidden="true"><defs><filter id="${id}-shadow"><feGaussianBlur stdDeviation="10"/></filter><radialGradient id="${id}-glow"><stop stop-color="${glow}" stop-opacity=".85"/><stop offset=".38" stop-color="${glow}" stop-opacity=".35"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient><radialGradient id="${id}-core"><stop stop-color="#fffdf1" stop-opacity=".95"/><stop offset=".42" stop-color="#fffdf1" stop-opacity=".62"/><stop offset="1" stop-color="#fffdf1" stop-opacity="0"/></radialGradient></defs>${counter?`<path data-scene-task="shop-s1-r09" data-contact-shadow="counter" d="M734 723 L773 736 L1178 926 L1212 948 L1377 845 L1407 865 L1231 989 L1171 955 L716 750 Z" fill="#51341f" opacity="${owned.has('shop-s1-r09')?.36:.1}" filter="url(#${id}-shadow)"/>`:''}${light?`<g data-scene-task="shop-s1-r14" data-light-glow="installed" opacity="${pendingLight?strength*.27:strength}">${customLight?washes.map(([cx,cy,rx,ry])=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" opacity=".45" fill="url(#${id}-glow)"/>`).join(''):''}${lamps.map(([cx,cy,rx,ry])=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}-glow)"/>`).join('')}</g>${customLight?`<g data-light-core="installed" opacity="${pendingLight?.27:1}">${cores.map(([cx,cy,rx,ry])=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}-core)"/>`).join('')}</g>`:''}`:''}</svg>`;
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
    colorize: undefined as SceneMaterial|undefined,
    animate:options.justBuilt===layer.task,
  }))};
  // Repair donors contain overlapping pieces of floor. A material is a distinct
  // complete surface pass after all architecture, before any furniture.
  if(visible('shop-s1-r01') && decor.floor) {
    const position=plan.layers.findIndex(layer=>layer.kind!=='architecture');
    plan.layers.splice(position<0?plan.layers.length:position,0,{
      id:'floor-finish',source:`${assets}hall-room-${prep?'prep':'main'}-clean.webp`,
      path:prep?PREP_FLOOR_FINISH:MAIN_FLOOR_FINISH,kind:'architecture',
      alpha:options.pending==='shop-s1-r01'?.27:1,
      colorize:decor.floor.colorize,animate:false,
    });
  }
  const tableId=prep?'packing-station':'counter';
  const tableTask=prep?'shop-s1-r11':'shop-s1-r09';
  if(visible(tableTask) && decor.counterTop) {
    const position=plan.layers.findIndex(layer=>layer.id===tableId)+1;
    plan.layers.splice(position,0,{
      id:'counter-top-finish',source:`${assets}${prep?'hall-room-prep-master':'hall-polish-main-counter'}.webp`,
      path:prep?PREP_COUNTER_FINISH:MAIN_COUNTER_FINISH,kind:'furniture',
      alpha:options.pending===tableTask?.27:1,
      colorize:decor.counterTop.colorize,animate:false,
    });
    if(prep) plan.layers.splice(position+1,0,{
      id:'packing-tools-occluder',source:`${assets}hall-room-prep-master.webp`,
      path:PREP_COUNTER_TOOLS,kind:'occluder',
      alpha:options.pending===tableTask?.27:1,colorize:undefined,animate:false,
    });
  }
  if(visible('shop-s1-r14') && decor.lighting) {
    const sea=decor.lighting.id==='lighting-sea';
    plan.layers.push({
      id:'lamp-glass-finish',source:`${assets}hall-polish-${prep?'prep':'main'}-lighting.webp`,
      path:prep
        ? 'M540 143 Q622 125 706 143 L706 147 Q620 173 540 148 Z M250 208 Q267 212 283 209 Q301 222 305 255 Q305 260 269 263 Q246 262 234 257 Q236 224 250 208 Z M1014 182 Q1031 185 1046 182 Q1061 197 1065 229 Q1068 234 1031 237 Q1006 236 995 231 Q996 198 1014 182 Z'
        : 'M795 157 Q835 171 879 158 Q865 187 832 185 Q806 181 795 157 Z M1088 158 Q1100 163 1115 158 Q1121 175 1124 183 Q1126 188 1129 191 Q1130 200 1100 204 Q1077 202 1069 196 Q1065 191 1074 184 Q1078 164 1088 158 Z M1433 286 Q1447 291 1461 286 Q1469 303 1470 313 Q1473 316 1485 325 Q1487 329 1453 335 Q1427 334 1414 326 Q1409 322 1419 314 Q1423 294 1433 286 Z',
      kind:'equipment',alpha:options.pending==='shop-s1-r14'?.27:1,
      colorize:{shadow:sea?0x347b93:0xb56a20,highlight:sea?0x98f3f3:0xffd276,amount:.9},animate:false,
    });
  }
  const effects = hallSurfaceEffects(owned,options,prep,decor);
  const metadata = active.map(layer => `<span data-scene-task="${layer.task}" data-scene-object="${layer.object}" data-layer-kind="${layer.kind}" data-layer-id="${layer.id}" data-source-sheet="${layer.source}"${layer.parent?` data-layer-parent="${layer.parent}"`:''} class="hall-registered-layer${layer.kind==='counter'?` hall-color-${decorations.counter ?? 'sea'}`:''}${options.pending===layer.task?' scene-planned':''}"></span>`).join('');
  return `<div class="shop-composition hall-composition scene-reset hall-angle-${prep?2:1}" data-scene-view="${options.view}" data-room-id="shop-hall" data-art-version="shop-materials-2" data-scene-ready="false" role="${options.controls?'group':'img'}" aria-label="Торговый зал. ${prep?'Подготовка заказов':'Вход и витрины'}"><div class="hall-world-stage"><img class="hall-loading-frame" src="${escape(assets)}${base}.webp" width="1536" height="1024" alt="" /><canvas class="hall-canvas-surface" width="1536" height="1024" aria-hidden="true"></canvas>${effects}<script class="hall-canvas-plan" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script></div><div class="hall-canvas-metadata" hidden>${metadata}</div>${options.controls?`<div class="hall-goal-layer">${options.controls}</div>`:''}</div>`;
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
