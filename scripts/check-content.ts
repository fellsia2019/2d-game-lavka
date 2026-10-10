import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  CHAPTER,
  CONTENT_VERSION,
} from "../src/content";
import { OFFLINE_CHAPTER_DEFINITIONS as CHAPTER_DEFINITIONS, offlineChapterLevel as chapterLevel } from "../src/content-offline";
import { validateDefinition, replay } from "../src/engine";
import { describeStructure, VERSION } from "../src/generator";
import { RENOVATIONS } from "../src/renovations";
import { GOODS, GOOD_IDS } from "../src/catalog";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_PHASES, FIRST_SHOP_PHASE, TASKS, PROJECTS, CAMPAIGN_VERSION, orderCurrency } from "../src/campaign";
import { SCENE_ASSETS } from "../src/campaign-scene";
import { MATERIALS } from "../src/order-supplies";
if (CHAPTER.some(order=>order.phaseId==="terrace-1")) {
  const terrace=PROJECTS.find(project=>project.id==="terrace-1");
  const delivery=JSON.parse(readFileSync("docs/content/full-product-plan.json","utf8")).nextDelivery;
  if(CHAPTER.length!==delivery.orders || TASKS.length!==delivery.tasks || PROJECTS.length!==delivery.phaseIds.length)
    throw new Error("Runtime must expose exactly the latest produced delivery");
  if(delivery.phaseIds.at(-1)==="terrace-1" && (CONTENT_VERSION!=="coastal-stage-1-2-bakery-terrace-v1" || CAMPAIGN_VERSION!=="coastal-campaign-9"))
    throw new Error("Terrace delivery content and campaign versions differ");
  if(terrace?.requiresCompletedPhases.join()!=="bakery-1")
    throw new Error("Terrace prototype must use the explicit bakery dependency");
}
for (const file of [
  ...Object.values(GOODS).map((g) => `${g.file}.webp`),
  ...Object.values(MATERIALS).map((material) => `${material.file}.webp`),
  "shelf.webp",
  "shop.webp",
  "counter.webp",
  "garden.webp",
  ...SCENE_ASSETS,
]) {
  const path = `public/assets/${file}`;
  if (!/^[a-z0-9-]+\.(webp|svg)$/.test(file) || !existsSync(path) || !statSync(path).size)
    throw new Error(`Missing runtime asset: ${path}`);
}
const structures = new Set<string>(),
  ids = new Set<string>();
if (
  CHAPTER_DEFINITIONS.length !== CHAPTER.length ||
  new Set(CHAPTER_DEFINITIONS.map((d) => d.id)).size !== CHAPTER.length
)
  throw new Error(
    "Chapter catalog must have exactly one Definition per story entry",
  );
const levels = CHAPTER.map((story, i) => {
  const d = chapterLevel(i + 1);
  validateDefinition(d);
  if (!replay(d, d.verifiedSolution) || ids.has(d.id))
    throw new Error(`Invalid level ${d.id}`);
  ids.add(d.id);
  const info = describeStructure(d);
  if (structures.has(info.key))
    throw new Error(`Repeated chapter structure: ${d.id}`);
  structures.add(info.key);
  return { id: d.id, name: story.name, seed: d.seed, ...info };
});
const cost = TASKS.reduce((n, r) => n + r.cost, 0);
if (cost > CHAPTER.length)
  throw new Error("Not enough chapter rewards for tasks");
const currencies = ["stars", "repairKits"] as const;
const earned = Object.fromEntries(currencies.map(currency => [currency, CHAPTER.filter(order => orderCurrency(order.id) === currency).length]));
const spent = Object.fromEntries(currencies.map(currency => [currency, TASKS.filter(task => task.currency === currency).reduce((sum, task) => sum + task.cost, 0)]));
for (const currency of currencies) if (earned[currency] !== spent[currency]) throw new Error(`Unbalanced ${currency}`);
for (const phase of CAMPAIGN_PHASES) {
  const producedOrders = CHAPTER.filter(order => order.phaseId === phase.id);
  const producedTasks = TASKS.filter(task => phase.taskIds.includes(task.id));
  if (producedOrders.length > phase.orderTarget || producedTasks.length > phase.taskTarget ||
    producedTasks.reduce((sum, task) => sum + task.cost, 0) > producedOrders.length)
    throw new Error(`Produced phase budget mismatch ${phase.id}`);
}
if (new Set(TASKS.map(task => task.id)).size !== TASKS.length ||
  CAMPAIGN_CHAPTERS.some(chapter => chapter.orderIds.join() !== CHAPTER.filter(order =>
    CAMPAIGN_PHASES.some(phase => phase.areaId === chapter.areaId && phase.id === order.phaseId)).map(order => order.id).join()) ||
  CAMPAIGN_CHAPTERS.flatMap(chapter => chapter.taskIds).length !== TASKS.length)
  throw new Error("Invalid playable campaign catalog");
const plan = JSON.parse(readFileSync("docs/content/full-product-plan.json", "utf8"));
const producedGoods = plan.goods.filter((good: { status: string }) => good.status !== "planned");
if (producedGoods.map((good: { id: string }) => good.id).sort().join() !== [...GOOD_IDS].sort().join())
  throw new Error("Plan goods production status mismatch");
const producedTasks = plan.phases.flatMap((phase: { tasks: { id: string; cost: number; status: string }[] }) => phase.tasks)
  .filter((task: { status: string }) => task.status !== "planned");
if (producedTasks.map((task: { id: string; cost: number }) => `${task.id}:${task.cost}`).join() !==
  TASKS.map(task => `${task.id}:${task.cost}`).join()) throw new Error("Plan task production status mismatch");
for (const [index, story] of CHAPTER.entries()) {
  const slot = plan.orderSlots.find((s: { id: string }) => s.id === story.id);
  if (!slot || slot.status === "planned-no-definition" || slot.phaseId !== story.phaseId || slot.globalNumber !== (story.catalogNumber ?? index + 1))
    throw new Error(`Plan order production status mismatch ${story.id}`);
}
writeFileSync(
  "docs/content-report.json",
  JSON.stringify(
    {
      contentVersion: CONTENT_VERSION,
      generatorVersion: VERSION,
      levels,
      legacyRenovations: RENOVATIONS,
      campaignVersion: CAMPAIGN_VERSION,
      campaignChapters: CAMPAIGN_CHAPTERS,
      campaignPhases: CAMPAIGN_PHASES,
      projects: PROJECTS,
      campaignTasks: TASKS,
      starsAvailable: earned.stars,
      starsRequired: spent.stars,
      repairKitsAvailable: earned.repairKits,
      repairKitsRequired: spent.repairKits,
      currentPhaseTarget: { orders: FIRST_SHOP_PHASE.orderTarget, tasks: FIRST_SHOP_PHASE.taskTarget, stars: FIRST_SHOP_PHASE.starTarget, repairKits: FIRST_SHOP_PHASE.repairKitTarget },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Контент: ${levels.length} решений воспроизведены, структуры различны; задачи ${spent.stars}/${earned.stars} звёзд и ${spent.repairKits}/${earned.repairKits} ремкомплектов.`,
);
