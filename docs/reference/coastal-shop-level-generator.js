(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.CoastalLevelGenerator=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const GOODS={j:{name:'Варенье',id:'jam'},m:{name:'Молоко',id:'milk'},b:{name:'Хлеб',id:'bread'},p:{name:'Груши',id:'pear'},t:{name:'Чай',id:'tea'},h:{name:'Мёд',id:'honey'},l:{name:'Лимоны',id:'lemon'},c:{name:'Кофе',id:'coffee'}};
const clone=x=>JSON.parse(JSON.stringify(x));
const starWord=n=>n%100>=11&&n%100<=14?'звёзд':n%10===1?'звезда':n%10>=2&&n%10<=4?'звезды':'звёзд';
const svg=(id,cls='')=>`<svg class="${cls}" viewBox="${id.startsWith('goods-')?'0 0 64 72':'0 0 48 48'}" aria-hidden="true"><use href="#${id}"/></svg>`;
const good=k=>k?svg('goods-'+GOODS[k].id):'';
const LEVELS={
 basic:{id:'basic',number:1,name:'Первый заказ',note:'Три одинаковых на одной полке — готовый заказ.',budget:null,shelves:[{front:['j','j','m'],rear:[]},{front:['m','m','j'],rear:[]},{front:['b','b',null],rear:[]},{front:['b',null,null],rear:[]}]},
 layers:{id:'layers',number:12,name:'Поставка в два ряда',note:'Освободите передний ряд, чтобы достать задний.',budget:null,shelves:[{front:['j','j','m'],rear:[['b','m','b']]},{front:['m','m','j'],rear:[['m','j','j']]},{front:['b','b',null],rear:[['b','j','m']]},{front:['b',null,null],rear:[]}]},
 crate:{id:'crate',number:1,name:'Заказ на точность',note:'Коробка откроется после двух отправленных троек.',budget:5,shelves:[{front:['j','j','m'],rear:[]},{front:['m','m','j'],rear:[]},{front:['b','b',null],rear:[]},{front:['b','b','b'],rear:[],unlockAfter:2},{front:['b',null,null],rear:[]}]}
};
function initial(def){const goals={};for(const sh of def.shelves)for(const k of [...sh.front,...sh.rear.flat()])if(k)goals[k]=(goals[k]||0)+1;const s={id:def.id,shelves:clone(def.shelves).map(x=>({...x,opened:!x.unlockAfter})),goals,delivered:Object.fromEntries(Object.keys(goals).map(k=>[k,0])),triples:0,used:0,budget:def.budget,messages:[]};resolve(s);return s;}
function resolve(s){let dirty=true,safe=0;while(dirty&&safe++<100){dirty=false;for(let i=0;i<s.shelves.length;i++){const sh=s.shelves[i];if(!sh.opened&&s.triples>=(sh.unlockAfter||0)){sh.opened=true;s.messages.push(`Коробка на полке ${i+1} открыта.`);dirty=true;}if(!sh.opened)continue;if(sh.front.length===3&&sh.front[0]&&sh.front.every(k=>k===sh.front[0])){const k=sh.front[0];s.delivered[k]=(s.delivered[k]||0)+3;s.triples++;sh.front=[null,null,null];s.messages.push(`Отправлено: ${GOODS[k].name.toLowerCase()} ×3.`);dirty=true;}if(sh.front.every(k=>!k)&&sh.rear.length){sh.front=sh.rear.shift();s.messages.push(`На полке ${i+1} открыт задний ряд.`);dirty=true;}}}}
function won(s){return Object.entries(s.goals).every(([k,n])=>s.delivered[k]>=n);}
function remaining(s){return s.budget===null?null:Math.max(0,s.budget-s.used);}
function validMove(s,a,b){const sa=s.shelves[a[0]],sb=s.shelves[b[0]];if(!sa?.opened||!sb?.opened||!Number.isInteger(a[1])||!Number.isInteger(b[1])||a[1]<0||b[1]<0||a[1]>=sa.front.length||b[1]>=sb.front.length)return false;return !!((a[0]!==b[0]||a[1]!==b[1])&&sa.front[a[1]]&&!sb.front[b[1]]);}
function applyMove(s,a,b){if(!validMove(s,a,b))return null;const next=clone(s),k=next.shelves[a[0]].front[a[1]];next.messages=[];next.shelves[a[0]].front[a[1]]=null;next.shelves[b[0]].front[b[1]]=k;next.used++;resolve(next);return next;}
function stateKey(s){return s.shelves.map(sh=>(sh.opened?'1':'0')+':'+sh.front.map(k=>k||'_').sort().join('')+':'+sh.rear.map(row=>row.map(k=>k||'_').sort().join('')).join('/')).join('|')+'#'+s.triples;}
function solve(start,maxNodes=18000,maxDepth=36){if(won(start))return[];const depthLimit=Math.min(maxDepth,remaining(start)??maxDepth),nodes=[{s:clone(start),parent:-1,move:null,depth:0}],seen=new Set([stateKey(start)]);let head=0;while(head<nodes.length&&nodes.length<maxNodes){const node=nodes[head],nodeIndex=head++;if(node.depth>=depthLimit)continue;const empty=[];node.s.shelves.forEach((sh,i)=>{if(sh.opened){const c=sh.front.findIndex(k=>!k);if(c>=0)empty.push([i,c]);}});for(let i=0;i<node.s.shelves.length;i++){const sh=node.s.shelves[i];if(!sh.opened)continue;const types=new Set();for(let j=0;j<sh.front.length;j++){const k=sh.front[j];if(!k||types.has(k))continue;types.add(k);for(const dest of empty){if(i===dest[0])continue;const move=[[i,j],dest],ns=applyMove(node.s,move[0],move[1]);if(!ns)continue;const key=stateKey(ns);if(seen.has(key))continue;seen.add(key);const nextIndex=nodes.length;nodes.push({s:ns,parent:nodeIndex,move,depth:node.depth+1});if(won(ns)){const path=[];let idx=nextIndex;while(nodes[idx].parent>=0){path.push(nodes[idx].move);idx=nodes[idx].parent;}return path.reverse();}}}}}return null;}
function solveFast(start,maxNodes=2500,maxDepth=24){
 if(won(start))return[];const limit=Math.min(maxDepth,remaining(start)??maxDepth),seen=new Map(),path=[];let count=0;
 const score=s=>Object.values(s.delivered).reduce((a,n)=>a+n,0)*25+s.shelves.reduce((a,sh)=>{if(!sh.opened)return a;const freq={};sh.front.forEach(k=>{if(k)freq[k]=(freq[k]||0)+1;});return a+Object.values(freq).filter(n=>n===2).length*5+sh.front.filter(k=>!k).length;},0);
 function visit(s,depth){if(won(s))return path.slice();if(depth>=limit||count++>=maxNodes)return null;const key=stateKey(s),old=seen.get(key);if(old!==undefined&&old<=depth)return null;seen.set(key,depth);const empty=[];s.shelves.forEach((sh,i)=>{if(sh.opened){const j=sh.front.findIndex(k=>!k);if(j>=0)empty.push([i,j]);}});const children=[];
  s.shelves.forEach((sh,i)=>{if(!sh.opened)return;const kinds=new Set();sh.front.forEach((k,j)=>{if(!k||kinds.has(k))return;kinds.add(k);empty.forEach(dest=>{if(dest[0]===i)return;const move=[[i,j],dest],ns=applyMove(s,move[0],move[1]);if(ns)children.push({s:ns,move,score:score(ns)});});});});children.sort((a,b)=>b.score-a.score);
  for(const c of children){path.push(c.move);const result=visit(c.s,depth+1);if(result)return result;path.pop();if(count>=maxNodes)break;}return null;
 }return visit(clone(start),0);
}
// Small deterministic generate-and-test example. Accepted levels have a replayed
// solution witness. Profile labels describe mechanics, not measured difficulty.
const GENERATOR_VERSION='coastal-pcg-1';
const GEN_PROFILES={
 front:{name:'Один ряд',shelves:4,kinds:3,each:3,rearRows:0,locked:false,frontItems:9,minWitness:3,maxDepth:22,nodes:1100,attempts:20},
 layers:{name:'Скрытый ряд',shelves:4,kinds:3,each:6,rearRows:3,locked:false,frontItems:9,minWitness:7,maxDepth:32,nodes:1700,attempts:24},
 crate:{name:'Закрытая поставка',shelves:5,kinds:4,each:3,rearRows:0,locked:true,frontItems:12,minWitness:4,maxDepth:28,nodes:1500,attempts:24},
 mixed:{name:'Смешанная поставка',shelves:6,kinds:4,each:9,rearRows:8,locked:true,frontItems:12,minWitness:14,maxDepth:48,nodes:2400,attempts:32}
};
function seedHash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function seededRandom(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
function seededShuffle(array,rng){const out=array.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function levelStructuralKey(def){
 const kinds=[...new Set(def.shelves.flatMap(sh=>[...sh.front,...sh.rear.flat()]).filter(Boolean))].sort();let best=null;
 function visit(labels,remainingKinds){if(remainingKinds.length){remainingKinds.forEach((k,i)=>visit([...labels,k],remainingKinds.filter((_,j)=>j!==i)));return;}
  const map=Object.fromEntries(labels.map((k,i)=>[k,String.fromCharCode(65+i)]));
  const row=r=>r.map(k=>k?map[k]:'_').sort().join('');
  const key=def.shelves.map(sh=>String(sh.unlockAfter||0)+':'+row(sh.front)+':'+sh.rear.map(row).join('/')).sort().join('|');
  if(best===null||key<best)best=key;
 }visit([],kinds);return best;
}
function replayLevelSolution(def,path){let state=initial(def);for(const [from,to]of path){state=applyMove(state,from,to);if(!state)return false;}return won(state);}
function createLevelCandidate(seed,profile,attempt){
 const p=GEN_PROFILES[profile],rng=seededRandom(seedHash(GENERATOR_VERSION+'|'+profile+'|'+seed+'|'+attempt));
 const kinds=seededShuffle(Object.keys(GOODS),rng).slice(0,p.kinds);
 const bag=seededShuffle(kinds.flatMap(k=>Array(p.each).fill(k)),rng);
 const fronts=seededShuffle([...bag.slice(0,p.frontItems),...Array(p.shelves*3-p.frontItems).fill(null)],rng);
 const shelves=Array.from({length:p.shelves},(_,i)=>({front:fronts.slice(i*3,i*3+3),rear:[]}));
 if(p.rearRows){const indices=seededShuffle(shelves.map((_,i)=>i),rng),rear=bag.slice(p.frontItems);for(let n=0;n<p.rearRows;n++){const i=indices[n%indices.length];shelves[i].rear.push(rear.slice(n*3,n*3+3));}}
 if(p.locked){const full=shelves.map((sh,i)=>sh.front.every(Boolean)?i:-1).filter(i=>i>=0);if(!full.length)return null;shelves[full[Math.floor(rng()*full.length)]].unlockAfter=1+Math.floor(rng()*2);}
 return{id:'gen-'+profile+'-'+seedHash(seed).toString(16),number:1,name:'Генерация · '+p.name,note:'Раскладка получена из seed и проверена воспроизведением решения.',budget:null,shelves,seed,generatorVersion:GENERATOR_VERSION,profile,attempt};
}
function generateLevel(seed,profile='front'){
 if(typeof seed!=='string'||!seed.trim()||seed.length>64)throw new Error('Seed должен содержать от 1 до 64 символов.');
 if(!GEN_PROFILES[profile])throw new Error('Неизвестный профиль генератора.');
 const p=GEN_PROFILES[profile];
 for(let attempt=0;attempt<p.attempts;attempt++){
  const def=createLevelCandidate(seed,profile,attempt);if(!def)continue;
  const start=initial(def),frontEmpty=start.shelves.filter(sh=>sh.opened).reduce((n,sh)=>n+sh.front.filter(k=>!k).length,0);
  if(start.triples!==0||frontEmpty<2||Object.values(start.goals).some(n=>n%3!==0))continue;
  const path=solveFast(start,p.nodes,p.maxDepth);
  if(!path||path.length<p.minWitness||!replayLevelSolution(def,path))continue;
  def.verifiedSolution=path;
  return{definition:def,structuralKey:levelStructuralKey(def),metrics:{goods:p.kinds*p.each,kinds:p.kinds,frontEmpty,shelves:p.shelves,solutionMoves:path.length,candidatesTried:attempt+1}};
 }
 throw new Error('За ограниченный поиск не найден подходящий вариант. Это не доказательство отсутствия решения; попробуйте другой seed.');
}


return Object.freeze({version:GENERATOR_VERSION,profiles:GEN_PROFILES,generate:generateLevel,initial,applyMove,won,replaySolution:replayLevelSolution,structuralKey:levelStructuralKey});
});
