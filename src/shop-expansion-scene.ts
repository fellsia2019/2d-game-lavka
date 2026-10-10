import { GROCERY_LAYERS, SERVICE_LAYERS, expansionTask } from './shop-expansion-layers';

export type ShopExpansionView = 'shop-grocery'|'shop-service';
export const isShopExpansionView = (view:string):view is ShopExpansionView => view==='shop-grocery'||view==='shop-service';
export const SHOP_EXPANSION_ASSETS = ['grocery-master','grocery-bare','grocery-structure','grocery-clean','grocery-cleared','grocery-before','service-master','service-base','service-counter','grocery-supported','grocery-stocked-v2','grocery-stocked-rack-v2','grocery-empty-rack-v2'].map(name=>`shop-expansion-${name}.webp`).concat([4,6,10,13,14,15,16,17].map(n=>`shop-expansion-contact-${n}${n===4?'-v2':''}.svg`));
interface TaskArt {id:string;view:ShopExpansionView;source:string;anchor:{x:number;y:number};thumbBox:readonly[number,number,number,number]}
const art=(n:number,source:string,x:number,y:number,box:TaskArt['thumbBox']):TaskArt=>({id:expansionTask(n),view:n<=11||n===18?'shop-grocery':'shop-service',source:`shop-expansion-${source}`,anchor:{x:x/1536*100,y:y/1024*100},thumbBox:box});
export const SHOP_EXPANSION_TASK_ART:readonly TaskArt[] = [
 art(1,'grocery-before',775,678,[70,444,1377,298]),
 art(2,'grocery-clean',770,821,[0,590,1536,434]),
 art(3,'grocery-clean',1080,300,[710,45,725,530]),
 art(4,'grocery-empty-rack-v2',1030,310,[718,31,660,670]),
 art(5,'grocery-stocked-rack-v2',1030,577,[725,480,585,220]),
 art(6,'grocery-bare',302,540,[62,387,514,343]),
 art(7,'grocery-stocked-rack-v2',1050,317,[736,126,584,414]),
 art(8,'grocery-bare',626,309,[530,140,190,334]),
 art(9,'grocery-stocked-v2',628,316,[544,185,166,285]),
 art(10,'grocery-stocked-v2',1383,538,[1289,364,192,365]),
 art(11,'grocery-master',1422,286,[1360,224,122,133]),
 art(12,'service-master',1327,367,[1220,296,183,131]),
 art(13,'service-counter',1100,471,[960,340,520,358]),
 art(14,'service-master',765,436,[644,348,247,180]),
 art(15,'service-master',932,461,[871,395,125,114]),
 art(16,'service-master',505,426,[410,300,188,240]),
 art(17,'service-master',1440,607,[1355,488,169,232]),
 art(18,'grocery-master',1074,377,[921,340,172,62]),
 art(19,'service-master',725,243,[525,128,395,218]),
 art(20,'service-master',60,110,[0,46,117,123]),
];
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function shopExpansionSceneHTML(completed:readonly string[],assets:string,options:{view:ShopExpansionView;pending?:string;justBuilt?:string;controls?:string}):string {
  const owned=new Set(completed),visible=(id:string)=>owned.has(id)||options.pending===id;
  const grocery=options.view==='shop-grocery';
  const base=`shop-expansion-${grocery?'grocery-before':'service-base'}`;
  const active=(grocery?GROCERY_LAYERS:SERVICE_LAYERS).filter(layer=>visible(layer.task)&&(!layer.parent||visible(layer.parent)));
  const rendered=active.map(layer=>({id:layer.id,source:`${assets}${layer.source}${layer.source.endsWith('.svg')?'':'.webp'}`,path:layer.path,kind:layer.kind,alpha:options.pending===layer.task?.27:1,animate:options.justBuilt===layer.task}));
  const plan={base:`${assets}${base}.webp`,layers:rendered};
  const metadata=active.map(layer=>`<span data-scene-task="${layer.task}" data-scene-object="${layer.object}" data-layer-id="${layer.id}" data-source-sheet="${layer.source}" data-layer-kind="${layer.kind}"${layer.parent?` data-layer-parent="${layer.parent}"`:''} class="hall-registered-layer${options.pending===layer.task?' scene-planned':''}"></span>`).join('');
  return `<div class="shop-composition hall-composition shop-expansion-composition scene-reset" data-scene-view="${options.view}" data-room-id="shop-expansion" data-art-version="shop-expansion-2" data-scene-ready="false" role="${options.controls?'group':'img'}" aria-label="${grocery?'Бакалея, чай и кофе':'Касса и вход с набережной'}"><div class="hall-world-stage"><img class="hall-loading-frame" src="${escape(assets)}${base}.webp" width="1536" height="1024" alt=""/><canvas class="hall-canvas-surface" width="1536" height="1024" aria-hidden="true"></canvas><script class="hall-canvas-plan" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script></div><div class="hall-canvas-metadata" hidden>${metadata}</div>${options.controls?`<div class="hall-goal-layer">${options.controls}</div>`:''}</div>`;
}
export function shopExpansionTaskArtwork(id:string,assets:string):string|undefined {
  const art=SHOP_EXPANSION_TASK_ART.find(task=>task.id===id);if(!art)return;

  return `<svg class="hall-task-artwork" viewBox="${art.thumbBox.join(' ')}" aria-hidden="true"><image href="${escape(assets)}${art.source}.webp" width="1536" height="1024"/></svg>`;
}
