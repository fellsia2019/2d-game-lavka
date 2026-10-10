/** Code-native, transparent contacts at real support points. Does not edit bitmap art. */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const contacts={
 '1-13':[[574,540,18,6],[715,546,17,5],[857,552,17,5],[1015,559,18,6]],
 '1-16':[[403,534,14,5],[450,553,15,5],[565,538,14,5]],
 '1-17':[[40,769,14,5],[123,787,18,6],[240,730,13,5]],
 '1-18':[[1076,560,13,5],[1117,600,16,5],[1275,555,13,5],[1329,591,14,5]],
 '1-22':[[1341,560,13,5],[1462,601,14,5],[1507,591,13,5]],
 '1-23':[[1453,835,45,9]],
 '1-24':[[1253,743,13,5],[1317,790,17,6],[1480,769,13,5]],
 '1-25':[[294,703,17,5],[476,623,13,5]],
 '2-11':[[281,682,23,7],[521,584,14,5]],
 '2-12':[[25,711,12,5],[91,728,12,5],[215,701,12,5]],
 '2-14':[[1138,626,12,5],[1312,697,17,5],[1375,660,13,5]],
 '2-16':[[944,588,13,5],[985,611,18,5],[1109,608,13,5]],
 '2-17':[[1350,704,12,5],[1451,750,16,5],[1507,745,12,5]],
 '2-19':[[100,420,12,4],[188,414,12,4]],
};
for(const [task,feet] of Object.entries(contacts)){
 const marks=feet.map(([x,y,rx,ry])=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#contact)"/>`).join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><defs><radialGradient id="contact"><stop stop-color="#51301d" stop-opacity=".40"/><stop offset=".5" stop-color="#51301d" stop-opacity=".20"/><stop offset="1" stop-color="#51301d" stop-opacity="0"/></radialGradient></defs>'+marks+'</svg>\n';
 writeFileSync(fileURLToPath(new URL(`../public/assets/fruit-room-contact-${task}.svg`,import.meta.url)),svg);
}
const outline='<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><path d="M77 711 L1209 808 L1465 650 L577 555 Z" fill="none" stroke="#fff1bc" stroke-width="6" stroke-linejoin="round" stroke-dasharray="26 13"/><g stroke="#9c6a34" stroke-width="9" stroke-linecap="round"><path d="M77 711 V687 M1209 808 V784 M1465 650 V626 M577 555 V531"/></g></svg>\n';
writeFileSync(fileURLToPath(new URL('../public/assets/fruit-room-outline.svg',import.meta.url)),outline);
