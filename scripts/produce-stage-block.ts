// Offline production only: no Definition is generated while a player resumes a game.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CHAPTER } from "../src/content";
import { GOOD_IDS } from "../src/catalog";
import { describeStructure, generate, hash, RECIPES, structuralKey, VERSION, type Recipe } from "../src/generator";
import { replay, validateDefinition, type Definition, type Good } from "../src/engine";

const PROJECT_IDS = ["shop-1", "warehouse-1", "shop-2", "warehouse-2", "fruit-yard-1", "fruit-yard-2"] as const;
interface Slot {
  id: string; phaseId: string; globalNumber: number; chapterNumber: number;
  family: string; difficulty: string; kind: "construction-project" | "interior";
  executionContext?: "already-open-building"; requiresCompletedTaskId?: string;
}
interface PlanPhase { id: string; goodsPool: Good[]; globalStage: number; }
const plan = JSON.parse(readFileSync("docs/content/full-product-plan.json", "utf8")) as { orderSlots: Slot[]; phases: PlanPhase[] };
const currentStories = JSON.parse(readFileSync("src/levels/stage-block.json", "utf8")) as Record<string, unknown>[];
const original = JSON.parse(readFileSync("src/levels/chapter.json", "utf8")) as Definition[];
if (original.length !== 30) throw new Error("The published thirty-order baseline must stay frozen separately");
const priorStories = new Map(CHAPTER.map(story => [story.id, story]));
const pinned = new Map(original.map(def => [def.id, def]));
for (const id of PROJECT_IDS) {
  const path = `src/levels/projects/${id}.json`;
  if (!existsSync(path)) continue;
  for (const def of JSON.parse(readFileSync(path, "utf8")) as Definition[]) {
    const existing = pinned.get(def.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(def)) throw new Error(`Conflicting pinned Definition: ${def.id}`);
    pinned.set(def.id, def);
  }
}
const targetSlots = plan.orderSlots.filter(slot => PROJECT_IDS.includes(slot.phaseId as typeof PROJECT_IDS[number]));
if (targetSlots.length !== 600 || [...pinned.keys()].some(id => !targetSlots.some(slot => slot.id === id)))
  throw new Error("Unexpected Stage 1–2 catalog; existing Definitions cannot be discarded");
