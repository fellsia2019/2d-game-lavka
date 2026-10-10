// Offline production. Existing pinned Definitions are read and verified, never rewritten.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GOOD_IDS } from "../src/catalog";
import { generate, hash, RECIPES, structuralKey, VERSION, describeStructure, type Recipe } from "../src/generator";
import { initial, replay, validateDefinition, type Definition, type Good } from "../src/engine";

const root = new URL("../", import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const digest = (value: string | unknown) => createHash("sha256")
  .update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const save = (path: string, value: unknown) => {
  const url = new URL(path, root), raw = JSON.stringify(value, null, 2) + "\n";
  if (!existsSync(url) || readFileSync(url, "utf8") !== raw) writeFileSync(url, raw);
};
const contract = read("docs/content/bakery-1-contract.json");
const plan = read("docs/content/full-product-plan.json");
interface Slot {
  id: string; phaseId: string; globalNumber: number; chapterNumber: number;
  family: string; difficulty: string; kind: "construction-project" | "interior";
  executionContext?: "already-open-building"; requiresCompletedTaskId?: string;
}
const phase = plan.phases.find((phase: { id: string }) => phase.id === "bakery-1");
const slots = plan.orderSlots.filter((slot: Slot) => slot.phaseId === phase.id) as Slot[];
assert.equal(slots.length, 80);
assert.deepEqual(phase.globalOrderRange, [1081, 1160]);
assert.equal(contract.economy.opensInteriorAfterTaskId, "bakery-s1-t20");
assert.equal(contract.contractVersion, "bakery-1-production-2");
assert.equal(contract.contentVersion, "coastal-stage-1-2-bakery-v2");
const definitionsFile = "src/levels/projects/bakery-1.json";
const manifestFile = "docs/content/bakery-1-production.json";
if (existsSync(new URL(manifestFile, root))) {
  const pinnedManifest = read(manifestFile);
  if (pinnedManifest.produced) {
    assert.ok(existsSync(new URL(definitionsFile, root)), "Produced bakery Definitions are missing; do not regenerate their identities");
    const pinnedRaw = readFileSync(new URL(definitionsFile, root), "utf8");
    assert.equal(digest(pinnedRaw), pinnedManifest.sourceFileDigest, "Pinned bakery source changed; preserve the existing production manifest");
    assert.equal(digest(JSON.parse(pinnedRaw)), pinnedManifest.definitionDigest, "Pinned bakery Definitions changed; do not silently replace them");
    assert.equal(digest(pinnedRaw), contract.metadataRevision.preservedDefinitionSourceDigest, "Metadata revision must preserve the pinned bakery source");
    assert.equal(digest(JSON.parse(pinnedRaw)), contract.metadataRevision.preservedDefinitionDigest, "Metadata revision must preserve the pinned bakery Definitions");
  }
}
const oldDefinitions: Definition[] = [];
for (const project of contract.baseline.projects) {
  const raw = readFileSync(new URL(project.definitionFile, root), "utf8");
  assert.equal(digest(raw), project.sourceFileDigest, `Existing pinned file changed: ${project.id}`);
  const definitions = JSON.parse(raw) as Definition[];
  assert.equal(digest(definitions), project.definitionDigest, `Existing Definition changed: ${project.id}`);
  for (const definition of definitions) {
    validateDefinition(definition);
    assert.equal(replay(definition, definition.verifiedSolution), true, definition.id);
  }
  oldDefinitions.push(...definitions);
}
assert.equal(oldDefinitions.length, 600);
const keys = oldDefinitions.map(structuralKey), keySet = new Set(keys);
assert.equal(keySet.size, 600);
const output = existsSync(new URL(definitionsFile, root)) ? read(definitionsFile) as Definition[] : [];
assert.ok(output.length <= slots.length, "Unexpected bakery Definition count");
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
  assert.ok(recipes.length, `No existing recipe for ${slot.id}`);
  return recipes;
}
const customers = ["Нина", "Борис", "Мила", "Илья", "София", "Марина", "Олег", "Лера"];
const stories: Record<string, unknown>[] = [];
for (const [index, slot] of slots.entries()) {
  const localNumber = index + 1, denseNumber = 601 + index, catalogNumber = 1081 + index;
  assert.equal(slot.id, `bakery-s1-order-${String(localNumber).padStart(3, "0")}`);
  assert.equal(slot.globalNumber, catalogNumber);
  const interior = localNumber > contract.economy.constructionOrders;
  const assortment = (phase.goodsPool as Good[]).filter(good => interior || !["bg", "cr"].includes(good));
  assert.ok(assortment.every(good => GOOD_IDS.includes(good)), "Produce the bakery goods registry before its Definitions");
  // Bakery goods arrive as a supply after the entrance counter and trays are paid.
  const required = (interior ? ["bg", "cr"] : []) as Good[];
  let definition = output[index];
  let recipe = definition && RECIPES.find(recipe => recipe.id === definition.recipe);
  if (!definition) {
    const candidates = recipeCandidates(slot);
    for (let candidate = 0; candidate < 96; candidate++) {
      recipe = candidates[(hash(slot.id) + candidate) % candidates.length];
      try {
        definition = generate(`bakery-1-${localNumber}-pinned-v1-${candidate}`, recipe.profile, catalogNumber,
          { recipe: recipe.id, avoidStructures: keys, goods: assortment, requireGoods: required });
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Не удалось подтвердить")) throw error;
      }
    }
    if (!definition || !recipe) throw new Error(`No replayed candidate for ${slot.id}; order stays unavailable`);
    const title = localNumber <= 32 ? "Материалы для пекарни" : interior ? "Пекарня" : "Заказ для первой печи";
    const line = localNumber <= 32
      ? "Подготовим материалы для новой пекарни. Соберите все тройки."
      : !interior ? "Соберём заказ в работающей лавке и подготовим оборудование пекарни."
      : recipe.locks ? "Свежая выпечка прибудет партиями. Оставляйте свободное место для приёмки."
      : recipe.rear ? "За первым рядом ждёт свежая выпечка. Соберите все товары для покупателей."
      : "Багеты и круассаны готовы. Соберите все тройки для покупателей.";
    definition = { ...definition, id: slot.id, name: `${title}: ${recipe.label}`, note: line };
    output.push(definition);
  }
  assert.equal(definition.id, slot.id, "Pinned bakery identity changed");
  assert.equal(definition.number, catalogNumber, "Definition.number must retain its stable catalog number");
  assert.equal(definition.generatorVersion, VERSION, "Do not silently upgrade a pinned bakery generator version");
  validateDefinition(definition);
  assert.equal(replay(definition, definition.verifiedSolution), true, definition.id);
  const goods = Object.keys(initial(definition).goals);
  assert.ok(goods.every(good => assortment.includes(good as Good)), `Premature/unknown good in ${slot.id}`);
  assert.ok(required.every(good => goods.includes(good)), `Missing bakery assortment in ${slot.id}`);
  const key = structuralKey(definition);
  assert.ok(!keySet.has(key), `Structural duplicate: ${slot.id}`);
  keySet.add(key); keys.push(key);
  assert.ok(recipe, `Unknown pinned recipe ${definition.recipe}`);
  stories.push({ id: slot.id, phaseId: phase.id, localNumber, chapterNumber: slot.chapterNumber,
    catalogNumber, denseNumber, globalStage: phase.globalStage,
    name: definition.name.replace(/^Заказ для первой печи/, "Заказ для витрины"),
    customer: customers[hash(slot.id) % customers.length], line: definition.note,
    profile: definition.profile, recipe: definition.recipe, plannedFamily: slot.family,
    implementedFamily: familyOf(recipe), plannedDifficulty: slot.difficulty,
    orderContext: { kind: slot.kind,
      ...(slot.executionContext ? { executionContext: slot.executionContext } : {}),
      ...(slot.requiresCompletedTaskId ? { requiresCompletedTaskId: slot.requiresCompletedTaskId } : {}) } });
  if (localNumber % 10 === 0) {
    save(definitionsFile, output);
    console.log(`Pinned and replayed bakery ${localNumber}/80; ${keySet.size} distinct structures including baseline`);
  }
}
save(definitionsFile, output);
const activate = process.argv.includes("--activate");
let currentStories: { id: string; phaseId: string }[] | undefined;
if (activate) {
  currentStories = read("src/levels/stage-block.json");
  const baselineIds = contract.baseline.projects.flatMap((project: { orderIds: string[] }) => project.orderIds);
  assert.deepEqual(currentStories!.slice(0, 600).map(story => story.id), baselineIds);
  assert.ok(currentStories!.length === 600 || currentStories!.length === 680, "Unexpected playable block size");
  if (currentStories!.length === 680) {
    const existingDigest = digest(currentStories!.slice(600));
    assert.ok(existingDigest === digest(stories) || existingDigest === contract.metadataRevision.previousStoriesDigest,
      "Do not rewrite bakery metadata outside the explicitly versioned revision");
  }
}
const manifest = {
  productionVersion: contract.contractVersion, contentVersion: contract.contentVersion, phaseId: phase.id,
  generatorVersion: VERSION, produced: true, runtimeEnabled: process.argv.includes("--activate") || contract.runtimeEnabled,
  orders: 80, works: 26, baselineOrders: 600, baselineWorks: 126,
  definitionFile: definitionsFile, sourceFileDigest: digest(readFileSync(new URL(definitionsFile, root), "utf8")),
  definitionDigest: digest(output), storiesDigest: digest(stories),
  metadataRevision: contract.metadataRevision,
  catalogRange: [1081, 1160], denseRange: [601, 680], localRange: [1, 80],
  numbering: "Dense numbers index only real playable records; Definition.number is the stable catalog number.",
  entries: output.map((definition, index) => ({ id: definition.id, localNumber: index + 1,
    denseNumber: index + 601, catalogNumber: definition.number, seed: definition.seed,
    generatorVersion: definition.generatorVersion, structuralKey: structuralKey(definition),
    replayedMoves: definition.verifiedSolution.length })),
  stories, features: output.map(definition => ({ id: definition.id, ...describeStructure(definition) })),
  baseline: contract.baseline.projects.map(({ id, sourceFileDigest, definitionDigest }: Record<string, string>) => ({ id, sourceFileDigest, definitionDigest })),
  validation: "All 80 pinned solutions replayed through the engine; 680 exact structural keys are distinct. Proof length is not minimum difficulty or measured interest.",
};
save(manifestFile, manifest);

