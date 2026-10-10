import {writeFileSync} from 'node:fs';
const contacts={
 oven:[[1250,749,170,4]],table:[[542,648,15,4],[826,676,15,4],[594,632,10,3],[850,652,10,3]],
 rack:[[870,674,12,4],[1056,688,12,4]],sink:[[328,735,23,4],[503,674,14,3]],
 'bread-counter':[[55,701,27,4],[194,886,16,4],[361,937,18,4],[742,723,13,3],[560,832,13,3]],
 basket:[[127,917,13,4],[218,947,13,4],[283,918,12,3]],packaging:[[757,633,12,3],[1071,659,15,4]],
};
for(const [name,points] of Object.entries(contacts)){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><defs><radialGradient id="c"><stop stop-color="#533719" stop-opacity=".27"/><stop offset=".45" stop-color="#63482c" stop-opacity=".14"/><stop offset="1" stop-color="#63482c" stop-opacity="0"/></radialGradient></defs>${points.map(([cx,cy,rx,ry])=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#c)"/>`).join('')}</svg>`;
 writeFileSync(`public/assets/bakery-contact-${name}.svg`,svg);
}
writeFileSync('docs/art/bakery-rooms/contacts.json',JSON.stringify(contacts,null,2)+'\n');
const survey='<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><path d="M349 702 L683 580 L1415 612 L1266 788 Z" fill="none" stroke="#f2dfaa" stroke-width="4" stroke-dasharray="16 8"/>'+[[349,702],[683,580],[1415,612],[1266,788]].map(([x,y])=>`<path d="M${x-4} ${y} v-26 l8 -2 v27Z" fill="#9b6030" stroke="#704325" stroke-width="1.5"/>`).join('')+'</svg>';
writeFileSync('public/assets/bakery-yard-survey.svg',survey);
