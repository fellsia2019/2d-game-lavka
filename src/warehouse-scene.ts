import { STORAGE_LAYERS, COLD_LAYERS, WAREHOUSE_INTERIOR_TASK_ART } from './warehouse-layers';
import type { RegisteredLayer } from './hall-scene-layers';
import { EXTERIOR_SHADOWS, WAREHOUSE_SHADOW_ASSETS } from './warehouse-shadows';

export type WarehouseView = 'warehouse-yard' | 'warehouse' | 'warehouse-cold' | 'warehouse-receiving';
export const isWarehouseView = (view: string): view is WarehouseView =>
  ['warehouse-yard', 'warehouse', 'warehouse-cold', 'warehouse-receiving'].includes(view);
const task = (stage: number, n: number) => `warehouse-s${stage}-t${String(n).padStart(2,'0')}`;
const sheet = (name: string) => `warehouse-room-${name}`;
export const WAREHOUSE_ASSETS = [...['exterior-master','exterior-clean','exterior-tool-cupboard-v8','storage-master','storage-empty',
  'storage-clean','storage-before','storage-labels','storage-rack-bare','storage-pallet-only','storage-inspection-table-bare','storage-packing-bench-bare','storage-dry-crates-bare','storage-cans-bare','storage-packing-station-v6','cold-master','cold-empty','cold-clean','cold-before',
  'cold-cabinet-bare','cold-rack-bare','cold-ventilation','site-clear','site-before','site-foundation','site-walls','map-master','map-foundation','map-walls']
  .map(name => `${sheet(name)}.webp`), ...WAREHOUSE_SHADOW_ASSETS, 'warehouse-room-parking-v6.svg'];
const make = (id: string, stage: number, n: number, source: string, path: string,
  object: string, kind: RegisteredLayer['kind'], parent?: number): RegisteredLayer => ({
  id, task: task(stage,n), source:sheet(source), path, object,kind,
  ...(parent ? {parent:task(stage,parent)} : {}),
});
/** Front contact edge is shared across outline, foundation, walls and completed shell.
 * Every source is an original full plate; no layer has its own position or scale.
 */
