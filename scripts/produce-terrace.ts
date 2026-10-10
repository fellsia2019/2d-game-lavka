// Offline terrace production: pinned Definitions and every earlier record stay exact.
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
const digest = (value: string | unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const save = (path: string, value: unknown) => {
  const url = new URL(path, root), raw = JSON.stringify(value, null, 2) + "\n";
  if (!existsSync(url) || readFileSync(url, "utf8") !== raw) writeFileSync(url, raw);
};
const contract = read("docs/content/terrace-1-contract.json"), plan = read("docs/content/full-product-plan.json");
interface Slot {
  id: string; phaseId: string; globalNumber: number; chapterNumber: number;
  family: string; difficulty: string; kind: "construction-project" | "interior";
  executionContext?: "already-open-building"; requiresCompletedTaskId?: string;
}
const phase = plan.phases.find((phase: { id: string }) => phase.id === "terrace-1");
const slots = plan.orderSlots.filter((slot: Slot) => slot.phaseId === phase.id) as Slot[];
assert.equal(slots.length, 80); assert.deepEqual(phase.globalOrderRange, [2241, 2320]);
assert.equal(contract.economy.opensInteriorAfterTaskId, "terrace-s1-t14");
assert.equal(contract.contractVersion, "terrace-1-production-1");
const definitionsFile = "src/levels/projects/terrace-1.json", manifestFile = "docs/content/terrace-1-production.json";
const priorManifest = existsSync(new URL(manifestFile, root)) ? read(manifestFile) : undefined;
const wasPinned = priorManifest?.produced === true;
if (wasPinned) {
  assert.ok(existsSync(new URL(definitionsFile, root)), "Produced terrace Definitions are missing; never regenerate pinned identities");
  const raw = readFileSync(new URL(definitionsFile, root), "utf8");
  assert.equal(digest(raw), priorManifest.sourceFileDigest, "Pinned terrace source changed; do not reseal it");
  assert.equal(digest(JSON.parse(raw)), priorManifest.definitionDigest, "Pinned terrace Definitions changed");
}
const oldDefinitions: Definition[] = [];
for (const project of contract.baseline.projects) {
  const raw = readFileSync(new URL(project.definitionFile, root), "utf8");
  assert.equal(digest(raw), project.sourceFileDigest, `Existing pinned file changed: ${project.id}`);
  const definitions = JSON.parse(raw) as Definition[];
  assert.equal(digest(definitions), project.definitionDigest, `Existing Definition changed: ${project.id}`);
  for (const definition of definitions) { validateDefinition(definition); assert.equal(replay(definition, definition.verifiedSolution), true, definition.id); }
  oldDefinitions.push(...definitions);
}
assert.equal(oldDefinitions.length, 680);
const currentStories = read("src/levels/stage-block.json") as { id: string; phaseId: string }[];
assert.equal(digest(currentStories.slice(0, 680)), contract.baseline.storiesDigest, "Existing 680 metadata must remain exact");
const keys = oldDefinitions.map(structuralKey), keySet = new Set(keys);
assert.equal(keySet.size, 680);
const output = existsSync(new URL(definitionsFile, root)) ? read(definitionsFile) as Definition[] : [];
assert.ok(output.length <= slots.length, "Unexpected terrace Definition count");
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
  return recipes.filter(recipe => recipe.kinds >= (slot.kind === "interior" ? 3 : 0));
}

