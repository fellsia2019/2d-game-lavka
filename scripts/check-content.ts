import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  CHAPTER,
  CHAPTER_DEFINITIONS,
  chapterLevel,
  CONTENT_VERSION,
} from "../src/content";
import { validateDefinition, replay } from "../src/engine";
import { describeStructure, VERSION } from "../src/generator";
import { RENOVATIONS } from "../src/renovations";
import { GOODS, GOOD_IDS } from "../src/catalog";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_PHASES, FIRST_SHOP_PHASE, SHOP_STEPS, CAMPAIGN_VERSION } from "../src/campaign";
import { SCENE_ASSETS } from "../src/campaign-scene";
for (const file of [
  ...Object.values(GOODS).map((g) => g.file),
  "shelf",
  "shop",
  "counter",
  "garden",
  ...SCENE_ASSETS.map(file => file.replace(/\.webp$/, "")),
]) {
  const path = `public/assets/${file}.webp`;
  if (!/^[a-z0-9-]+$/.test(file) || !existsSync(path) || !statSync(path).size)
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
const cost = SHOP_STEPS.reduce((n, r) => n + r.cost, 0);
if (cost > CHAPTER.length)
  throw new Error("Not enough chapter stars for repairs");
for (const phase of CAMPAIGN_PHASES) {
  const producedOrders = CHAPTER.filter(order => order.phaseId === phase.id);
  const producedTasks = SHOP_STEPS.filter(task => phase.taskIds.includes(task.id));
  if (producedOrders.length > phase.orderTarget || producedTasks.length > phase.taskTarget ||
    producedTasks.reduce((sum, task) => sum + task.cost, 0) > producedOrders.length)
    throw new Error(`Produced phase budget mismatch ${phase.id}`);
}
if (new Set(SHOP_STEPS.map(task => task.id)).size !== SHOP_STEPS.length ||
  CAMPAIGN_CHAPTERS.some(chapter => chapter.orderIds.join() !== CHAPTER.filter(order =>
    CAMPAIGN_PHASES.some(phase => phase.areaId === chapter.areaId && phase.id === order.phaseId)).map(order => order.id).join()) ||
  CAMPAIGN_CHAPTERS.flatMap(chapter => chapter.taskIds).length !== SHOP_STEPS.length)
  throw new Error("Invalid playable campaign catalog");
const plan = JSON.parse(readFileSync("docs/content/full-product-plan.json", "utf8"));
const producedGoods = plan.goods.filter((good: { status: string }) => good.status !== "planned");
if (producedGoods.map((good: { id: string }) => good.id).sort().join() !== [...GOOD_IDS].sort().join())
  throw new Error("Plan goods production status mismatch");
const producedTasks = plan.phases.flatMap((phase: { tasks: { id: string; cost: number; status: string }[] }) => phase.tasks)
  .filter((task: { status: string }) => task.status !== "planned");
if (producedTasks.map((task: { id: string; cost: number }) => `${task.id}:${task.cost}`).join() !==
  SHOP_STEPS.map(task => `${task.id}:${task.cost}`).join()) throw new Error("Plan task production status mismatch");
for (const [index, story] of CHAPTER.entries()) {
  const slot = plan.orderSlots.find((s: { id: string }) => s.id === story.id);
  if (!slot || slot.status === "planned-no-definition" || slot.phaseId !== story.phaseId || slot.globalNumber !== index + 1)
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
      shopTasks: SHOP_STEPS,
      starsAvailable: CHAPTER.length,
      starsRequired: cost,
      currentPhaseTarget: { orders: FIRST_SHOP_PHASE.orderTarget, tasks: FIRST_SHOP_PHASE.taskTarget, stars: FIRST_SHOP_PHASE.starTarget },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Контент: ${levels.length} решений воспроизведены, структуры различны; ремонт ${cost}/${CHAPTER.length} звёзд.`,
);