export const WAREHOUSE_FOOTPRINT = {
  frame:[1536,1024], exterior:[[151,595],[304,661],[1435,625],[1290,551]],
  map:[[1023,223],[1110,244],[1418,256],[1433,161]],
} as const;
const footprint = 'M151 595 L304 661 L1435 625 L1290 551 Z';
const foundation = 'M144 510 L1130 491 L1435 567 L1435 625 L304 661 L151 595 Z';
const walls = 'M143 166 L239 96 L1294 163 L1435 270 L1435 625 L304 661 L151 595 Z';
const roof = 'M110 248 L205 76 L1379 145 L1486 282 L1454 306 L281 259 L208 127 L148 263 Z';
const openings = 'M180 302 L243 296 L243 507 L180 498 Z M533 299 L902 299 L902 650 L542 650 Z M1290 376 L1406 376 L1406 624 L1294 624 Z';
const entrancePendant = 'M700 261 Q710 255 719 266 L720 263 Q722 256 727 256 Q736 255 737 269 L737 284 L742 285 L743 291 L742 297 Q755 302 759 319 L759 323 Q728 331 697 323 L697 319 Q701 304 715 299 L716 292 L720 287 L719 279 Q712 290 703 286 Q690 283 696 270 Q697 264 700 261 Z';
const wallLantern = 'M929 349 Q934 347 937 353 L937 359 L946 368 L950 375 L947 415 L941 425 L925 425 L919 416 L915 376 L919 369 L927 359 Z';
const lanterns = `${entrancePendant} ${wallLantern}`;
const exteriorLayers: readonly RegisteredLayer[] = [
  make('warehouse-foundation',1,7,'site-foundation',foundation,'warehouse-footprint','architecture'),
  make('warehouse-walls',1,8,'site-walls',walls,'warehouse-shell','architecture'),
  make('warehouse-roof',1,9,'exterior-clean',roof,'warehouse-roof','architecture',8),
  make('warehouse-openings',1,10,'exterior-clean',openings,'warehouse-openings','architecture',8),
  make('warehouse-threshold',1,11,'exterior-clean','M544 621 L901 617 L920 653 L525 668 Z','warehouse-threshold','architecture',10),
  make('warehouse-entrance-light',1,12,'exterior-master',lanterns,'warehouse-lighting','light'),
  ...EXTERIOR_SHADOWS,
  make('warehouse-unloading-bay',1,20,'parking-v6.svg','M120 650 H685 V850 H120 Z','unloading-marking','architecture'),
  make('warehouse-door-bell',1,26,'exterior-master','M922 427 L937 427 L943 450 L947 454 L945 466 L938 469 L939 487 L933 496 L928 486 L928 471 L920 467 L919 455 L925 449 Z','supply-bell','equipment'),
  make('returns-rack',2,13,'exterior-master','M977 422 L994 422 L994 427 L1138 425 L1156 425 L1156 641 L1145 649 L1145 636 L994 642 L994 649 L981 650 Z','returns-rack','furniture'),
  make('receiving-wash-basin',2,14,'exterior-master','M1168 528 L1236 522 L1280 534 L1280 552 L1262 556 L1262 621 L1250 623 L1250 557 L1197 557 L1197 625 L1185 627 L1185 555 L1168 549 Z M1189 529 L1189 517 L1193 514 L1193 508 L1194 499 L1201 498 L1204 499 L1207 494 Q1216 488 1223 496 L1224 508 L1222 512 L1219 514 L1224 519 L1224 529 Z M1217 552 L1228 552 L1228 578 Q1229 585 1223 586 L1217 584 L1217 574 L1212 574 L1211 565 L1217 565 Z M1216 589 Q1229 586 1242 591 L1240 611 Q1238 623 1234 626 L1217 626 L1212 610 L1210 593 Q1216 584 1232 586 L1243 590 Z','wash-basin','furniture'),
  make('receiving-drying-rack',2,15,'exterior-master','M1171 397 L1283 395 L1284 417 L1275 418 L1275 447 L1262 449 L1262 432 L1195 434 L1195 458 L1181 460 L1180 449 L1171 449 L1171 432 L1180 429 L1180 416 L1171 417 Z M1261 416 L1276 416 L1276 462 L1261 464 Z M1201 423 L1249 423 L1251 479 L1246 483 L1200 483 Z M1259 418 L1273 418 L1273 427 L1269 430 L1270 455 Q1274 465 1268 485 Q1262 490 1258 484 L1257 475 L1263 448 L1262 432 L1259 427 Z','drying-rack','equipment',14),
  make('receiving-tool-cupboard',2,16,'exterior-tool-cupboard-v8','M358 378 L529 379 L529 390 L523 390 L523 655 L510 658 L509 649 L400 654 L400 663 L386 663 L385 656 L367 650 L367 390 L358 390 Z M367 465 Q371 463 373 467 L359 593 Q366 593 368 596 L368 608 Q365 611 365 612 L378 659 Q378 666 364 666 L333 662 Q328 661 330 655 L348 611 Q344 609 345 595 Q346 590 353 591 Z','receiving-tools','furniture'),
  make('receiving-awning',2,17,'exterior-master','M958 284 L1457 284 L1503 339 L1503 372 L1040 371 L1010 366 L958 311 Z M955 287 L974 287 L973 310 L1022 338 L1039 356 L1038 378 L1023 383 L972 420 L972 638 L955 642 L955 414 L958 407 L1009 365 L972 330 L970 304 L966 304 Z M1428 383 L1447 370 L1460 370 L1441 389 L1432 403 L1428 403 Z M1490 367 L1504 367 L1504 622 L1491 627 Z','receiving-awning','architecture'),
  make('receiving-wind-screen',2,18,'exterior-master','M1441 368 L1493 370 L1493 614 L1454 622 L1441 610 Z','wind-screen','architecture',17),
  make('receiving-task-light',2,19,'exterior-master',wallLantern,'receiving-light','light'),
  make('receiving-direction-post',2,20,'exterior-master','M17 528 L92 511 L123 548 L123 557 L81 574 L102 587 L104 604 L60 625 L61 813 L45 825 L32 822 L32 627 L16 632 L9 615 L17 608 L16 573 L14 562 Z','direction-post','equipment'),
];
const clearingPaths = [
  'M164 448 L319 442 L450 481 L468 571 L364 603 L174 574 Z',
  'M738 305 L859 286 L990 335 L995 476 L805 486 L735 453 Z',
  'M1085 421 L1265 413 L1422 516 L1393 592 L1208 604 L1074 557 Z',
  'M823 516 L958 496 L1063 543 L1081 608 L955 627 L823 598 Z',
  'M498 487 L658 476 L796 507 L798 580 L650 604 L487 566 Z',
];
const clearingAnchors = [[310,519],[868,399],[1238,519],[944,561],[637,548]];
interface TaskArt {id:string;view:WarehouseView;source:string;anchor:{x:number;y:number};thumbBox:readonly[number,number,number,number]}
const exteriorArt = (stage:number,n:number,source:string,x:number,y:number,box:TaskArt['thumbBox']):TaskArt => ({
  id:task(stage,n),view:'warehouse-yard',source:sheet(source),anchor:{x:x/1536*100,y:y/1024*100},thumbBox:box,
});
export const WAREHOUSE_TASK_ART: readonly TaskArt[] = [
  ...clearingAnchors.map(([x,y],index)=>exteriorArt(1,index+1,'site-before',x,y,[x-150,y-130,300,260])),
  exteriorArt(1,6,'site-foundation',820,598,[138,489,1321,186]),
  exteriorArt(1,7,'site-foundation',820,599,[138,489,1321,186]),
  exteriorArt(1,8,'site-walls',800,398,[138,91,1324,584]),
  exteriorArt(1,9,'exterior-clean',807,190,[96,62,1407,261]),
  exteriorArt(1,10,'exterior-clean',723,484,[527,284,393,384]),
  ...WAREHOUSE_INTERIOR_TASK_ART,
  {...exteriorArt(1,20,'parking-v6.svg',393,752,[120,650,565,200]),view:'warehouse-receiving'},
  {...exteriorArt(1,26,'exterior-master',933,457,[911,413,45,94]),view:'warehouse-receiving'},
  {...exteriorArt(2,16,'exterior-tool-cupboard-v8',440,521,[325,370,210,305]),view:'warehouse-receiving'},
  ...[
    [13,1063,532,969,413,198,249],[14,1224,570,1164,491,121,142],
    [15,1230,442,1163,389,131,108],
    [17,1227,338,949,277,565,144],[18,1465,491,1443,357,50,273],
    [19,932,383,911,343,47,91],[20,54,651,3,498,130,346],
  ].map(([n,x,y,bx,by,bw,bh])=>({...exteriorArt(2,n,'exterior-master',x,y,[bx,by,bw,bh]),view:'warehouse-receiving' as const})),
];
const names:Record<WarehouseView,string>={ 'warehouse-yard':'Строительство склада', warehouse:'Приёмка и хранение', 'warehouse-cold':'Холодильный склад', 'warehouse-receiving':'Разгрузочный двор'};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function warehouseSceneHTML(completed:readonly string[],assets:string,options:{view:WarehouseView;pending?:string;justBuilt?:string;controls?:string}):string {
  const owned=new Set(completed),visible=(id:string)=>owned.has(id)||options.pending===id;
  const exterior=options.view==='warehouse-yard'||options.view==='warehouse-receiving';
  const sourceLayers=exterior ? exteriorLayers : options.view==='warehouse' ? STORAGE_LAYERS : COLD_LAYERS;
  let base=exterior?'site-clear':options.view==='warehouse' ? (owned.has(task(1,11))?'storage-clean':'storage-before'):'cold-before';
  if (options.view==='warehouse-cold'&&owned.has(task(2,1))) base='cold-clean';
  const active=sourceLayers.filter(layer=>visible(layer.task)&&(!layer.parent||visible(layer.parent)));
  if(exterior&&!owned.has(task(1,7))) clearingPaths.forEach((path,index)=>{
    if(!owned.has(task(1,index+1))) active.unshift(make(`site-obstacle-${index+1}`,1,index+1,'site-before',path,'site-obstacle','architecture'));
  });
  const plan={base:`${assets}${sheet(base)}.webp`,layers:active.map(layer=>({
    id:layer.id,source:`${assets}${layer.source}${layer.source.endsWith('.svg')?'':'.webp'}`,path:layer.path,kind:layer.kind,
    alpha:options.pending===layer.task && !layer.id.startsWith('site-obstacle') ? .27:1,
    ...(layer.brightness ? {brightness:layer.brightness} : {}),
    animate:options.justBuilt===layer.task,
  }))};
  const metadata=active.map(layer=>`<span data-scene-task="${layer.task}" data-layer-id="${layer.id}" data-source-sheet="${layer.source}" data-layer-kind="${layer.kind}"${layer.parent?` data-layer-parent="${layer.parent}"`:''} class="warehouse-registered-layer${options.pending===layer.task?' scene-planned':''}"></span>`).join('');
  const outline=exterior&&visible(task(1,6))&&!owned.has(task(1,7))?`<svg class="warehouse-outline${!owned.has(task(1,6))?' scene-planned':''}" viewBox="0 0 1536 1024" aria-hidden="true" data-scene-task="${task(1,6)}"><path d="${footprint}" fill="none" stroke="#fff4c8" stroke-width="7" stroke-dasharray="20 12"/><path d="${footprint}" fill="none" stroke="#9c743e" stroke-width="2"/></svg>`:'';
  return `<div class="shop-composition hall-composition warehouse-composition scene-reset" data-scene-view="${options.view}" data-room-id="${exterior?'warehouse-exterior':options.view}" data-art-version="warehouse-rooms-8" data-scene-ready="false" data-footprint="warehouse-fixed-1" role="${options.controls?'group':'img'}" aria-label="${names[options.view]}"><div class="hall-world-stage"><img class="hall-loading-frame" src="${assets}${sheet(base)}.webp" width="1536" height="1024" alt=""/><canvas class="hall-canvas-surface" width="1536" height="1024" aria-hidden="true"></canvas>${outline}<script class="hall-canvas-plan" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script></div><div class="hall-canvas-metadata" hidden>${metadata}</div>${options.controls?`<div class="hall-goal-layer">${options.controls}</div>`:''}</div>`;
}
export function warehouseTaskArtwork(id:string,assets:string):string|undefined {
  const art=WAREHOUSE_TASK_ART.find(task=>task.id===id);if(!art)return;
  return `<svg class="hall-task-artwork" viewBox="${art.thumbBox.join(' ')}" aria-hidden="true"><image href="${escape(assets)}${art.source}${art.source.endsWith('.svg')?'':'.webp'}" width="1536" height="1024"/></svg>`;
}
let mapInstance=0;
export function warehouseMapArtHTML(completed:readonly string[],assets:string):string {
  const owned=new Set(completed);if(!owned.has(task(1,6)))return '';
  const id=`warehouse-map-${++mapInstance}`;
  const state=owned.has(task(1,8))?'map-walls':'map-foundation';
  const layers:{source:string;path:string;task:string}[]=[];
  if(owned.has(task(1,7)))layers.push({source:sheet(state),path:'M996 55 L1458 55 L1458 267 L1004 247 Z',task:task(1,7)});
  if(owned.has(task(1,9)))layers.push({source:sheet('map-master'),path:'M1007 112 L1073 56 L1429 61 L1434 132 L1109 130 L1068 87 L1021 120 Z',task:task(1,9)});
  if(owned.has(task(1,10)))layers.push({source:sheet('map-master'),path:'M1052 130 L1093 130 L1093 195 L1052 195 Z M1189 140 L1324 140 L1324 251 L1189 251 Z',task:task(1,10)});
  if(owned.has(task(1,12)))layers.push({source:sheet('map-master'),path:'M1244 125 L1267 125 L1267 148 L1244 148 Z',task:task(1,12)});
  return `<svg class="warehouse-map-plate" viewBox="0 0 1536 1024" aria-hidden="true" data-footprint="warehouse-fixed-map-1"><defs>${layers.map((layer,index)=>`<clipPath id="${id}-${index}"><path d="${layer.path}"/></clipPath>`).join('')}</defs>${layers.map((layer,index)=>`<image href="${assets}${layer.source}.webp" width="1536" height="1024" clip-path="url(#${id}-${index})" data-scene-task="${layer.task}"/>`).join('')}${!owned.has(task(1,7))?'<path d="M1024 220 L1110 242 L1418 256 L1430 160 L1120 151 Z" fill="none" stroke="#fff4bd" stroke-width="4" stroke-dasharray="12 8"/>':''}</svg>`;
}