const customers = ["Нина", "Борис", "Мила", "Илья", "София", "Марина", "Олег", "Лера"];
const stories: Record<string, unknown>[] = [];
for (const [index, slot] of slots.entries()) {
  const localNumber = index + 1, denseNumber = 681 + index, catalogNumber = 2241 + index;
  assert.equal(slot.id, `terrace-s1-order-${String(localNumber).padStart(3, "0")}`);
  assert.equal(slot.globalNumber, catalogNumber);
  const interior = localNumber > 38;
  const newGoods = contract.newGoods as Good[];
  const assortment = (phase.goodsPool as Good[]).filter(good => interior || !newGoods.includes(good));
  assert.ok(assortment.every(good => GOOD_IDS.includes(good)), "Produce the terrace goods registry before its Definitions");
  const required = interior ? newGoods : [];
  let definition = output[index];
  let recipe = definition && RECIPES.find(recipe => recipe.id === definition.recipe);
  if (!definition) {
    const candidates = recipeCandidates(slot);
    assert.ok(candidates.length, `No existing recipe for ${slot.id}`);
    for (let candidate = 0; candidate < 96; candidate++) {
      recipe = candidates[(hash(slot.id) + candidate) % candidates.length];
      try {
        definition = generate(`terrace-1-${localNumber}-pinned-v1-${candidate}`, recipe.profile, catalogNumber,
          { recipe: recipe.id, avoidStructures: keys, goods: assortment, requireGoods: required });
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Не удалось подтвердить")) throw error;
      }
    }
    if (!definition || !recipe) throw new Error(`No replayed candidate for ${slot.id}; order stays unavailable`);
    const title = localNumber <= 32 ? "Материалы для террасы" : interior ? "Гости террасы" : "Заказ для гостевых столов";
    const line = localNumber <= 32 ? "Соберём материалы для настила, опор и гостевого навеса."
      : !interior ? "Подготовим гостевые столы заказом в работающем здании."
      : recipe.locks ? "Пироги, булочки и лимонад прибудут партиями. Оставляйте место для приёмки."
      : recipe.rear ? "За первым рядом ждут угощения. Соберите все товары для гостей."
      : "Пироги, булочки и лимонад готовы. Соберите все тройки для гостей.";
    definition = { ...definition, id: slot.id, name: `${title}: ${recipe.label}`, note: line };
    output.push(definition);
  }
  assert.equal(definition.id, slot.id, "Pinned terrace identity changed");
  assert.equal(definition.number, catalogNumber, "Definition.number must retain its stable catalog number");
  assert.equal(definition.generatorVersion, VERSION, "Do not upgrade a pinned terrace generator version");
  validateDefinition(definition); assert.equal(replay(definition, definition.verifiedSolution), true, definition.id);
  const goods = Object.keys(initial(definition).goals);
  assert.ok(goods.every(good => assortment.includes(good as Good)), `Premature/unknown good in ${slot.id}`);
  assert.ok(required.every(good => goods.includes(good)), `Missing terrace assortment in ${slot.id}`);
  const key = structuralKey(definition);
  assert.ok(!keySet.has(key), `Structural duplicate: ${slot.id}`); keySet.add(key); keys.push(key);
  assert.ok(recipe, `Unknown pinned recipe ${definition.recipe}`);
  stories.push({ id: slot.id, phaseId: phase.id, localNumber, chapterNumber: slot.chapterNumber,
    catalogNumber, denseNumber, globalStage: phase.globalStage, name: definition.name,
    customer: customers[hash(slot.id) % customers.length], line: definition.note,
    profile: definition.profile, recipe: definition.recipe, plannedFamily: slot.family,
    implementedFamily: familyOf(recipe), plannedDifficulty: slot.difficulty,
    orderContext: { kind: slot.kind, ...(slot.executionContext ? { executionContext: slot.executionContext } : {}),
      ...(slot.requiresCompletedTaskId ? { requiresCompletedTaskId: slot.requiresCompletedTaskId } : {}) } });
  if (localNumber % 10 === 0) {
    if (!wasPinned) save(definitionsFile, output);
    console.log(`Pinned and replayed terrace ${localNumber}/80; ${keySet.size} distinct structures including baseline`);
  }
}
if (!wasPinned) save(definitionsFile, output);
const activate = process.argv.includes("--activate");
if (activate) {
  assert.ok(currentStories.length === 680 || currentStories.length === 760, "Unexpected playable block size");
  if (currentStories.length === 760) assert.deepEqual(currentStories.slice(680), stories, "Do not rewrite pinned terrace metadata");
}
const manifest = {
  productionVersion: contract.contractVersion, contentVersion: contract.contentVersion, phaseId: phase.id,
  generatorVersion: VERSION, produced: true, runtimeEnabled: activate || contract.runtimeEnabled,
  orders: 80, works: 26, baselineOrders: 680, baselineWorks: 152,
  definitionFile: definitionsFile, sourceFileDigest: digest(readFileSync(new URL(definitionsFile, root), "utf8")),
  definitionDigest: digest(output), storiesDigest: digest(stories),
  catalogRange: [2241,2320], denseRange: [681,760], localRange: [1,80],
  numbering: "Dense numbers index only real playable records; Definition.number is the stable catalog number.",
  runtimeDeliveryOverride: contract.runtimeDeliveryOverride,
  entries: output.map((definition, index) => ({ id: definition.id, localNumber: index + 1,
    denseNumber: index + 681, catalogNumber: definition.number, seed: definition.seed,
    generatorVersion: definition.generatorVersion, structuralKey: structuralKey(definition), replayedMoves: definition.verifiedSolution.length })),
  stories, features: output.map(definition => ({ id: definition.id, ...describeStructure(definition) })),
  baseline: contract.baseline.projects.map(({ id, sourceFileDigest, definitionDigest }: Record<string, string>) => ({ id, sourceFileDigest, definitionDigest })),
  validation: "All 80 pinned solutions replayed through the engine; 760 exact structural keys are distinct. Proof length is not minimum difficulty or measured interest.",
};
save(manifestFile, manifest);
contract.produced = true;
if (activate) {
  save("src/levels/stage-block.json", [...currentStories.slice(0,680), ...stories]);
  for (const task of phase.tasks) task.status = "implemented";
  for (const slot of slots) Object.assign(slot, { status: "implemented-definition", catalogNumber: slot.globalNumber,
    denseNumber: 681 + slots.indexOf(slot), definitionFile: definitionsFile });
  for (const good of plan.goods.filter((good: { id: string }) => contract.newGoods.includes(good.id))) {
    good.status = "implemented"; good.productionPhase = "terrace-1";
  }
  plan.planVersion = contract.planVersion;
  plan.nextDelivery = { scope: "Stage 1–2, bakery I and a terrace prototype; global Stage 3 and 4 remain incomplete",
    phaseIds: [...contract.baseline.projectIds, phase.id], orders: 760, tasks: 178,
    requirements: [...new Set([...plan.nextDelivery.requirements, "Terrace: 80 pinned Definitions and 26 registered results; explicit prototype dependencies"] )],
    status: "implemented-internal-block", completeGlobalStage3: false, completeGlobalStage4: false };
  plan.deliveryStatus = { existingOrders:760, plannedOrders:5240, existingTasks:178, plannedTasks:566, fullyImplementedPlannedPhases:8 };
  plan.orderSupplyPolicy = { ...plan.orderSupplyPolicy, version:2, implementedScope:plan.nextDelivery.phaseIds,
    repairTaskPrefixes:{ ...plan.orderSupplyPolicy.repairTaskPrefixes, "bakery-1":12, "terrace-1":12 },
    implementedRepairOrders:243, implementedFoodOrders:517 };
  save("docs/content/full-product-plan.json", plan);
  contract.state = "implemented"; contract.runtimeEnabled = true; contract.numbering.denseAppend.status = "runtime";
  contract.implementedBlock ??= contract.proposedImplementedBlock; delete contract.proposedImplementedBlock;
  for (const room of contract.rooms) room.status = "implemented";
  for (const task of contract.tasks) task.status = "implemented";
  save("docs/content/terrace-1-contract.json", contract);
  const check = spawnSync(process.execPath, ["scripts/check-content-plan.mjs", "--write"], { cwd:fileURLToPath(root), encoding:"utf8" });
  assert.equal(check.status,0,check.stderr || check.error?.message); process.stdout.write(check.stdout);
} else save("docs/content/terrace-1-contract.json", contract);
console.log(`Terrace:80 pinned Definitions, ${keySet.size} replayed distinct structures; ${activate ? "runtime integrated" : "prepared; awaiting scene integration"}.`);