if (activate) {
  // Explicit integration step after registered room art and runtime support are ready.
  save("src/levels/stage-block.json", [...currentStories!.slice(0, 600), ...stories]);
  for (const task of phase.tasks) task.status = "implemented";
  for (const slot of slots) {
    Object.assign(slot, { status: "implemented-definition", catalogNumber: slot.globalNumber,
      denseNumber: 601 + slots.indexOf(slot), definitionFile: definitionsFile });
  }
  for (const good of plan.goods.filter((good: { introducedIn: string }) => good.introducedIn === "bakery-1")) good.status = "implemented";
  plan.planVersion = "coastal-full-product-plan-6";
  plan.nextDelivery = { scope: "Полные Stage 1–2 и первая пекарня; остальной Stage 3 ещё не готов",
    phaseIds: [...contract.baseline.projectIds, phase.id], orders: 680, tasks: 152,
    requirements: [...new Set([...plan.nextDelivery.requirements.filter((requirement: string) => !requirement.includes("600 Definition")),
      "Первая пекарня: 80 закреплённых Definition и 26 зарегистрированных результатов",
      "Все 680 решений воспроизведены; каталожные номера отделены от индексов выдачи"])],
    status: "implemented-internal-block", completeGlobalStage3: false };
  plan.deliveryStatus = { existingOrders: 680, plannedOrders: 5320, existingTasks: 152,
    plannedTasks: 592, fullyImplementedPlannedPhases: 7 };
  save("docs/content/full-product-plan.json", plan);
  contract.planVersion = plan.planVersion;
  contract.state = "implemented";
  contract.produced = true; contract.runtimeEnabled = true;
  contract.numbering.denseAppend = { first: 601, last: 680, status: "runtime" };
  delete contract.numbering.proposedDenseAppend;
  contract.implementedBlock ??= contract.proposedImplementedBlock;
  delete contract.proposedImplementedBlock;
  contract.productionManifest = manifestFile;
  for (const room of contract.rooms) room.status = "implemented";
  for (const task of contract.tasks) task.status = "implemented";
  contract.notProduced = ["Other 760 orders and 100 works of global Stage 3", "Stages 4–6", "Release SDK and monetization"];
  contract.validation = manifest.validation;
  save("docs/content/bakery-1-contract.json", contract);
  const check = spawnSync(process.execPath, ["scripts/check-content-plan.mjs", "--write"],
    { cwd: fileURLToPath(root), encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr || check.error?.message);
  process.stdout.write(check.stdout);
}
console.log(`Bakery: 80 pinned Definitions, ${keySet.size} replayed distinct structures; ${process.argv.includes("--activate") ? "runtime integrated" : "prepared; activation is a separate integration step"}.`);
