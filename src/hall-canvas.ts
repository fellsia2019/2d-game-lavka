import { Application, Assets, ColorMatrixFilter, Container, Graphics, Sprite, Texture, isWebGLSupported } from "pixi.js";

const WIDTH = 1536;
const HEIGHT = 1024;
const FADE_MS = 850;
type Paint = "sea" | "honey" | "coral";
interface Layer { id: string; source: string; path: string; alpha: number; kind?: string; color?: Paint; brightness?: number; hue?: number; saturation?: number; animate?: boolean; }
interface Plan { base: string; layers: Layer[]; }
interface Frame { bases: {source:string;alpha:number}[]; layers:Layer[]; exposure:number; }
interface Mount {
  canvas: HTMLCanvasElement;
  outer: HTMLElement;
  script: HTMLScriptElement;
  text: string;
  plan: Plan;
  promise: Promise<void>;
  cancelled: boolean;
  app?: Application;
  initialized?: boolean;
  gl?: WebGLRenderingContext | WebGL2RenderingContext;
  filters: ColorMatrixFilter[];
  frame?: number;
  removeContextListener?: () => void;
  draw?: (frame:Frame, loaded:Map<string,Texture>) => void;
  loaded?: Map<string,Texture>;
  revision?: number;
  pendingDOM?: () => void;
  painted?: Frame;
  resolution?: number;
  stopSampling?: () => void;
}
const mounts = new WeakMap<HTMLCanvasElement, Mount>();
const active = new Set<Mount>();
const usedSurfaces = new WeakSet<HTMLCanvasElement>();
const observers = new WeakMap<Document, MutationObserver>();
const textures = new Map<string, Promise<Texture>>();

function valid(record: Mount): boolean {
  return !record.cancelled && record.canvas.isConnected && record.outer.contains(record.canvas) &&
    mounts.get(record.canvas) === record && record.script.isConnected;
}
function releaseRenderer(record: Mount): void {
  if (record.frame !== undefined) cancelAnimationFrame(record.frame);
  record.frame = undefined;
  record.stopSampling?.();
  record.stopSampling = undefined;
  record.removeContextListener?.();
  record.removeContextListener = undefined;
  // An Application must finish init before its plugin/renderer destroy methods
  // are usable. Keep its GL context alive too: Pixi 8.22's shader-limit probe
  // loops forever if init resumes with a context we have already lost.
  // A detached pending init destroys itself immediately on resolve.
  if (record.app && !record.initialized) return;
  // FilterSystem returns its input texture to the pool while its bind group
  // still references it. Unbind before renderer.destroy prunes that pool.
  const inputGroups = new Set(record.filters.map(filter => filter.groups[0]).filter(Boolean));
  for (const group of inputGroups) group.destroy();
  for (const filter of record.filters) filter.destroy();
  record.filters = [];
  if (record.app && record.initialized) {
    const app = record.app;
    record.app = undefined;
    record.initialized = false;
    app.destroy(false, { children: true, texture: false, textureSource: false, context: true });
  }
  if (record.gl && !record.gl.isContextLost()) record.gl.getExtension("WEBGL_lose_context")?.loseContext();
  record.gl = undefined;
  if (record.cancelled) { record.canvas.width = 0; record.canvas.height = 0; }
}
function dispose(record: Mount): void {
  if (record.cancelled) return;
  record.cancelled = true;
  releaseRenderer(record);
  active.delete(record);
  if (mounts.get(record.canvas) === record) mounts.delete(record.canvas);
  if (!record.app) { record.canvas.width = 0; record.canvas.height = 0; }
  if (record.outer.isConnected) record.outer.dataset.sceneReady = "false";
}
function prune(): void {
  for (const record of active) if (!valid(record)) dispose(record);
}
function observe(doc: Document): void {
  if (observers.has(doc)) return;
  const observer = new MutationObserver(prune);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  observers.set(doc, observer);
  doc.defaultView?.addEventListener("pagehide", () => {
    for (const record of active) if (record.canvas.ownerDocument === doc) dispose(record);
  });
  doc.defaultView?.addEventListener("pageshow", () => { void mountHallCanvases(doc); });
}
function replacement(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const next = canvas.cloneNode(false) as HTMLCanvasElement;
  next.width = WIDTH;
  next.height = HEIGHT;
  canvas.replaceWith(next);
  return next;
}
/** Keep artwork coordinates fixed, but sample into the pixels actually displayed.
 * CSS reducing a 1536px canvas to 360px samples only a few source pixels and
 * breaks thin boards/seams into dots. Mipmaps/high-quality 2D reduction happen
 * before presentation instead. No blur, camera change or new scene is involved.
 */
