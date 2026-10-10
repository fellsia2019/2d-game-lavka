import { icon } from './icons';
import { sceneTaskAnchor } from './campaign-scene';
export type RevealPhase = 'preparing' | 'revealing';
export interface SceneReveal { taskId:string; name:string; phase:RevealPhase; }
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Later campaign rooms use DOM sprites; retain their decoded images as well. */
export function retainSpriteScene(previous:HTMLElement,next:HTMLElement):boolean {
  if(previous.dataset.sceneView!==next.dataset.sceneView||!previous.classList.contains('stage-composition')||!next.classList.contains('stage-composition'))return false;
  const layers=previous.querySelector('.scene-art-layers');
  const fresh=next.querySelector('.scene-art-layers');
  if(!layers||!fresh)return false;
  const key=(image:HTMLImageElement)=>JSON.stringify([new URL(image.getAttribute('src')!,document.baseURI).href,image.getAttribute('style'),image.dataset.sceneTask]);
  const old=new Map([...layers.querySelectorAll<HTMLImageElement>('img')].map(image=>[key(image),image]));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('reduced-motion');
  for(const image of fresh.querySelectorAll<HTMLImageElement>('img')) {
    const current=old.get(key(image));old.delete(key(image));
    const target=current??image;
    const before=current?getComputedStyle(current):null;
    const from={opacity:before?.opacity??'0',filter:before?.filter??'none'};
    target.className=image.className;target.classList.remove('scene-built-pop');
    layers.append(target);
    const after=getComputedStyle(target);
    if(!reduced)target.animate([from,{opacity:after.opacity,filter:after.filter}],{duration:850,easing:'ease-out'});
  }
  for(const image of old.values()) {
    if(reduced)image.remove();
    else {const animation=image.animate([{opacity:getComputedStyle(image).opacity},{opacity:0}],{duration:850,fill:'both'});animation.finished.then(()=>image.remove()).catch(()=>image.remove());}
  }
  const controls=previous.querySelector('.scene-interaction-layer'),newControls=next.querySelector('.scene-interaction-layer');
  if(controls&&newControls)controls.replaceWith(newControls);else if(controls)controls.remove();else if(newControls)previous.append(newControls);
  return true;
}
export async function decodeSpriteScene(scene:HTMLElement):Promise<void> {
  // Template contents have an inert owner document: explicitly activate their
  // image requests while retaining the currently displayed room.
  document.adoptNode(scene);
  await Promise.all([...scene.querySelectorAll<HTMLImageElement>('img')].map(image=>{
    image.src=image.getAttribute('src')!;return image.decode();
  }));
}
/** Keep the painted room intact; only transient effects end here. */
export function finishSceneReveal(root:HTMLElement):void {
  root.querySelectorAll('.scene-reveal-notice,.scene-reveal-effects').forEach(node=>node.remove());
  const scene=root.querySelector<HTMLElement>('.world-scene > .shop-composition');
  if(scene)delete scene.dataset.purchasePhase;
  scene?.querySelectorAll('.scene-built-pop').forEach(node=>node.classList.remove('scene-built-pop'));
}
/** Presentation only. The controller owns the single atomic purchase. */
export function presentSceneReveal(root:HTMLElement, state:SceneReveal):void {
  root.querySelectorAll('.scene-reveal-notice,.scene-reveal-effects').forEach(node=>node.remove());
  const scene=root.querySelector<HTMLElement>('.world-scene > .shop-composition');
  if(!scene)return;
  scene.dataset.purchasePhase=state.phase;
  if(state.phase==='preparing') {
    const notice=document.createElement('section');
    notice.className='scene-reveal-notice is-preparing';
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    notice.innerHTML=`<span class="scene-reveal-icon">${icon('palette')}</span><div><small>Сейчас улучшим</small><strong>${escape(state.name)}</strong></div>`;
    root.append(notice);
  }
  const effects=document.createElement('div');
  effects.className=`scene-reveal-effects is-${state.phase}`;
  effects.setAttribute('aria-hidden','true');
  const script=scene.querySelector<HTMLScriptElement>('.hall-canvas-plan');
  const metadata=[...scene.querySelectorAll<HTMLElement>(`[data-scene-task="${state.taskId}"][data-layer-id]`)].map(layer=>layer.dataset.layerId);
  let paths:string[]=[];
  if(script) {
    const plan=JSON.parse(script.textContent!) as {layers:{id:string;path:string;kind?:string;brightness?:number}[]};
    paths=plan.layers.filter(layer=>metadata.includes(layer.id)&&layer.kind!=='shadow'&&!(layer.kind==='light'&&layer.brightness)).map(layer=>layer.path);
  }
  const {x,y}=sceneTaskAnchor(state.taskId);
  const sparkles=state.phase==='revealing'?Array.from({length:12},(_,i)=>`<i style="--i:${i};--a:${i*30}deg;--distance:${48+(i%3)*14}px">${icon(i%3?'star':'check')}</i>`).join(''):'';
  effects.innerHTML=`${paths.length?`<svg viewBox="0 0 1536 1024"><g>${paths.map(path=>`<path d="${escape(path)}"/>`).join('')}</g></svg>`:''}<div class="scene-reveal-burst" style="left:${x}%;top:${y}%"><span></span>${sparkles}</div>`;
  scene.append(effects);
}
