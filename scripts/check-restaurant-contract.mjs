// Verify pinned restaurant production and the explicit prototype runtime dependencies.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root=new URL("../",import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),"utf8"));
const digest=value=>createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
export const readRestaurantContract=()=>read("docs/content/restaurant-1-contract.json");
export function restaurantOrderNumbers(contract, localNumber) {
  if (!Number.isSafeInteger(localNumber) || localNumber < 1 || localNumber > contract.orders)
    throw new Error("Unknown restaurant order");
  return { localNumber, id: `restaurant-s1-order-${String(localNumber).padStart(3, "0")}`,
    catalogNumber: contract.numbering.catalog.first + localNumber - 1,
    denseNumber: (contract.numbering.denseAppend ?? contract.numbering.proposedDenseAppend).first + localNumber - 1 };
}
export function restaurantOrderReward(contract, localNumber) {
  restaurantOrderNumbers(contract, localNumber);
  const repair = localNumber <= contract.economy.lastRepairOrder;
  return { coins: contract.economy.freshCoins, repairKits: repair ? 1 : 0, stars: repair ? 0 : 1 };
}
export function restaurantTaskAffordable(contract, paidWorks, wallet) {
  if (!validCount(paidWorks) || paidWorks > contract.works ||
    ![wallet?.repairKits, wallet?.stars].every(validCount)) return false;
  const next = contract.tasks[paidWorks];
  return !!next && wallet[next.currency] >= next.cost;
}
/** It is still necessary to buy the entry; collecting 38 rewards alone does not open it. */
export function restaurantOrderAllowed(contract, localNumber, completedOrders, completedTaskIds) {
  if (!Number.isSafeInteger(localNumber) || localNumber < 1 || localNumber > contract.orders ||
    !validCount(completedOrders) || completedOrders > contract.orders || !Array.isArray(completedTaskIds)) return false;
  if (localNumber > completedOrders + 1) return false;
  return localNumber <= contract.economy.constructionOrders || completedTaskIds.includes(contract.economy.opensInteriorAfterTaskId);
}
/** Zero-wallet greedy ledger proves each available prefix funds its next work. */
export function restaurantFundingLedger(contract) {
  const wallet = { stars: 0, repairKits: 0, coins: 0 }, paid = [], rows = [];
  for (let order = 1; order <= contract.orders; order++) {
    assert.ok(restaurantOrderAllowed(contract, order, order - 1, paid), `Entry deadlock at order ${order}`);
    const reward = restaurantOrderReward(contract, order);
    for (const currency of Object.keys(wallet)) wallet[currency] += reward[currency];
    const bought = [];
    while (restaurantTaskAffordable(contract, paid.length, wallet)) {
      const task = contract.tasks[paid.length];
      wallet[task.currency] -= task.cost;
      paid.push(task.id);
      bought.push(task.id);
    }
    assert.ok(wallet.stars >= 0 && wallet.repairKits >= 0, `Negative balance ${order}`);
    rows.push({ order, reward, purchased: bought, paidWorks: paid.length, wallet: { ...wallet } });
  }
  return rows;
}