function samplingResolution(record: Mount): number {
  const bounds = record.canvas.getBoundingClientRect();
  const density = record.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  return Math.max(1 / WIDTH, Math.min(1, bounds.width * density / WIDTH, bounds.height * density / HEIGHT));
}
function watchSampling(record: Mount, resize: (resolution: number) => void): void {
  const refresh = () => {
    if (!valid(record)) return;
    const resolution = samplingResolution(record);
    if (Math.abs(resolution - record.resolution!) < 1e-6) return;
    record.resolution = resolution;
    resize(resolution);
    if (record.painted && record.loaded) record.draw!(record.painted, record.loaded);
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(record.outer);
  const win = record.canvas.ownerDocument.defaultView;
  win?.addEventListener('resize', refresh);
  record.stopSampling = () => { observer.disconnect(); win?.removeEventListener('resize', refresh); };
}
function readPlan(text: string): Plan {
  const plan: unknown = JSON.parse(text);
  if (!plan || typeof plan !== "object") throw new Error("Missing hall canvas plan");
  const p = plan as Plan;
  if (typeof p.base !== "string" || !p.base || !Array.isArray(p.layers)) throw new Error("Invalid hall canvas sources");
  for (const layer of p.layers) {
    if (!layer || typeof layer.id !== "string" || !layer.id || typeof layer.source !== "string" || !layer.source ||
      typeof layer.path !== "string" || !layer.path || !Number.isFinite(layer.alpha) || layer.alpha < 0 || layer.alpha > 1 ||
      (layer.color !== undefined && !["sea", "honey", "coral"].includes(layer.color)) ||
      (layer.kind !== undefined && typeof layer.kind !== "string") ||
      (layer.brightness !== undefined && (!Number.isFinite(layer.brightness) || layer.brightness < 0)) ||
      (layer.hue !== undefined && !Number.isFinite(layer.hue)) ||
      (layer.saturation !== undefined && (!Number.isFinite(layer.saturation) || layer.saturation < 0)) ||
      (layer.animate !== undefined && typeof layer.animate !== "boolean")) throw new Error("Invalid registered hall layer");
  }
  return p;
}
function texture(url: string): Promise<Texture> {
  let pending = textures.get(url);
  if (!pending) {
    pending = Assets.load<Texture>(url).then(value => {
      if (!(value instanceof Texture) || value.width !== WIDTH || value.height !== HEIGHT)
        throw new Error(`Unregistered hall sheet: ${url}`);
      value.source.autoGenerateMipmaps = true;
      value.source.scaleMode = 'linear';
      return value;
    });
    textures.set(url, pending);
    void pending.catch(() => { if (textures.get(url) === pending) textures.delete(url); });
  }
  return pending;
}
async function sheets(plan: Plan): Promise<Map<string, Texture>> {
  const urls = [...new Set([plan.base, ...plan.layers.filter(layer => !lightOperator(layer)).map(layer => layer.source)])];
  return new Map(await Promise.all(urls.map(async url => [url, await texture(url)] as const)));
}
function lightOperator(layer: Layer): boolean {
  return layer.kind === "light" && layer.brightness !== undefined;
}
function exposure(layers: Layer[], fading: Set<string>, factor: number): number {
  return layers.reduce((value, layer) => value * (1 + (layer.brightness! - 1) * layer.alpha *
    (fading.has(layer.id) ? factor : 1)), 1);
}
function paintFilter(layer: Layer): ColorMatrixFilter {
  const filter = new ColorMatrixFilter();
  if (layer.color && layer.color !== "sea") {
    filter.hue(layer.color === "honey" ? 220 : 166, false);
    // Pixi's saturation is a delta: 0 is unchanged, -1 is grayscale.
    filter.saturate(layer.color === "honey" ? -.3 : -.25, true);
  }
  if (layer.hue) filter.hue(layer.hue, true);
  if (layer.saturation !== undefined) filter.saturate(layer.saturation - 1, true);
  if (layer.brightness !== undefined && layer.brightness !== 1) filter.brightness(layer.brightness, true);
  return filter;
}
function xml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]!));
}
function sprite(value: Texture): Sprite {
  const image = new Sprite(value);
  image.width = WIDTH;
  image.height = HEIGHT;
  return image;
}
function fades(plan: Plan): Set<string> {
  const fading = new Set<string>();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains('reduced-motion')) return fading;
  for (const layer of plan.layers) {
    // The controller marks only the current purchase. A deliberate debug replay
    // must animate again, even if this layer appeared earlier in the page.
    if (layer.animate) fading.add(layer.id);
  }
  return fading;
}
const layerKey = (layer:Layer) => JSON.stringify([layer.id,layer.source,layer.path,layer.kind,
  layer.color,layer.brightness,layer.hue,layer.saturation]);
