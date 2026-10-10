import { test, expect } from '@playwright/test';
import { PROJECTS, projectTasks } from '../../src/campaign';
import { SCENE_TASKS, sceneTaskAnchor } from '../../src/campaign-scene';

test('All 126 scene results fit their desktop and mobile viewports', async ({page},testInfo) => {
    const width = testInfo.project.name === 'mobile-360' ? 360 : 1440;
    test.setTimeout(180_000);
    await page.setViewportSize({width,height:width === 360 ? 800 : 1100});
    const errors: string[] = [];
    page.on('pageerror',error => errors.push(error.message));
    for (const project of PROJECTS) {
      await page.goto(`/campaign.html?project=${project.id}&step=0`);
      for (let index=0;index<project.taskIds.length;index++) {
        await page.locator('#step-range').fill(String(index+1));
        await page.locator('#step-range').dispatchEvent('input');
        const task=SCENE_TASKS.find(t=>t.id===project.taskIds[index])!;
        await expect(page.locator('#scene-container .shop-composition')).toHaveAttribute('data-scene-view',task.view);
        const anchor=sceneTaskAnchor(task.id);
        expect(anchor.view).toBe(task.view);
        if (project.id === 'shop-1') {
          const purchase = projectTasks('shop-1')[index];
          expect(['hall', 'hall-prep']).toContain(task.view);
          expect(task.view).toBe(purchase.primaryView);
          const result = page.locator(`#scene-container [data-scene-task="${task.id}"]:not(.scene-planned)`);
          await expect(result).not.toHaveCount(0);
          expect(await result.evaluateAll((layers, objectId) => layers.every(layer =>
            layer.closest(`[data-scene-object="${objectId}"]`) !== null), purchase.sceneObjectId)).toBe(true);
          await expect(page.locator('#scene-container .hall-composition')).toHaveAttribute('data-scene-ready', 'true');
          const registration = await page.locator('#scene-container .hall-composition').evaluate(scene => {
            const canvas = scene.querySelector<HTMLCanvasElement>('.hall-canvas-surface')!;
            const plan = JSON.parse(scene.querySelector('.hall-canvas-plan')!.textContent!);
            return {
              width: canvas.width, height: canvas.height,
              screenWidth:canvas.getBoundingClientRect().width,screenHeight:canvas.getBoundingClientRect().height,density:devicePixelRatio,
              renderer: (scene as HTMLElement).dataset.renderer,
              sources: [plan.base, ...plan.layers.map((layer: {source: string}) => layer.source)],
              legacyProps: scene.querySelectorAll('.scene-good,.hall-price,.hall-bread-label,.hall-doormat,[data-hall-focus]').length,
            };
          });
          const sampling=Math.min(1,registration.screenWidth*registration.density/1536,registration.screenHeight*registration.density/1024);
          expect(Math.abs(registration.width-Math.round(1536*sampling))).toBeLessThanOrEqual(1);
          expect(Math.abs(registration.height-Math.round(1024*sampling))).toBeLessThanOrEqual(1);
          expect(registration.renderer).toBe('pixi-webgl');
          expect(registration.legacyProps).toBe(0);
          for (const source of registration.sources) expect(source).toMatch(/hall-room-(main|prep)-(master|empty|clean|before)\.webp$/);
        }
        expect(anchor.x).toBeGreaterThan(0); expect(anchor.x).toBeLessThan(100);
        expect(anchor.y).toBeGreaterThan(0); expect(anchor.y).toBeLessThan(100);
        const failures=await page.locator('#scene-container').evaluate(async container => {
          const scene=container.querySelector<HTMLElement>('.shop-composition')!;
          const bounds=scene.getBoundingClientRect();
          const result:string[]=[];
          if (Math.abs(bounds.width/bounds.height-1.5)>.01) result.push('wrong aspect ratio');
          await Promise.all([...container.querySelectorAll<HTMLImageElement>('img')].map(async img=>{
            try { await img.decode(); } catch { result.push(`decode ${img.src}`); return; }
            if (!img.naturalWidth) { result.push(`empty ${img.src}`); return; }
            if (!img.matches('.scene-layer,.shelving-base,.scene-good,.scene-basket,.tray-rim,.scene-counter,.hall-prop,.hall-object-base')) return;
            const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
            const context=canvas.getContext('2d')!;context.drawImage(img,0,0);
            const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
            let l=canvas.width,t=canvas.height,r=0,b=0;
            for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) if(pixels[(y*canvas.width+x)*4+3]>32){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}
            const box=img.getBoundingClientRect(),style=getComputedStyle(img);
            const width=img.clientWidth,height=img.clientHeight;
            const contain=style.objectFit==='contain';
            const scale=Math.min(width/canvas.width,height/canvas.height);
            const sx=contain?scale:width/canvas.width,sy=contain?scale:height/canvas.height;
            const offsetX=contain?(width-canvas.width*sx)/2:0,offsetY=contain?(height-canvas.height*sy)/2:0;
            const matrix=style.transform==='none'?new DOMMatrix():new DOMMatrix(style.transform);
            const corners=(left:number,top:number,right:number,bottom:number)=>
              [[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,y])=>matrix.transformPoint({x,y}));
            const extent=(points:DOMPoint[])=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
              top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});
            // The new tray planes are sheared along their shelf. Map opaque pixels
            // through that actual transform, including registered object-fit:fill props.
            const full=extent(corners(0,0,width,height));
            const opaque=extent(corners(offsetX+l*sx,offsetY+t*sy,offsetX+r*sx,offsetY+b*sy));
            const xScale=box.width/(full.right-full.left),yScale=box.height/(full.bottom-full.top);
            const visible={left:box.left+(opaque.left-full.left)*xScale,right:box.left+(opaque.right-full.left)*xScale,
              top:box.top+(opaque.top-full.top)*yScale,bottom:box.top+(opaque.bottom-full.top)*yScale};
            if(visible.left<bounds.left-1 || visible.top<bounds.top-1 || visible.right>bounds.right+1 || visible.bottom>bounds.bottom+1) result.push(`clipped ${img.dataset.sceneTask??''}: ${img.src}`);
          }));
          return result;
        });
        expect(failures,task.id).toEqual([]);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      }
    }
    expect(errors).toEqual([]);
});