export function validateRestaurantPlan(contract,plan) {
  const phase=plan.phases.find(p=>p.id==="restaurant-1"),slots=plan.orderSlots.filter(s=>s.phaseId==="restaurant-1");
  const active=contract.runtimeEnabled;
  assert.equal(contract.produced,true,"Produce the pinned restaurant catalog first");
  assert.equal(contract.contractVersion,"restaurant-1-production-1");
  assert.equal(contract.contentVersion,"coastal-stage-1-2-bakery-terrace-restaurant-v1");
  assert.equal(contract.schema,12);assert.equal(contract.campaignVersion,"coastal-campaign-10");
  assert.equal(contract.planVersion,plan.planVersion);assert.equal(plan.planVersion,"coastal-full-product-plan-8");
  assert.equal(contract.state,active?"implemented":"prepared");
  assert.equal(contract.orders,80);assert.equal(contract.works,26);
  assert.equal(contract.globalStage,5);assert.equal(contract.localStage,1);
  assert.equal(phase.globalStage,5);assert.equal(phase.orderCount,80);assert.equal(slots.length,80);assert.equal(phase.tasks.length,26);
  assert.deepEqual(phase.globalOrderRange,[3901,3980]);assert.deepEqual(phase.localOrderRange,[1,80]);
  assert.deepEqual(contract.requiresCompletedPhases,["shop-4","warehouse-4","fruit-yard-4","bakery-4","terrace-4"]);
  assert.deepEqual(phase.requiresCompletedPhases,contract.requiresCompletedPhases);
  assert.deepEqual(phase.runtimeDeliveryOverride,{requiresCompletedPhases:["terrace-1"],reason:"prototype-preview-after-terrace-1",completeGlobalStage3:false,completeGlobalStage4:false,completeGlobalStage5:false});
  assert.deepEqual(contract.runtimeDeliveryOverride,phase.runtimeDeliveryOverride);
  assert.deepEqual(contract.rooms.map(r=>r.id),["restaurant-yard","restaurant-hall","restaurant-kitchen"]);
  assert.deepEqual(contract.newGoods,["cu","so"]);
  assert.deepEqual(contract.numbering.denseAppend,{first:761,last:840,status:active?"runtime":"prepared"});
  const costs=[2,2,3,3,2,2,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,3,4,4,4,3];
  assert.deepEqual(phase.tasks.map(t=>t.cost),costs);
  let first=1;
  for(const [index,task] of phase.tasks.entries()) {
    assert.equal(task.id,`restaurant-s1-t${String(index+1).padStart(2,"0")}`);
    const currency=index<12?"repairKits":"stars",fundingSource=index<12?"repair-orders":"food-orders";
    assert.equal(task.currency,currency);assert.equal(task.fundingSource,fundingSource);
    assert.equal(task.status,active?"implemented":"planned");
    assert.deepEqual(contract.tasks[index],{id:task.id,name:task.name,cost:task.cost,currency,fundingSource,status:task.status,
      index:index+1,view:index<10?"restaurant-yard":[14,15,16,17,21,22,23].includes(index)?"restaurant-kitchen":"restaurant-hall",funding:{firstOrder:first,lastOrder:first+task.cost-1}});
    first+=task.cost;
  }
  assert.equal(first,81);
  assert.equal(phase.construction.opensInteriorAfterTaskId,"restaurant-s1-t14");
  assert.equal(phase.construction.projectOrders,38);assert.equal(phase.construction.interiorOrders,42);
  assert.deepEqual(phase.construction.taskIds,phase.tasks.slice(0,14).map(t=>t.id));
  assert.deepEqual(contract.economy,{repairKits:32,stars:48,freshCoins:60,firstRepairOrder:1,lastRepairOrder:32,firstFoodOrder:33,lastFoodOrder:80,
    constructionOrders:38,interiorOrders:42,earningContext:"already-open-building",opensInteriorAfterTaskId:"restaurant-s1-t14",opensInteriorAfterPaidWorks:14,
    interiorFirstOrder:39,allWorksAffordableAfterOrder:80,requiredPurchaseThresholds:contract.tasks.map(t=>({taskId:t.id,minimumCompletedOrders:t.funding.lastOrder,currency:t.currency,cost:t.cost}))});
  let funding=0;
  for(const [index,slot] of slots.entries()) {
    const n=restaurantOrderNumbers(contract,index+1);
    while(index+1>contract.tasks[funding].funding.lastOrder)funding++;
    assert.equal(slot.id,n.id);assert.equal(slot.globalNumber,n.catalogNumber);assert.equal(slot.chapterNumber,n.localNumber);
    assert.equal(slot.status,active?"implemented-definition":"planned-no-definition");
    if(active){assert.equal(slot.denseNumber,n.denseNumber);assert.equal(slot.catalogNumber,n.catalogNumber);assert.equal(slot.definitionFile,"src/levels/projects/restaurant-1.json");}
    assert.equal(slot.rewardCurrency,index<32?"repairKits":"stars");assert.equal(slot.supplyKind,index<32?"repair":"food");
    assert.equal(slot.fundingTaskId,contract.tasks[funding].id);assert.equal(slot.kind,index<38?"construction-project":"interior");
    assert.equal(slot.executionContext,index<38?"already-open-building":undefined);assert.equal(slot.requiresCompletedTaskId,index<38?undefined:"restaurant-s1-t14");
  }
  const ledger=restaurantFundingLedger(contract);
  assert.equal(ledger[37].paidWorks,14);assert.equal(ledger[79].paidWorks,26);
  assert.deepEqual(ledger[79].wallet,{coins:4800,stars:0,repairKits:0});
  return ledger;
}
function validateBaseline(contract,plan) {
  const block=read("src/campaign-block.json"),stories=read("src/levels/stage-block.json");
  assert.equal(contract.baseline.orders,760);assert.equal(contract.baseline.works,178);
  assert.equal(contract.baseline.schema,11);assert.equal(contract.baseline.campaignVersion,"coastal-campaign-9");
  assert.equal(contract.baseline.contentVersion,"coastal-stage-1-2-bakery-terrace-v1");
  assert.deepEqual(block.slice(0,8).map(p=>p.id),contract.baseline.projectIds);
  assert.deepEqual(contract.prerequisiteClosure,contract.baseline.projectIds);
  assert.equal(digest(stories.slice(0,760)),contract.baseline.storiesDigest,"Existing 760 metadata changed");
  for(const project of contract.baseline.projects) {
    const raw=readFileSync(new URL(project.definitionFile,root),"utf8"),defs=JSON.parse(raw);
    assert.equal(digest(raw),project.sourceFileDigest,`Existing pinned source changed:${project.id}`);
    assert.equal(digest(defs),project.definitionDigest);assert.deepEqual(defs.map(d=>d.id),project.orderIds);
    const actual=block.find(p=>p.id===project.id).tasks.map(({id,cost,currency})=>({id,cost,currency}));
    assert.deepEqual(actual,project.tasks);assert.equal(digest(actual),project.taskDigest);
    assert.deepEqual(plan.orderSlots.filter(s=>s.phaseId===project.id).map(s=>({id:s.id,currency:s.rewardCurrency})),project.rewards);
  }
  if(contract.runtimeEnabled) {
    assert.equal(stories.length,840);assert.equal(block.flatMap(p=>p.tasks).length,204);assert.equal(block.length,9);
    assert.deepEqual(block.at(-1).requiresCompletedPhases,["terrace-1"]);
    assert.deepEqual(block.at(-1).plannedRequiresCompletedPhases,contract.requiresCompletedPhases);
    assert.deepEqual(block.at(-1).runtimeDeliveryOverride,contract.runtimeDeliveryOverride);
    assert.deepEqual(contract.implementedBlock,{orders:840,works:204,stars:565,repairKits:275,completeGlobalStage3:false,completeGlobalStage4:false,completeGlobalStage5:false});
    assert.equal(plan.nextDelivery.completeGlobalStage3,false);assert.equal(plan.nextDelivery.completeGlobalStage4,false);assert.equal(plan.nextDelivery.completeGlobalStage5,false);
    assert.deepEqual(plan.nextDelivery.phaseIds,[...contract.baseline.projectIds,"restaurant-1"]);
    assert.equal(plan.deliveryStatus.plannedOrders,5160);assert.equal(plan.deliveryStatus.plannedTasks,540);
  }
}
function validateProduction(contract) {
  const manifest=read(contract.productionManifest),raw=readFileSync(new URL(manifest.definitionFile,root),"utf8"),defs=JSON.parse(raw);
  assert.equal(manifest.productionVersion,contract.contractVersion);assert.equal(manifest.contentVersion,contract.contentVersion);
  assert.equal(manifest.produced,true);assert.equal(manifest.runtimeEnabled,contract.runtimeEnabled);
  assert.equal(manifest.orders,80);assert.equal(manifest.works,26);assert.equal(defs.length,80);
  assert.equal(manifest.baselineOrders,760);assert.equal(manifest.baselineWorks,178);
  assert.equal(manifest.sourceFileDigest,digest(raw));assert.equal(manifest.definitionDigest,digest(defs));
  assert.equal(manifest.storiesDigest,digest(manifest.stories));assert.deepEqual(manifest.denseRange,[761,840]);assert.deepEqual(manifest.catalogRange,[3901,3980]);
  assert.deepEqual(manifest.runtimeDeliveryOverride,contract.runtimeDeliveryOverride);
  assert.deepEqual(manifest.baseline,contract.baseline.projects.map(({id,sourceFileDigest,definitionDigest})=>({id,sourceFileDigest,definitionDigest})));
  if(contract.runtimeEnabled)assert.deepEqual(manifest.stories,read("src/levels/stage-block.json").slice(760));
  for(const [index,entry] of manifest.entries.entries()) {
    const n=restaurantOrderNumbers(contract,index+1),d=defs[index],story=manifest.stories[index];
    assert.deepEqual({id:entry.id,localNumber:entry.localNumber,denseNumber:entry.denseNumber,catalogNumber:entry.catalogNumber},n);
    assert.equal(d.id,entry.id);assert.equal(d.number,n.catalogNumber);assert.equal(d.seed,entry.seed);assert.equal(d.generatorVersion,entry.generatorVersion);
    assert.equal(story.catalogNumber,n.catalogNumber);assert.equal(story.denseNumber,n.denseNumber);
    const goods=[...new Set(d.shelves.flatMap(s=>[...s.front,...s.rear.flat()]).filter(Boolean))];
    assert.ok(contract.newGoods.every(g=>index<38?!goods.includes(g):goods.includes(g)),"Restaurant goods must wait for its paid interior gate");
  }
  return manifest;
}
function replayProduction(contract,manifest) {
  const code=`import assert from 'node:assert/strict';
    import {readFileSync} from 'node:fs';
    import {replay,validateDefinition} from './src/engine.ts';
    import {structuralKey,generate} from './src/generator.ts';
    import {CHAPTER,CONTENT_VERSION,chapterNumber} from './src/content.ts';
    import {OFFLINE_CHAPTER_DEFINITIONS,offlineChapterLevel} from './src/content-offline.ts';
    import {PROJECTS,TASKS,CAMPAIGN_VERSION,phaseStatus} from './src/campaign.ts';
    import {freshProgress} from './src/storage.ts';
    import {GOOD_IDS,GOODS} from './src/catalog.ts';
    const defs=${JSON.stringify(contract.baseline.projects.map(p=>p.definitionFile).concat(manifest.definitionFile))}.flatMap(p=>JSON.parse(readFileSync(p,'utf8')));
    assert.equal(defs.length,840);for(const d of defs){validateDefinition(d);assert.equal(replay(d,d.verifiedSolution),true,d.id);}
    assert.equal(new Set(defs.map(structuralKey)).size,840);
    const oldGoods=['j','m','b','p','h','l','eg','ch','ju','ap','or','ba','ri','te','oi','fl','su','co','ol','pa','ct','pe','gr','st'];
    for(let i=0;i<4;i++){const seed='restaurant-default-pool-'+i;
      assert.deepEqual(generate(seed,'mixed',77,{recipe:'mixed-classic'}),generate(seed,'mixed',77,{recipe:'mixed-classic',goods:oldGoods}));}
    if(${contract.runtimeEnabled}){
      assert.equal(CHAPTER.length,840);assert.equal(OFFLINE_CHAPTER_DEFINITIONS.length,840);assert.equal(TASKS.length,204);assert.equal(PROJECTS.length,9);
      assert.equal(GOOD_IDS.length,31);assert.deepEqual([GOODS.cu.name,GOODS.cu.file,GOODS.so.name,GOODS.so.file],['Кекс','cupcake','Газированная вода','soda']);
      assert.equal(CAMPAIGN_VERSION,'coastal-campaign-10');assert.equal(freshProgress().schema,12);assert.equal(CONTENT_VERSION,${JSON.stringify(contract.contentVersion)});
      assert.equal(chapterNumber('restaurant-s1-order-001'),761);assert.equal(chapterNumber('restaurant-s1-order-080'),840);
      for(let n=761;n<=840;n++)assert.equal(offlineChapterLevel(n).number,3901+n-761);
      const p=freshProgress();p.completed=CHAPTER.slice(0,760).map(s=>s.id);p.campaign.completedTasks=TASKS.filter(t=>t.phaseId!=='restaurant-1').map(t=>t.id);
      assert.equal(phaseStatus('restaurant-1',p.completed,p.campaign),'available');
    }
    const entries=defs.slice(760).map(d=>({id:d.id,key:structuralKey(d),moves:d.verifiedSolution.length}));console.log(JSON.stringify({replayed:defs.length,entries}));`;
  const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",code],{cwd:fileURLToPath(root),encoding:"utf8",timeout:60000});
  assert.equal(result.status,0,result.stderr||result.error?.message);const output=JSON.parse(result.stdout.trim());
  assert.deepEqual(output.entries,manifest.entries.map(e=>({id:e.id,key:e.structuralKey,moves:e.replayedMoves})));return output.replayed;
}
export function checkRestaurantContract() {
  const contract=readRestaurantContract(),plan=read("docs/content/full-product-plan.json");
  validateRestaurantPlan(contract,plan);validateBaseline(contract,plan);
  const manifest=validateProduction(contract),replayed=replayProduction(contract,manifest);
  return {produced:true,runtimeEnabled:contract.runtimeEnabled,restaurantOrders:80,restaurantWorks:26,repairKits:32,stars:48,
    gate:"restaurant-s1-t14 after order 38",baselineOrders:760,baselineWorks:178,replayed,catalogRange:[3901,3980],denseRange:[761,840],completeGlobalStage3:false,completeGlobalStage4:false,completeGlobalStage5:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkRestaurantContract(),null,2));
