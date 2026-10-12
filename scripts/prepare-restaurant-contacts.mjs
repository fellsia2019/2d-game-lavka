/** Native vector contacts underneath the actual v6 furniture feet; no bitmap retouching. */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const contacts={
 prep:[[142,723,22,5],[260,724,22,5],[338,631,18,4]],
 stove:[[754,568,9,3],[777,582,12,4],[978,581,12,4]],
 service:[[1014,603,16,4],[1096,602,16,4],[1140,709,21,5],[1235,700,21,5]],
};
for(const [name,feet] of Object.entries(contacts)){
 const marks=feet.map(([x,y,rx,ry])=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#c)"/>`).join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><defs><radialGradient id="c"><stop stop-color="#533719" stop-opacity=".3"/><stop offset=".45" stop-color="#63482c" stop-opacity=".16"/><stop offset="1" stop-color="#63482c" stop-opacity="0"/></radialGradient></defs>'+marks+'</svg>\n';
 writeFileSync(fileURLToPath(new URL(`../public/assets/restaurant-contact-${name}-v6.svg`,import.meta.url)),svg);
}
writeFileSync(fileURLToPath(new URL('../docs/art/restaurant-rooms/contacts-v6.json',import.meta.url)),JSON.stringify(contacts,null,2)+'\n');
