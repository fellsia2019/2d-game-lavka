/** Renderer-native SVG contacts at real supports; this never edits bitmap art. */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const contacts={
 4:[[737,616,18,7],[913,640,18,7],[1109,670,18,7],[1319,708,17,4]],
 6:[[126,718,19,7],[560,644,14,5]],
 10:[[1312,705,19,6],[1431,720,16,6]],
 13:[[990,527,18,6],[1225,638,18,7],[1343,679,17,7],[1457,659,14,6]],
 14:[[676,507,14,5],[690,509,12,5],[866,501,14,5]],
 15:[[899,501,18,6],[966,501,18,6]],
 16:[[467,525,18,6],[533,502,9,5],[568,514,10,5]],
 17:[[1445,702,42,9]],
};
for(const [task,feet] of Object.entries(contacts)){
 const marks=feet.map(([x,y,rx,ry])=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#contact)"/>`).join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><defs><radialGradient id="contact"><stop stop-color="#51301d" stop-opacity=".43"/><stop offset=".5" stop-color="#51301d" stop-opacity=".22"/><stop offset="1" stop-color="#51301d" stop-opacity="0"/></radialGradient></defs>'+marks+'</svg>\n';
 writeFileSync(fileURLToPath(new URL(`../public/assets/shop-expansion-contact-${task}${task==='4'?'-v2':''}.svg`,import.meta.url)),svg);
}