const still = (plan:Plan):Frame => ({bases:[{source:plan.base,alpha:1}],
  layers:plan.layers.filter(layer=>!lightOperator(layer)),exposure:exposure(plan.layers.filter(lightOperator),new Set(),1)});
/** Interpolate the actual previous ghost, disappearing clutter, base and lighting. */
function between(previous:Plan,next:Plan,factor:number):Frame {
  const old=new Map(previous.layers.map(layer=>[layerKey(layer),layer]));
  const layers=next.layers.map(layer=>{
    const before=old.get(layerKey(layer));old.delete(layerKey(layer));
    return {...layer,alpha:(before?.alpha??0)+(layer.alpha-(before?.alpha??0))*factor};
  });
  layers.push(...[...old.values()].map(layer=>({...layer,alpha:layer.alpha*(1-factor)})));
  const bases=previous.base===next.base?[{source:next.base,alpha:1}]
    :[{source:previous.base,alpha:1},{source:next.base,alpha:factor}];
  return {bases,layers:layers.filter(layer=>!lightOperator(layer)),exposure:exposure(layers.filter(lightOperator),new Set(),1)};
}
async function update(record:Mount,text:string):Promise<void> {
  const revision=record.revision=(record.revision??0)+1;
  const next=readPlan(text);
  record.text=text;
  const visualKey=(plan:Plan)=>JSON.stringify({base:plan.base,layers:plan.layers.map(({animate,...layer})=>layer)});
  if(visualKey(record.plan)===visualKey(next)) {
    record.plan=next;record.pendingDOM?.();record.pendingDOM=undefined;
    record.outer.dispatchEvent(new Event('scene-transition-start'));return;
  }
  record.outer.dataset.sceneUpdating='true';
  try {
    // Texture downloads leave the existing painted surface and readiness intact.
    const loaded=await sheets(next);
    if(!valid(record)||revision!==record.revision)return;
    for(const [url,value] of record.loaded!)if(!loaded.has(url))loaded.set(url,value);
    const previous=record.plan;
    if(record.frame!==undefined)cancelAnimationFrame(record.frame);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('reduced-motion');
    record.loaded=loaded;
    record.pendingDOM?.();record.pendingDOM=undefined;
    record.outer.dispatchEvent(new Event('scene-transition-start'));
    await new Promise<void>((resolve,reject)=>{
      const start=performance.now();
      const step=(now:number)=>{
        if(!valid(record)||revision!==record.revision){resolve();return;}
        const elapsed=reduced?1:Math.min(1,(now-start)/FADE_MS);
        const factor=1-(1-elapsed)**3;
        try {record.draw!(elapsed===1?still(next):between(previous,next,factor),loaded);}
        catch(error){reject(error);return;}
        if(elapsed<1)record.frame=requestAnimationFrame(step);
        else {record.frame=undefined;record.plan=next;delete record.outer.dataset.sceneUpdating;resolve();}
      };
      step(start);
    });
  } catch(error) {
    if(valid(record)) {delete record.outer.dataset.sceneUpdating;record.outer.dataset.sceneError=String(error);}
    throw error;
  }
}
/** Transfer only metadata and controls; a matching view retains its live renderer. */
export function retainHallScene(previous:HTMLElement,next:HTMLElement):boolean {
  if(previous.dataset.sceneView!==next.dataset.sceneView||previous.dataset.sceneReady!=='true')return false;
  const stage=previous.querySelector('.hall-world-stage');
  const nextStage=next.querySelector('.hall-world-stage');
  const script=stage?.querySelector('.hall-canvas-plan');
  const nextScript=nextStage?.querySelector('.hall-canvas-plan');
  if(!stage||!nextStage||!script||!nextScript)return false;
  previous.className=next.className;
  for(const attr of ['aria-label','data-room-id','data-art-version']) {
    const value=next.getAttribute(attr);if(value!==null)previous.setAttribute(attr,value);
  }
  script.textContent=nextScript.textContent;
  const loading=stage.querySelector<HTMLImageElement>('.hall-loading-frame');
  const freshLoading=nextStage.querySelector<HTMLImageElement>('.hall-loading-frame');
  if(loading&&freshLoading)loading.src=freshLoading.src;
  for(const selector of ['.hall-canvas-metadata','.hall-goal-layer']) {
    const old=previous.querySelector(selector),fresh=next.querySelector(selector);
    if(old&&fresh)old.replaceWith(fresh);else if(old)old.remove();else if(fresh)previous.append(fresh);
  }
  const syncEffects=()=>{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('reduced-motion');
    for(const selector of ['.hall-surface-effects','.warehouse-outline']) {
      const oldEffects=stage.querySelector<SVGElement>(selector);
      const effects=nextStage.querySelector<SVGElement>(selector);
      const normalized=(svg:SVGElement|null)=>svg?.outerHTML.replace(/room-surface-\d+/g,'room-surface');
      if(normalized(oldEffects)===normalized(effects))continue;
      if(effects) {
        stage.append(effects);
        if(!reduced)effects.animate([{opacity:0},{opacity:getComputedStyle(effects).opacity}],{duration:FADE_MS});
      }
      if(oldEffects) {
        if(reduced)oldEffects.remove();
        else {const animation=oldEffects.animate([{opacity:getComputedStyle(oldEffects).opacity},{opacity:0}],{duration:FADE_MS,fill:'both'});animation.finished.then(()=>oldEffects.remove()).catch(()=>oldEffects.remove());}
      }
    }
  };
  const canvas=stage.querySelector<HTMLCanvasElement>('canvas');
  const record=canvas?mounts.get(canvas):undefined;
  if(record)record.pendingDOM=syncEffects;else syncEffects();
  return true;
}
/** A deliberate camera change enters a decoded, painted view, never a loading plate. */
export async function prepareHallScene(scene:HTMLElement):Promise<{scene:HTMLElement;release:()=>void}> {
  const staging=document.createElement('div');
  staging.style.cssText='position:fixed;left:-2000px;top:0;width:1536px;height:1024px;visibility:hidden;pointer-events:none';
  staging.setAttribute('aria-hidden','true');
  staging.append(scene);document.body.append(staging);
  try {
    await mountHallCanvases(staging);
    if(scene.dataset.sceneReady!=='true')throw new Error('Сцена ещё не загрузилась. Попробуйте ещё раз.');
    return {scene,release:()=>staging.remove()};
  } catch(error) {staging.remove();throw error;}
}
function animate(record: Mount, draw: (factor: number) => void, fading: boolean): void {
  draw(fading ? .2 : 1);
  if (!valid(record)) return;
  record.outer.dataset.sceneReady = "true";
  if (!fading) return;
  const start = performance.now();
  const step = (now: number) => {
    if (!valid(record)) { dispose(record); return; }
    const progress = Math.min(1, (now - start) / FADE_MS);
    try { draw(.2 + .8 * (1 - (1 - progress) ** 3)); }
    catch (error) {
      if (record.outer.dataset.renderer === "pixi-webgl") record.promise = native(record, error);
      else {
        record.outer.dataset.sceneReady = "false";
        record.outer.dataset.sceneError = error instanceof Error ? error.message : String(error);
        console.warn("[hall-canvas] Native frame failed:", error);
      }
      return;
    }
    if (progress < 1) record.frame = requestAnimationFrame(step);
    else record.frame = undefined;
  };
  record.frame = requestAnimationFrame(step);
}
function guardShaderProbe(gl: WebGLRenderingContext | WebGL2RenderingContext): () => void {
  const compile = gl.compileShader;
  let attempts = 0;
  // A bounded guard around Pixi 8.22's unbounded shader capability probe.
  // It only lives during init, so normal draw/restore compilation is unaffected.
  gl.compileShader = function(shader: WebGLShader): void {
    if (!shader || gl.isContextLost() || ++attempts > 64)
      throw new Error("The hall WebGL shader capability probe failed");
    compile.call(gl, shader);
  };
  return () => { gl.compileShader = compile; };
}
async function pixi(record: Mount, loaded: Map<string, Texture>): Promise<void> {
  if (!isWebGLSupported()) throw new Error("WebGL is unavailable");
  // Retain the context ourselves so even a rejected async init can release it.
  const options: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: false, stencil: true };
  usedSurfaces.add(record.canvas);
  const gl = record.canvas.getContext("webgl2", options) ?? record.canvas.getContext("webgl", options);
  record.gl = gl ?? undefined;
  if (!gl || gl.isContextLost() || !gl.getContextAttributes()?.stencil)
    throw new Error("Unable to create a hall WebGL context with stencil masks");
  const maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number | null;
  if (!maxTextures || !Number.isFinite(maxTextures)) throw new Error("Unable to query hall WebGL texture limits");
  const app = record.app = new Application();
  const restoreShaderProbe = guardShaderProbe(gl);
  try {
    record.resolution = samplingResolution(record);
    await app.init({ canvas: record.canvas, width: WIDTH, height: HEIGHT, resolution: record.resolution,
      backgroundAlpha: 0, autoStart: false, sharedTicker: false, preference: "webgl", preserveDrawingBuffer: true,
      // Pixi supports WebGL 1 too, although the context option is typed as WebGL 2.
      context: gl as WebGL2RenderingContext });
    restoreShaderProbe();
    record.initialized = true;
    if (!valid(record)) { releaseRenderer(record); return; }
    if (gl.isContextLost()) throw new Error("The hall WebGL context was lost during init");
    const source = new Container();
    source.eventMode = "none";
    app.stage.addChild(source);
    const nodes=new Map<string,{image:Sprite;mask?:Graphics;filter?:ColorMatrixFilter}>();
    const lighting=new ColorMatrixFilter();
    lighting.resolution='inherit';
    record.filters.push(lighting);
    app.stage.filters=[lighting];
    record.loaded=loaded;
    record.draw=(frame,sheets)=>{
      record.painted=frame;
      const keep=new Set<string>();
      let index=0;
      const place=(key:string,url:string,alpha:number,layer?:Layer)=>{
        keep.add(key);
        let node=nodes.get(key);
        if(!node) {
          const image=sprite(sheets.get(url)!);
          node={image};nodes.set(key,node);source.addChild(image);
          if(layer) {
            image.label=layer.id;
            node.mask=new Graphics().svg(`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><path d="${xml(layer.path)}" fill="white"/></svg>`);
            source.addChild(node.mask);image.mask=node.mask;
            if((layer.color&&layer.color!=="sea")||(layer.brightness!==undefined&&layer.brightness!==1)||layer.hue||layer.saturation!==undefined) {
              node.filter=paintFilter(layer);node.filter.resolution='inherit';record.filters.push(node.filter);image.filters=[node.filter];
            }
          }
        }
        node.image.alpha=alpha;
        source.setChildIndex(node.image,index++);
        if(node.mask)source.setChildIndex(node.mask,index++);
      };
      for(const base of frame.bases)place(`base:${base.source}`,base.source,base.alpha);
      for(const layer of frame.layers)place(`layer:${layerKey(layer)}`,layer.source,layer.alpha,layer);
      for(const [key,node] of nodes)if(!keep.has(key)) {
        if(node.filter) {const group=node.filter.groups[0];group?.destroy();node.filter.destroy();record.filters=record.filters.filter(filter=>filter!==node.filter);}
        node.image.mask=null;node.image.destroy({texture:false,textureSource:false});node.mask?.destroy();nodes.delete(key);
      }
      lighting.brightness(frame.exposure,false);
      app.stage.filters=frame.exposure===1?null:[lighting];
      app.render();
    };
    watchSampling(record, resolution => app.renderer.resize(WIDTH, HEIGHT, resolution));
    const lost = (event: Event) => {
      event.preventDefault();
      if (valid(record)) record.promise = native(record, new Error("The hall WebGL context was lost"));
    };
    record.canvas.addEventListener("webglcontextlost", lost);
    record.removeContextListener = () => record.canvas.removeEventListener("webglcontextlost", lost);
    record.outer.dataset.renderer = "pixi-webgl";
    const fading=fades(record.plan);
    animate(record,factor=>record.draw!({...still(record.plan),layers:record.plan.layers.filter(layer=>!lightOperator(layer)).map(layer=>({...layer,alpha:layer.alpha*(fading.has(layer.id)?factor:1)})),exposure:exposure(record.plan.layers.filter(lightOperator),fading,factor)},loaded),fading.size>0);
  } catch (error) {
    // Application.init can reject before assigning its renderer or plugins.
    if (!record.initialized) { app.stage.destroy({ children: true, context: true }); record.app = undefined; }
    throw error;
  } finally {
    restoreShaderProbe();
  }
}
function nativeImage(value: Texture): CanvasImageSource {
  return value.source.resource as CanvasImageSource;
}
function nativeFilter(layer: Layer): string {
  const effects: string[] = [];
  if (layer.color && layer.color !== "sea") effects.push(`hue-rotate(${layer.color === "honey" ? 220 : 166}deg)`, `saturate(${layer.color === "honey" ? .7 : .75})`);
  if (layer.hue) effects.push(`hue-rotate(${layer.hue}deg)`);
  if (layer.saturation !== undefined) effects.push(`saturate(${layer.saturation})`);
  if (layer.brightness !== undefined && layer.brightness !== 1) effects.push(`brightness(${layer.brightness})`);
  return effects.join(" ") || "none";
}
async function native(record: Mount, reason: unknown): Promise<void> {
  if (!valid(record)) return;
  releaseRenderer(record);
  console.warn("[hall-canvas] Canvas2D fallback:", reason);
  record.outer.dataset.sceneReady = "false";
  record.outer.dataset.renderer = "canvas2d";
  try {
    // An HTML canvas cannot switch from WebGL to 2D after context destruction.
    const old = record.canvas;
    record.canvas = replacement(old);
    mounts.delete(old);
    mounts.set(record.canvas, record);
    const loaded = await sheets(record.plan);
    if (!valid(record)) return;
    usedSurfaces.add(record.canvas);
    const ctx = record.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D is unavailable");
    const paths=new Map<string,Path2D>();
    const copy=record.canvas.ownerDocument.createElement("canvas");
    const copyContext=copy.getContext("2d");
    if(!copyContext)throw new Error("Canvas2D exposure is unavailable");
    const resize = (resolution: number) => {
      record.canvas.width = Math.round(WIDTH * resolution);
      record.canvas.height = Math.round(HEIGHT * resolution);
      copy.width = record.canvas.width; copy.height = record.canvas.height;
      ctx.setTransform(record.canvas.width / WIDTH, 0, 0, record.canvas.height / HEIGHT, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    };
    record.resolution = samplingResolution(record); resize(record.resolution);
    record.loaded=loaded;
    record.draw=(frame,sheets)=>{
      record.painted=frame;
      ctx.clearRect(0,0,WIDTH,HEIGHT);
      for(const base of frame.bases) {
        ctx.globalAlpha=base.alpha;ctx.drawImage(nativeImage(sheets.get(base.source)!),0,0,WIDTH,HEIGHT);
      }
      ctx.globalAlpha=1;
      for(const layer of frame.layers) {
        let path=paths.get(layer.path);
        if(!path){path=new Path2D(layer.path);paths.set(layer.path,path);}
        ctx.save();ctx.clip(path);ctx.globalAlpha=layer.alpha;ctx.filter=nativeFilter(layer);
        ctx.drawImage(nativeImage(sheets.get(layer.source)!),0,0,WIDTH,HEIGHT);ctx.restore();
      }
      if(frame.exposure!==1) {
        copyContext.clearRect(0,0,WIDTH,HEIGHT);copyContext.drawImage(record.canvas,0,0);
        ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.save();ctx.filter=`brightness(${frame.exposure})`;
        ctx.drawImage(copy,0,0,WIDTH,HEIGHT);ctx.restore();
      }
    };
    watchSampling(record, resize);
    const fading=fades(record.plan);
    animate(record,factor=>record.draw!({...still(record.plan),layers:record.plan.layers.filter(layer=>!lightOperator(layer)).map(layer=>({...layer,alpha:layer.alpha*(fading.has(layer.id)?factor:1)})),exposure:exposure(record.plan.layers.filter(lightOperator),fading,factor)},loaded),fading.size>0);
  } catch (error) {
    if (valid(record)) {
      record.outer.dataset.sceneError = error instanceof Error ? error.message : String(error);
      console.warn("[hall-canvas] Unable to draw the native hall:", error);
    }
  }
}
async function build(record: Mount): Promise<void> {
  try {
    const loaded = await sheets(record.plan);
    if (valid(record)) await pixi(record, loaded);
  } catch (error) {
    if (valid(record)) await native(record, error);
    else releaseRenderer(record);
  }
}
/** Mount connected game and preview surfaces; reusing the same plan never restarts its fade. */
export async function mountHallCanvases(root: ParentNode): Promise<void> {
  prune();
  const work: Promise<void>[] = [];
  for (const original of root.querySelectorAll<HTMLCanvasElement>("canvas.hall-canvas-surface")) {
    if (!original.isConnected) continue;
    const outer = original.closest<HTMLElement>(".hall-composition");
    const script = outer?.querySelector<HTMLScriptElement>("script.hall-canvas-plan");
    if (!outer || !script) continue;
    const text = script.textContent ?? "";
    const previous = mounts.get(original);
    if (previous && valid(previous) && previous.text === text) {
      previous.pendingDOM?.();previous.pendingDOM=undefined;work.push(previous.promise);continue;
    }
    if (previous && valid(previous) && previous.draw) {
      previous.promise=update(previous,text);
      work.push(previous.promise);continue;
    }
    if (previous) dispose(previous);
    const canvas = usedSurfaces.has(original) ? replacement(original) : original;
    observe(canvas.ownerDocument);
    outer.dataset.sceneReady = "false";
    delete outer.dataset.sceneError;
    try {
      const record: Mount = { canvas, outer, script, text, plan: readPlan(text), cancelled: false,
        promise: Promise.resolve(), filters: [] };
      mounts.set(canvas, record);
      active.add(record);
      record.promise = build(record);
      work.push(record.promise);
    } catch (error) {
      outer.dataset.sceneError = error instanceof Error ? error.message : String(error);
      console.warn("[hall-canvas] Invalid hall plan:", error);
    }
  }
  await Promise.all(work);
}