const keys: string[] = [];
const output: Definition[] = [];
const stories: Record<string, unknown>[] = [];
const projectLabels: Record<string, string> = {
  "shop-1": "Лавка", "warehouse-1": "Новый склад", "shop-2": "Лавка II",
  "warehouse-2": "Склад II", "fruit-yard-1": "Фруктовый павильон", "fruit-yard-2": "Большой фруктовый зал",
};
const customers = ["Нина", "Борис", "Мила", "Илья", "София", "Марина", "Олег", "Лера"];
const goodsCount = (recipe: Recipe) => recipe.counts?.reduce((sum, n) => sum + n, 0) ?? recipe.each * recipe.kinds;
function familyOf(recipe: Recipe): string {
  if ((recipe.locks ?? 0) > 1) return "multi-crate";
  if (recipe.profile === "crate" || recipe.profile === "mixed") return "supply-chain";
  if (recipe.rear) return "rear-priority";
  if (recipe.counts?.some(n => n > 3) || recipe.each > 3) return "paired-demand";
  return "front-flow";
}
function recipeCandidates(slot: Slot): Recipe[] {
  let recipes = RECIPES.filter(recipe => {
    if (slot.family === "multi-crate") return (recipe.locks ?? 0) > 1;
    if (["supply-chain", "targeted-crate"].includes(slot.family)) return ["crate", "mixed"].includes(recipe.profile);
    if (["rear-priority", "section-shelves"].includes(slot.family)) return recipe.rear > 0 && recipe.profile === "layers";
    if (slot.family === "paired-demand") return familyOf(recipe) === "paired-demand" || (recipe.counts?.some(n => n > 6) && recipe.profile === "layers");
    if (slot.family === "space-recovery") return recipe.front >= 12 && recipe.shelves <= 6;
    if (slot.family === "counter-space") return recipe.shelves >= 5 && ["front", "layers"].includes(recipe.profile);
    return recipe.profile === "front";
  });
  const preferred = recipes.filter(recipe => slot.difficulty === "rest" || slot.difficulty === "intro"
    ? goodsCount(recipe) <= 18 : slot.difficulty === "complex" ? goodsCount(recipe) >= 21 : goodsCount(recipe) <= 27);
  if (preferred.length) recipes = preferred;
  return recipes;
}
mkdirSync("src/levels/projects", { recursive: true });
for (const slot of targetSlots) {
  const phase = plan.phases.find(phase => phase.id === slot.phaseId)!;
  const localNumber = targetSlots.filter(other => other.phaseId === slot.phaseId && other.globalNumber <= slot.globalNumber).length;
  let definition = pinned.get(slot.id);
  let recipe = definition ? RECIPES.find(recipe => recipe.id === definition!.recipe) : undefined;
  if (!definition) {
    const candidates = recipeCandidates(slot);
    const assortment = phase.goodsPool.filter(good => GOOD_IDS.includes(good));
    for (let candidate = 0; candidate < 48; candidate++) {
      recipe = candidates[(hash(slot.id) + candidate) % candidates.length];
      try {
        definition = generate(`${slot.phaseId}-${localNumber}-pinned-v1-${candidate}`, recipe.profile, slot.globalNumber,
          { recipe: recipe.id, avoidStructures: keys, goods: assortment });
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Не удалось подтвердить")) throw error;
      }
    }
    if (!definition || !recipe) throw new Error(`No confirmed candidate for ${slot.id}; slot remains unavailable`);
    const construction = slot.kind === "construction-project";
    const name = `${construction ? "Заказ для стройки" : projectLabels[slot.phaseId]}: ${recipe.label}`;
    const line = construction
      ? `Новый заказ в работающем здании поможет проекту «${projectLabels[slot.phaseId]}». Соберите все тройки.`
      : recipe.locks && recipe.locks > 1 ? "Несколько партий откроются после отправок. Оставляйте место для приёмки."
      : recipe.rear ? "За свободным передним рядом откроется следующая партия. Соберите все товары."
      : "Соберите все тройки. Свободное место поможет распределить большой заказ.";
    definition = { ...definition, id: slot.id, name, note: line };
  }
  validateDefinition(definition);
  const key = structuralKey(definition);
  if (!replay(definition, definition.verifiedSolution) || keys.includes(key)) throw new Error(`Invalid or repeated Definition: ${slot.id}`);
  keys.push(key);
  output.push(definition);
  const previous = pinned.has(slot.id) ? priorStories.get(slot.id) : undefined;
  const orderContext = { kind: slot.kind, ...(slot.executionContext ? { executionContext: slot.executionContext } : {}),
    ...(slot.requiresCompletedTaskId ? { requiresCompletedTaskId: slot.requiresCompletedTaskId } : {}) };
  stories.push({ ...previous, id: slot.id, phaseId: slot.phaseId, localNumber, chapterNumber: slot.chapterNumber,
    globalStage: phase.globalStage, name: previous?.name ?? definition.name,
    customer: previous?.customer ?? customers[hash(slot.id) % customers.length], line: previous?.line ?? definition.note,
    profile: definition.profile, recipe: definition.recipe, plannedFamily: slot.family,
    implementedFamily: recipe ? familyOf(recipe) : definition.profile === "tutorial" ? "front-flow" : definition.profile,
    plannedDifficulty: slot.difficulty, orderContext });
  if (slot.globalNumber % 20 === 0) console.log(`Pinned and replayed ${slot.globalNumber}/600 orders`);
  // Save completed projects promptly so an interrupted offline run resumes their exact proofs.
  if (slot === targetSlots.filter(other => other.phaseId === slot.phaseId).at(-1)) {
    writeFileSync(`src/levels/projects/${slot.phaseId}.json`, JSON.stringify(output.filter(def =>
      targetSlots.some(other => other.phaseId === slot.phaseId && other.id === def.id)), null, 2) + "\n");
  }
}
// Reproducing the frozen Stage 1–2 block must not truncate separately produced
// projects appended later. Preserve their exact metadata only when their full
// catalog is already marked playable; this producer cannot activate a plan.
const appendedStories = currentStories.filter(story => !PROJECT_IDS.includes(story.phaseId as typeof PROJECT_IDS[number]));
const appendedKeys = new Set(keys);
for (const phaseId of new Set(appendedStories.map(story => story.phaseId as string))) {
  const appended = appendedStories.filter(story => story.phaseId === phaseId);
  const slots = (plan.orderSlots as (Slot & { status: string })[]).filter(slot => slot.phaseId === phaseId);
  const path = `src/levels/projects/${phaseId}.json`;
  if (!slots.length || slots.some(slot => slot.status === "planned-no-definition") || appended.length !== slots.length || !existsSync(path))
    throw new Error(`Cannot preserve unproduced runtime project: ${phaseId}`);
  const definitions = JSON.parse(readFileSync(path, "utf8")) as Definition[];
  if (definitions.length !== slots.length || new Set(definitions.map(def => def.id)).size !== slots.length ||
    appended.some(story => !slots.some(slot => slot.id === story.id))) throw new Error(`Invalid appended project: ${phaseId}`);
  for (const definition of definitions) {
    const slot = slots.find(slot => slot.id === definition.id);
    validateDefinition(definition);
    const key = structuralKey(definition);
    if (!slot || definition.number !== slot.globalNumber || !replay(definition, definition.verifiedSolution) || appendedKeys.has(key))
      throw new Error(`Invalid or repeated appended Definition: ${definition.id}`);
    appendedKeys.add(key);
  }
}
writeFileSync("src/levels/stage-block.json", JSON.stringify([...stories, ...appendedStories], null, 2) + "\n");
mkdirSync("artifacts", { recursive: true });
const report = { generatorVersion: VERSION, orders: output.length, uniqueStructures: keys.length,
  projects: PROJECT_IDS.map(id => ({ id, orders: stories.filter(story => story.phaseId === id).length })),
  recipes: Object.fromEntries(RECIPES.map(recipe => [recipe.id, output.filter(def => def.recipe === recipe.id).length])),
  features: output.map(def => ({ id: def.id, ...describeStructure(def) })),
  validation: "Pinned solutions replayed; exact structural duplicates excluded. Interest and minimum difficulty were not measured." };
