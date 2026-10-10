import { BAKERY_YARD_LAYERS, BAKERY_OVEN_LAYERS, BAKERY_SHOP_LAYERS, bakeryTask } from './bakery-scene-layers';

export type BakeryView = 'bakery-yard'|'bakery-oven'|'bakery-shop';
export const isBakeryView = (view:string):view is BakeryView => view==='bakery-yard'||view==='bakery-oven'||view==='bakery-shop';
const sheets=['yard-awning-bare','yard-before','yard-clear-1','yard-clear-2','yard-clear-3','yard-clear-4','yard-cleared','yard-foundation-v2','yard-walls-v2','yard-roof','yard-ready','yard-finished-v2','yard-master-v2','oven-rough','oven-unlit','oven-clean','oven-bare','oven-master','shop-rough','shop-unlit','shop-clean','shop-furniture','shop-bare','shop-trays-clean','shop-stock','shop-trays','shop-master'];
export const BAKERY_ASSETS=[...sheets.map(name=>`bakery-${name}.webp`),'bakery-yard-survey.svg',...['oven','table','rack','sink','bread-counter','basket','packaging'].map(name=>`bakery-contact-${name}.svg`)];
interface TaskArt {id:string;view:BakeryView;source:string;anchor:{x:number;y:number};thumbBox:readonly[number,number,number,number]}
const viewFor=(n:number):BakeryView=>n<=10?'bakery-yard':n>=13&&n<=18?'bakery-oven':'bakery-shop';
const artData:readonly (readonly[string,number,number,number,number])[]=[
 ['yard-clear-1',335,540,650,250],['yard-clear-2',620,380,650,340],['yard-clear-3',1020,440,480,390],['yard-clear-4',420,430,470,300],['yard-cleared',290,510,1160,340],['yard-foundation-v2',280,540,1180,310],['yard-foundation-v2',280,540,1180,310],['yard-walls-v2',290,230,1180,610],['yard-roof',290,0,1180,830],['yard-ready',370,320,1030,470],
 ['shop-unlit',335,340,1170,650],['shop-clean',1070,45,350,210],['oven-bare',1020,0,515,780],['oven-master',510,397,365,300],['oven-master',558,225,300,210],['oven-bare',845,195,260,520],['oven-master',860,205,230,480],['oven-master',245,450,285,300],
 ['shop-furniture',140,450,650,520],['shop-trays-clean',105,480,680,490],['shop-master',20,140,745,600],['shop-master',625,365,485,310],['shop-master',984,365,110,118],['shop-master',1080,225,125,215],['shop-master',133,495,185,100],['shop-master',505,270,95,250],
];
export const BAKERY_TASK_ART:readonly TaskArt[]=artData.map(([source,x,y,w,h],i)=>({id:bakeryTask(i+1),view:viewFor(i+1),source:'bakery-'+source,anchor:{x:(x+w/2)/15.36,y:(y+h/2)/10.24},thumbBox:[x,y,w,h]}));
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function bakerySceneHTML(completed:readonly string[],assets:string,options:{view:BakeryView;pending?:string;justBuilt?:string;controls?:string}):string {
  const owned=new Set(completed),visible=(id:string)=>owned.has(id)||options.pending===id;
  const room=options.view.slice(7);
  const base=`bakery-${room}-${room==='yard'?'before':'rough'}`;
  const layers=options.view==='bakery-yard'?BAKERY_YARD_LAYERS:options.view==='bakery-oven'?BAKERY_OVEN_LAYERS:BAKERY_SHOP_LAYERS;
  const active=layers.filter(layer=>visible(layer.task)&&(!layer.parent||visible(layer.parent))&&(layer.id!=='bakery-yard-survey'||!owned.has(bakeryTask(7))));
  const plan={base:`${assets}${base}.webp`,layers:active.map(layer=>({id:layer.id,source:`${assets}${layer.source}${layer.source.endsWith('.svg')?'':'.webp'}`,path:layer.path,kind:layer.kind,alpha:options.pending===layer.task?.27:1,animate:options.justBuilt===layer.task}))};
  const metadata=active.map(layer=>`<span data-scene-task="${layer.task}" data-scene-object="${layer.object}" data-layer-id="${layer.id}" data-source-sheet="${layer.source}" data-layer-kind="${layer.kind}"${layer.parent?` data-layer-parent="${layer.parent}"`:''} class="hall-registered-layer${options.pending===layer.task?' scene-planned':''}"></span>`).join('');
  const label=options.view==='bakery-yard'?'Пекарня: фасад и строительство':options.view==='bakery-oven'?'Пекарня: рабочая кухня':'Пекарня: витрина и выдача';
  return `<div class="shop-composition hall-composition bakery-composition scene-reset" data-scene-view="${options.view}" data-room-id="bakery" data-art-version="bakery-rooms-2" data-scene-ready="false" role="${options.controls?'group':'img'}" aria-label="${label}"><div class="hall-world-stage"><img class="hall-loading-frame" src="${escape(assets)}${base}.webp" width="1536" height="1024" alt=""/><canvas class="hall-canvas-surface" width="1536" height="1024" aria-hidden="true"></canvas><script class="hall-canvas-plan" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script></div><div class="hall-canvas-metadata" hidden>${metadata}</div>${options.controls?`<div class="hall-goal-layer">${options.controls}</div>`:''}</div>`;
}
export function bakeryTaskArtwork(id:string,assets:string):string|undefined {
  const art=BAKERY_TASK_ART.find(task=>task.id===id);if(!art)return;
  return `<svg class="hall-task-artwork" viewBox="${art.thumbBox.join(' ')}" aria-hidden="true"><image href="${escape(assets)}${art.source}.webp" width="1536" height="1024"/></svg>`;
}
