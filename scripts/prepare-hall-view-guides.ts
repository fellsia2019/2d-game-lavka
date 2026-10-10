/** Deterministic camera/footprint guides for concept art; not runtime game art. */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
type P=[number,number,number];
type Fixture={id:string;type:'display'|'counter'|'table'|'rack'|'cupboard'|'bench'|'baskets';u0:number;u1:number;v0:number;v1:number;height:number};
const fixtures:Fixture[]=[
 {id:'west-display',type:'display',u0:.05,u1:.60,v0:.60,v1:2.60,height:1.75},
 {id:'north-display',type:'display',u0:.60,u1:3.30,v0:.05,v1:.60,height:1.75},
 {id:'packing-table',type:'table',u0:5.40,u1:5.95,v0:.55,v1:1.95,height:.95},
 {id:'ready-order-rack',type:'rack',u0:5.40,u1:5.95,v0:2.15,v1:3.15,height:1.65},
 {id:'supply-cupboard',type:'cupboard',u0:5.45,u1:5.95,v0:3.40,v1:4.20,height:1.90},
 {id:'cashier-counter',type:'counter',u0:3.20,u1:5.20,v0:3.40,v1:4.00,height:1.10},
 {id:'waiting-bench',type:'bench',u0:.85,u1:2.15,v0:4.45,v1:4.90,height:.48},
 {id:'customer-baskets',type:'baskets',u0:.10,u1:.50,v0:3.20,v1:3.55,height:.70},
];
const cameras=[{id:1,name:'Entrance and displays',corner:'NW',walls:['W','N']},{id:2,name:'Order preparation',corner:'NE',walls:['N','E']},{id:3,name:'Cashier and collection',corner:'SE',walls:['E','S']},{id:4,name:'Welcome and waiting',corner:'SW',walls:['S','W']}];
const plan={status:'concept only, requires user approval before runtime changes',room:{width:6,depth:5,height:3},door:{wall:'W',from:3.70,to:4.70,height:2.60,opens:'outward'},window:{wall:'W',from:1.35,to:3.15,bottom:1.45,top:2.95},fixtures,cameras,projection:{left:[113.6,-53],right:[128.4,46.7],vertical:[0,-154.4]},constraints:['All fixtures are axis-aligned to their wall.','One physical room and fixed floorplan across four camera views.','Entrance corridor is clear.','One cashier, one doorway, one west window.','No new refrigerator or other room concepts in this stage.']};
writeFileSync('docs/art/concepts/hall-four-views-plan.json',JSON.stringify(plan,null,2)+'\n');
const browser=await chromium.launch();
try {
 for(const camera of cameras){
  const transform=([u,v,z]:P):P=>camera.id===1?[-v,u,z]:camera.id===2?[u-6,v,z]:camera.id===3?[v-5,6-u,z]:[-u,5-v,z];
  const proj=(p:P)=>{const[x,y,z]=transform(p);return[720+x*113.6+y*128.4,365-x*53+y*46.7-z*154.4]};
  const shapes:string[]=[];
  const polygon=(points:P[],fill:string,stroke='#6c5a45',width=2)=>shapes.push(`<polygon points="${points.map(p=>proj(p).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`);
  const line=(a:P,b:P,color:string,width=3)=>shapes.push(`<path d="M${proj(a)}L${proj(b)}" stroke="${color}" stroke-width="${width}" fill="none"/>`);
  function box(u0:number,u1:number,v0:number,v1:number,z0:number,z1:number,side='#238e96',top='#dfb77a'){
   const faces=[[[u0,v0,z0],[u1,v0,z0],[u1,v0,z1],[u0,v0,z1]],[[u1,v0,z0],[u1,v1,z0],[u1,v1,z1],[u1,v0,z1]],[[u0,v1,z0],[u1,v1,z0],[u1,v1,z1],[u0,v1,z1]],[[u0,v0,z0],[u0,v1,z0],[u0,v1,z1],[u0,v0,z1]]] as P[][];
   const depth=(face:P[])=>face.reduce((sum,p)=>{const[x,y]=transform(p);return sum-x+y},0)/face.length;
   for(const face of faces.sort((a,b)=>depth(a)-depth(b)))polygon(face,side);
   polygon([[u0,v0,z1],[u1,v0,z1],[u1,v1,z1],[u0,v1,z1]],top);
  }
  polygon([[0,0,0],[6,0,0],[6,5,0],[0,5,0]],'#d5aa71');
  for(let u=.1;u<6;u+=.28)line([u,0,.002],[u,5,.002],'#b78958',1);
  const walls:Record<string,[P,P]>={N:[[0,0,0],[6,0,0]],E:[[6,0,0],[6,5,0]],S:[[6,5,0],[0,5,0]],W:[[0,5,0],[0,0,0]]};
  for(const wall of camera.walls){const[a,b]=walls[wall];polygon([a,b,[b[0],b[1],3],[a[0],a[1],3]],'#efd9b4');line([a[0],a[1],.12],[b[0],b[1],.12],'#16868b',20);line([a[0],a[1],2.95],[b[0],b[1],2.95],'#aa7845',25);}
  if(camera.walls.includes('W')){
   polygon([[0,3.70,0],[0,4.70,0],[0,4.70,2.60],[0,3.70,2.60]],'#8ed6e7','#147682',14);
   polygon([[0,4.70,0],[-.80,4.70,0],[-.80,4.70,2.60],[0,4.70,2.60]],'#329ea4','#147682',10);
   polygon([[0,1.35,1.45],[0,3.15,1.45],[0,3.15,2.95],[0,1.35,2.95]],'#9cdde7','#16838b',14);
   line([0,2.25,1.45],[0,2.25,2.95],'#16838b',9);
  }
  const visible:Record<number,string[]>={1:['west-display','north-display','cashier-counter'],2:['north-display','packing-table','ready-order-rack','supply-cupboard'],3:['packing-table','ready-order-rack','supply-cupboard','cashier-counter','waiting-bench'],4:['west-display','cashier-counter','waiting-bench','customer-baskets']};
  const sorted=fixtures.filter(f=>visible[camera.id].includes(f.id)).sort((a,b)=>{const depth=(f:Fixture)=>{const[x,y]=transform([(f.u0+f.u1)/2,(f.v0+f.v1)/2,0]);return -x+y};return depth(a)-depth(b)});
  for(const f of sorted){
   if(f.type==='display'||f.type==='rack'){
    box(f.u0,f.u1,f.v0,f.v1,.04,.17,'#18878d','#76c4bc');box(f.u0,f.u1,f.v0,f.v1,.18,.58,'#b08c50','#d4ab68');
    for(const z of[.64,1.10,f.height])box(f.u0,f.u1,f.v0,f.v1,z-.07,z,'#b78242','#e5b878');
    if(f.u1-f.u0>f.v1-f.v0){box(f.u0,f.u0+.08,f.v0,f.v1,.1,f.height+.06);box(f.u1-.08,f.u1,f.v0,f.v1,.1,f.height+.06);}
    else{box(f.u0,f.u1,f.v0,f.v0+.08,.1,f.height+.06);box(f.u0,f.u1,f.v1-.08,f.v1,.1,f.height+.06);}
   }else{
    box(f.u0,f.u1,f.v0,f.v1,.05,f.height-.10,'#238e96','#76c4bc');box(f.u0-.04,f.u1+.04,f.v0-.04,f.v1+.04,f.height-.1,f.height,'#b98241','#e5b878');
    if(f.type==='counter')box(f.u0+.85,f.u0+1.45,f.v0+.12,f.v1-.10,f.height,f.height+.40,'#bd994c','#e7cb85');
   }
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><rect width="1536" height="1024" fill="#f4dfb8"/>${shapes.join('')}</svg>`;
  writeFileSync(`docs/art/concepts/hall-view-${camera.id}-geometry.svg`,svg);
  const page=await browser.newPage({viewport:{width:1536,height:1024},deviceScaleFactor:1});await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);await page.screenshot({path:`docs/art/concepts/hall-view-${camera.id}-geometry.png`});await page.close();
 }
 const colors:Record<string,string>={display:'#43a7a8',counter:'#d6ad60',table:'#8ac5bc',rack:'#93caba',cupboard:'#46888b',bench:'#dfa477',baskets:'#d5ba88'};
 const blocks=fixtures.map(f=>`<rect x="${200+f.u0*150}" y="${150+f.v0*150}" width="${(f.u1-f.u0)*150}" height="${(f.v1-f.v0)*150}" fill="${colors[f.type]}" stroke="#28575d" stroke-width="3"/><text x="${210+f.u0*150}" y="${173+f.v0*150}" font-size="15" font-family="sans-serif">${f.id}</text>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="1050"><rect width="1300" height="1050" fill="#fff6e5"/><rect x="200" y="150" width="900" height="750" fill="#edd2a6" stroke="#28575d" stroke-width="10"/><path d="M200 705 V855" stroke="#9ddae3" stroke-width="17"/><path d="M200 352.5 V622.5" stroke="#22a9bd" stroke-width="17"/>${blocks}<g font-family="sans-serif" font-weight="bold" font-size="30" fill="#28575d"><text x="540" y="85">NORTH</text><text x="1130" y="520">EAST</text><text x="540" y="985">SOUTH</text><text x="50" y="520">WEST</text><text x="215" y="125">1 NW</text><text x="995" y="125">2 NE</text><text x="995" y="945">3 SE</text><text x="215" y="945">4 SW</text></g></svg>`;
 writeFileSync('docs/art/concepts/hall-four-views-floorplan.svg',svg);const page=await browser.newPage({viewport:{width:1300,height:1050}});await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);await page.screenshot({path:'docs/art/concepts/hall-four-views-floorplan.png'});await page.close();
}finally{await browser.close()}
