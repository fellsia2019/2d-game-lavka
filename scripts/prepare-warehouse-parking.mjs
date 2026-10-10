/** Registered paint on the existing yard floor: no opaque pavement patch. */
import { writeFile } from 'node:fs/promises';
const corners = [[132,682],[491,663],[673,806],[206,838]];
// Project the icon through the same quadrilateral as the complete parking bay.
const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=corners;
const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3;
const dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
const den=dx1*dy2-dx2*dy1;
const g=(dx3*dy2-dx2*dy3)/den,h=(dx1*dy3-dx3*dy1)/den;
const point=(u,v)=>[(x0+(x1-x0+g*x1)*u+(x3-x0+h*x3)*v)/(1+g*u+h*v),
  (y0+(y1-y0+g*y1)*u+(y3-y0+h*y3)*v)/(1+g*u+h*v)].map(n=>+n.toFixed(2));
const polygon=pts=>'M'+pts.map(p=>point(...p).join(' ')).join(' L')+' Z';
const rect=(a,b,c,d)=>polygon([[a,b],[c,b],[c,d],[a,d]]);
const wheel=(u,v)=>polygon(Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return[u+Math.cos(a)*.022,v+Math.sin(a)*.040]}));
const outer='M'+corners.map(p=>p.join(' ')).join(' L')+' Z';
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><path d="${outer}" fill="none" stroke="#fff2cc" stroke-width="10" stroke-linejoin="round" opacity=".88"/><g fill="#fff2cc" opacity=".92"><path d="${rect(.29,.37,.53,.62)}"/><path d="${polygon([[.55,.40],[.63,.40],[.70,.52],[.70,.62],[.55,.62]])} ${polygon([[.567,.435],[.623,.435],[.663,.513],[.567,.513]])}" fill-rule="evenodd"/><path d="${rect(.30,.635,.72,.67)}"/><path d="${wheel(.36,.70)} ${wheel(.64,.70)}"/></g></svg>\n`;
await writeFile(new URL('../public/assets/warehouse-room-parking-v6.svg',import.meta.url),svg);
console.log(JSON.stringify({corners,roi:[126,657,553,187],bytes:Buffer.byteLength(svg)}));