writeFileSync("artifacts/stage-block-production.json", JSON.stringify(report, null, 2) + "\n");
const distribution = (values: (number | string)[]) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(other => other === value).length]));
const projects = PROJECT_IDS.map(id => ({ id, orders: stories.filter(story => story.phaseId === id).length,
  jsonBytes: statSync(`src/levels/projects/${id}.json`).size,
  definitionDigest: createHash("sha256").update(JSON.stringify(output.filter(definition => stories.some(story => story.phaseId === id && story.id === definition.id)))).digest("hex") }));
writeFileSync("docs/content-production-report.json", JSON.stringify({ contentVersion: "coastal-stage-1-2-v1", generatorVersion: VERSION,
  orders: output.length, structuralKeys: new Set(keys).size, replayedSolutions: output.length,
  projects, projectJsonBytes: projects.reduce((sum, project) => sum + project.jsonBytes, 0),
  metadataJsonBytes: statSync("src/levels/stage-block.json").size, parsedProjectCacheLimit: 2,
  recipes: Object.fromEntries(Object.entries(report.recipes).filter(([, count]) => count > 0)),
  generatorVersions: distribution(output.map(definition => definition.generatorVersion)),
  triples: distribution(report.features.map(feature => feature.goods / 3)),
  hiddenRows: distribution(report.features.map(feature => feature.rearRows)),
  shipments: distribution(report.features.map(feature => feature.locks)),
  initialFreeSlots: distribution(report.features.map(feature => feature.free)),
  verifiedMoveCounts: { min: Math.min(...report.features.map(feature => feature.verifiedMoves)), max: Math.max(...report.features.map(feature => feature.verifiedMoves)),
    interpretation: "Replayed proof length, not minimum solution length or measured difficulty." },
  usedGoods: [...new Set(output.flatMap(definition => definition.shelves.flatMap(shelf => [...shelf.front, ...shelf.rear.flat()]).filter(Boolean)))].sort(),
  preservedBaselineDigests: { first20: createHash("sha256").update(JSON.stringify(output.slice(0, 20))).digest("hex"),
    first30: createHash("sha256").update(JSON.stringify(output.slice(0, 30))).digest("hex") },
  notMeasured: ["Interest", "Minimum difficulty", "Duration", "Retention", "Revenue", "Browser decoded memory"] }, null, 2) + "\n");
console.log(`Stage 1–2: ${output.length} pinned, replayed, structurally distinct orders; preserved ${appendedStories.length} later records, ${appendedKeys.size} total replayed structures; first thirty untouched.`);
