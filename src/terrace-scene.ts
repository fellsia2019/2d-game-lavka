import { TERRACE_LAYERS, terraceTask } from './terrace-scene-layers';
export type TerraceView = 'terrace-deck';
export const isTerraceView = (view: string): view is TerraceView => view === 'terrace-deck';
export const TERRACE_ASSETS: readonly string[] = [...new Set(['terrace-before-v2.webp',...TERRACE_LAYERS.map(layer=>layer.source+(layer.source.endsWith('.svg')?'':'.webp'))])];
interface TaskArt { id: string; view: TerraceView; source: string; anchor: {x:number;y:number}; thumbBox: readonly [number,number,number,number] }
const artData:readonly (readonly [string,number,number,number,number])[]=[
 ['before',190,525,390,200],['before',360,290,450,250],['before',920,345,445,265],['before',780,555,420,185],
 ['level',210,360,1100,385],['level',210,360,1100,385],['foundation',160,330,1250,430],['frame',180,65,1215,610],
 ['empty',175,60,1230,155],['empty',485,625,585,150],['empty',390,397,780,250],['furniture-full',320,180,110,90],
 ['tables-only-v2',397,435,220,160],['furniture-bare',560,425,105,170],['furniture-bare',597,315,450,120],
 ['furniture-full',480,260,130,155],['furniture-bare',1174,280,100,150],['furniture-full',1035,275,158,160],
 ['furniture-full',610,244,162,105],['furniture-full',910,244,137,105],['furniture-full',412,397,190,95],
 ['furniture-full',260,392,155,212],['furniture-bare',380,263,110,155],['furniture-full',492,587,90,100],
 ['furniture-full',801,239,120,109],['master-v2',80,468,175,225],
];
export const TERRACE_TASK_ART: readonly TaskArt[] = artData.map(([source,x,y,w,h],index)=>({id:terraceTask(index+1),view:'terrace-deck',source:'terrace-'+source,anchor:{x:(x+w/2)/15.36,y:(y+h/2)/10.24},thumbBox:[x,y,w,h]}));
const escape = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function terraceSceneHTML(completed:readonly string[], assets:string, options:{view:TerraceView;pending?:string;justBuilt?:string;controls?:string}):string {
  const owned=new Set(completed),visible=(id:string)=>owned.has(id)||options.pending===id;
  const active=TERRACE_LAYERS.filter(layer=>visible(layer.task)&&(!layer.parent||visible(layer.parent))&&!(layer.id==='terrace-survey'&&owned.has(terraceTask(7))));
  const base=`${assets}terrace-before-v2.webp`;
  const plan={base,layers:active.map(layer=>({id:layer.id,source:`${assets}${layer.source}${layer.source.endsWith('.svg')?'':'.webp'}`,path:layer.path,kind:layer.kind,alpha:options.pending===layer.task?.27:1,animate:options.justBuilt===layer.task}))};
  const metadata=active.map(layer=>`<span data-scene-task="${layer.task}" data-scene-object="${layer.object}" data-layer-id="${layer.id}" data-source-sheet="${layer.source}" data-layer-kind="${layer.kind}"${layer.parent?` data-layer-parent="${layer.parent}"`:''} class="hall-registered-layer${options.pending===layer.task?' scene-planned':''}"></span>`).join('');
  return `<div class="shop-composition hall-composition terrace-composition scene-reset" data-scene-view="terrace-deck" data-room-id="terrace" data-art-version="terrace-rooms-3" data-scene-ready="false" role="${options.controls?'group':'img'}" aria-label="Гостевая терраса"><div class="hall-world-stage"><img class="hall-loading-frame" src="${escape(base)}" width="1536" height="1024" alt=""/><canvas class="hall-canvas-surface" width="1536" height="1024" aria-hidden="true"></canvas><script class="hall-canvas-plan" type="application/json">${JSON.stringify(plan).replace(/</g,'\\u003c')}</script></div><div class="hall-canvas-metadata" hidden>${metadata}</div>${options.controls?`<div class="hall-goal-layer">${options.controls}</div>`:''}</div>`;
}
export function terraceTaskArtwork(id:string, assets:string):string|undefined {
  const art=TERRACE_TASK_ART.find(task=>task.id===id);if(!art)return;
  return `<svg class="hall-task-artwork" viewBox="${art.thumbBox.join(' ')}" aria-hidden="true"><image href="${escape(assets)}${art.source}.webp" width="1536" height="1024"/></svg>`;
}
