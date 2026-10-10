import { FRUIT_LAYERS,FRUIT_CONTACT_TASKS,fruitTask,type FruitView } from './fruit-scene-layers';
export type { FruitView } from './fruit-scene-layers';
export const isFruitView=(view:string):view is FruitView=>['fruit-yard','fruit-market','fruit-extension-site','fruit-extension'].includes(view);
export const FRUIT_ASSETS=['market-table-stock-v2','market-table-empty-v2','hall-left-stock-v2','hall-left-empty-v2','hall-rack-only-v2','pavilion-master','pavilion-roof','pavilion-frame','pavilion-foundation','pavilion-clear','pavilion-before','pavilion-cleared-1','pavilion-cleared-2','pavilion-cleared-3','pavilion-cleared-4','market-master','market-supported','market-bare','market-structure','market-empty-v2','market-before-v2','extension-master','extension-roof','extension-unlit','extension-frame','extension-walls','extension-foundation','extension-plinth','extension-clear','extension-before','hall-master','hall-bare','hall-structure','hall-empty','hall-before'].map(name=>`fruit-room-${name}.webp`).concat(FRUIT_CONTACT_TASKS.map(([stage,n])=>`fruit-room-contact-${stage}-${n}.svg`),['fruit-room-outline.svg']);
interface TaskArt {id:string;view:FruitView;source:string;anchor:{x:number;y:number};thumbBox:readonly[number,number,number,number]}
const art=(stage:number,n:number,view:FruitView,source:string,x:number,y:number,thumbBox:TaskArt['thumbBox']):TaskArt=>({id:fruitTask(stage,n),view,source:`fruit-room-${source}`,anchor:{x:x/1536*100,y:y/1024*100},thumbBox});
/** Anchors/crops measured in original plates, never inherited from old sprites. */
export const FRUIT_TASK_ART:readonly TaskArt[]=[
 art(1,1,'fruit-yard','pavilion-before',240,650,[22,545,427,208]),
 art(1,2,'fruit-yard','pavilion-before',745,518,[460,370,590,276]),
 art(1,3,'fruit-yard','pavilion-before',1275,568,[1030,429,506,270]),
 art(1,4,'fruit-yard','pavilion-before',1048,744,[748,640,625,222]),
 art(1,5,'fruit-yard','pavilion-clear',657,658,[447,608,343,143]),
 {...art(1,6,'fruit-yard','pavilion-foundation',784,669,[63,524,1430,304]),source:'fruit-room-outline.svg'},
 art(1,7,'fruit-yard','pavilion-foundation',780,680,[63,535,1430,290]),
 art(1,8,'fruit-yard','pavilion-frame',770,416,[163,59,1288,665]),
 art(1,9,'fruit-yard','pavilion-master',817,204,[160,57,1280,308]),
 art(1,10,'fruit-yard','pavilion-master',562,722,[330,651,467,153]),
 art(1,11,'fruit-yard','pavilion-master',805,638,[75,551,1396,260]),
 art(1,12,'fruit-yard','pavilion-master',1030,320,[979,243,111,126]),
 art(1,13,'fruit-market','market-structure',794,485,[550,403,487,169]),
 art(1,14,'fruit-market','market-bare',795,411,[558,364,474,104]),
 art(1,15,'fruit-market','market-master',790,411,[564,365,465,99]),
 art(1,16,'fruit-market','market-master',486,411,[393,298,192,253]),
 art(1,17,'fruit-market','market-master',143,616,[18,414,246,390]),
 art(1,18,'fruit-market','market-table-empty-v2',1192,501,[1045,416,301,196]),
 art(1,19,'fruit-market','market-table-stock-v2',1148,412,[1075,362,248,93]),
 art(1,20,'fruit-market','market-master',680,714,[324,558,661,341]),
 art(1,21,'fruit-market','market-master',800,411,[725,367,153,89]),
 art(1,22,'fruit-market','market-structure',1428,409,[1317,188,219,429]),
 art(1,23,'fruit-market','market-master',1449,765,[1365,667,164,185]),
 art(1,24,'fruit-market','market-master',1371,629,[1229,441,278,366]),
 art(1,25,'fruit-market','market-master',340,573,[180,429,320,290]),
 art(1,26,'fruit-market','market-master',828,175,[722,99,215,130]),
 art(2,1,'fruit-extension-site','extension-before',789,668,[284,488,1063,341]),
 art(2,2,'fruit-extension-site','extension-plinth',840,727,[279,584,1073,222]),
 art(2,3,'fruit-extension-site','extension-foundation',812,662,[279,577,1073,229]),
 art(2,4,'fruit-extension-site','extension-frame',817,414,[238,36,1151,769]),
 art(2,5,'fruit-extension-site','extension-walls',821,439,[283,259,1062,544]),
 art(2,6,'fruit-extension-site','extension-master',520,478,[336,315,374,335]),
 art(2,7,'fruit-extension-site','extension-master',837,184,[230,32,1165,302]),
 art(2,8,'fruit-extension-site','extension-master',896,556,[707,320,381,451]),
 art(2,9,'fruit-extension-site','extension-master',574,859,[1,749,1047,275]),
 art(2,10,'fruit-extension','hall-empty',765,790,[0,540,1536,484]),
 art(2,11,'fruit-extension','hall-rack-only-v2',342,531,[135,370,409,329]),
 art(2,12,'fruit-extension','hall-left-empty-v2',122,598,[7,452,228,293]),
 art(2,13,'fruit-extension','hall-left-stock-v2',329,518,[23,373,520,327]),
 art(2,14,'fruit-extension','hall-structure',1264,530,[1116,350,299,368]),
 art(2,15,'fruit-extension','hall-master',1264,479,[1136,391,244,160]),
 art(2,16,'fruit-extension','hall-master',1027,517,[911,384,226,243]),
 art(2,17,'fruit-extension','hall-master',1430,582,[1325,400,211,368]),
 art(2,18,'fruit-extension','hall-master',762,91,[690,0,139,151]),
 art(2,19,'fruit-market','market-master',158,318,[60,177,201,253]),
 art(2,20,'fruit-extension','hall-master',785,202,[684,131,200,126]),
];
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function fruitSceneHTML(completed:readonly string[],assets:string,options:{view:FruitView;pending?:string;justBuilt?:string;controls?:string}):string {
 const owned=new Set(completed),visible=(id:string)=>owned.has(id)||options.pending===id;
 const base=({'fruit-yard':'pavilion-before','fruit-market':'market-before-v2','fruit-extension-site':'extension-before','fruit-extension':'hall-before'} as const)[options.view];
 const active=FRUIT_LAYERS[options.view].filter(layer=>visible(layer.task)&&(!layer.parent||visible(layer.parent)));
 const layers=active.map(layer=>({id:layer.id,source:`${assets}${layer.source}${layer.source.endsWith('.svg')?'':'.webp'}`,path:layer.path,kind:layer.kind,alpha:options.pending===layer.task?.27:1,animate:options.justBuilt===layer.task}));
 const metadata=active.map(layer=>`<span data-scene-task="${layer.task}" data-scene-object="${layer.object}" data-layer-id="${layer.id}" data-source-sheet="${layer.source}" data-layer-kind="${layer.kind}"${layer.parent?` data-layer-parent="${layer.parent}"`:''} class="hall-registered-layer${options.pending===layer.task?' scene-planned':''}"></span>`).join('');
 const plan={base:`${assets}fruit-room-${base}.webp`,layers};
 return `<div class="shop-composition hall-composition fruit-composition scene-reset" data-scene-view="${options.view}" data-room-id="fruit-rooms" data-art-version="fruit-rooms-1" data-scene-ready="false" role="${options.controls?'group':'img'}" aria-label="Фруктовый павильон и пристройка"><div class="hall-world-stage"><img class="hall-loading-frame" src="${escape(assets)}fruit-room-${base}.webp" width="1536" height="1024" alt=""/><canvas class="hall-canvas-surface" width="1536" height="1024" aria-hidden="true"></canvas><script class="hall-canvas-plan" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script></div><div class="hall-canvas-metadata" hidden>${metadata}</div>${options.controls?`<div class="hall-goal-layer">${options.controls}</div>`:''}</div>`;
}
export function fruitTaskArtwork(id:string,assets:string):string|undefined {
 const art=FRUIT_TASK_ART.find(task=>task.id===id);if(!art)return;
 return `<svg class="hall-task-artwork" viewBox="${art.thumbBox.join(' ')}" aria-hidden="true"><image href="${escape(assets)}${art.source}${art.source.endsWith('.svg')?'':'.webp'}" width="1536" height="1024"/></svg>`;
}
