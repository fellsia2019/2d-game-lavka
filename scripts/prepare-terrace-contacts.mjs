import {writeFileSync} from 'node:fs';
const groups={tables:[[440,585,14],[459,554,10],[559,585,13],[583,554,10],[1016,554,10],[1034,585,14],[1130,554,10],[1151,585,14]],chairs:[[573,583,8],[640,583,8],[649,562,7],[970,583,8],[960,561,7],[1031,579,8],[1162,583,8],[1226,583,8],[1235,562,7]],counter:[[618,426,15],[922,426,14],[1025,420,12]],cupboard:[[500,404,12],[587,404,12]],returns:[[1201,420,10],[1251,420,10]],drinks:[[1060,424,11],[1177,421,11]],bench:[[276,596,11],[337,599,12],[399,514,9]],sink:[[394,409,10],[470,407,11]]};
const manifest=[];
for(const [name,points] of Object.entries(groups)){
 const defs=points.map((_,i)=>`<radialGradient id="g${i}"><stop stop-color="#73543a" stop-opacity=".28"/><stop offset=".55" stop-color="#73543a" stop-opacity=".13"/><stop offset="1" stop-color="#73543a" stop-opacity="0"/></radialGradient>`).join('');
 const body=points.map(([x,y,rx],i)=>`<ellipse cx="${x}" cy="${y+1}" rx="${rx}" ry="4" fill="url(#g${i})"/>`).join('');
 const filename=`terrace-contact-${name}.svg`;
 writeFileSync(`public/assets/${filename}`,`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><defs>${defs}</defs>${body}</svg>`);
 manifest.push({name,filename,points,ry:4});
}
writeFileSync('docs/art/terrace-rooms/contact-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const pins=[[312,381],[1257,381],[1438,727],[124,727]];
writeFileSync('public/assets/terrace-survey.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><path d="M312 381 L1257 381 L1438 727 L124 727 Z" fill="none" stroke="#e5bf75" stroke-width="3" stroke-dasharray="10 7"/>${pins.map(([x,y])=>`<path d="M${x-3} ${y+8} v-31 l7 -2 v31 Z" fill="#a37846"/><path d="M${x+4} ${y-25} l19 3 -19 8 Z" fill="#52aea7"/>`).join('')}</svg>`);
