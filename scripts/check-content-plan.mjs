// Validate design arithmetic and dependencies. This does not solve level Definitions.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8").replace(/^\uFEFF/, ""));
const plan = read("docs/content/full-product-plan.json");
const assert = (value, message) => { if (!value) throw new Error(message); };
const sum = values => values.reduce((a, b) => a + b, 0);
const unique = (values, label) => assert(new Set(values).size === values.length, `Duplicate ${label}`);
const phases = new Map(plan.phases.map(p => [p.id, p]));
const goods = new Map(plan.goods.map(g => [g.id, g]));
const families = new Set(plan.orderFamilies.map(f => f.id));
const tasks = plan.phases.flatMap(p => p.tasks);

assert(plan.status === "design-not-runtime", "Design must remain separate from runtime");
unique(plan.chapters.map(c => c.id), "chapter id");
unique(plan.phases.map(p => p.id), "phase id");
unique(plan.route, "route phase");
unique(tasks.map(t => t.id), "task id");
unique(plan.orderSlots.map(s => s.id), "order id");
unique(plan.goods.map(g => g.id), "good id");
unique(plan.characters.map(c => c.id), "character id");
unique(plan.orderFamilies.map(f => f.id), "order family");
for (const g of plan.goods) assert(phases.has(g.introducedIn) && g.availableFromGlobalStage === phases.get(g.introducedIn).globalStage, `Unknown goods introduction ${g.id}`);
for (const category of plan.byteBudget.categories) assert(Number.isSafeInteger(category.bytes) && category.bytes > 0, `Invalid byte budget ${category.id}`);
assert(plan.chapters.length === plan.totals.chapters, "Chapter total mismatch");
assert(plan.totals.orders === 6000 && plan.totals.phases === 36 && plan.totals.globalStages === 6 && plan.totals.tasks === 756, "Accepted 6000-order product scope mismatch");
assert(plan.globalStages.length === 6, "Global stage total mismatch");
assert(plan.phases.length === plan.totals.phases && plan.route.length === phases.size, "Phase total mismatch");
assert(tasks.length === plan.totals.tasks, "Task total mismatch");
assert(plan.orderSlots.length === plan.totals.orders, "Order slot total mismatch");
assert(plan.goods.length === 48 && plan.characters.length === 12, "Goods/characters total mismatch");
assert(plan.totals.starsEarned === plan.orderSlots.length, "One fresh order must award one star");
assert(sum(tasks.map(t => t.cost)) === plan.totals.starsSpent, "Star spending total mismatch");
assert(plan.totals.starsSpent === plan.totals.starsEarned, "Campaign star budget mismatch");
assert(sum(plan.byteBudget.categories.map(c => c.bytes)) === plan.byteBudget.shippingTarget, "Byte budget mismatch");
assert(plan.byteBudget.shippingTarget < plan.byteBudget.hardLimitExclusive, "Byte reserve missing");
assert(plan.byteBudget.hardLimitExclusive === 80_000_000, "Repository size limit changed");

const completed = new Set();
const chapterOrders = new Map();
const summary = [];
let nextGlobal = 1;
let earned = 0;
let spent = 0;
let minimumBalance = 0;
let maxWaitForNextTask = 0;
for (const phaseId of plan.route) {
  const p = phases.get(phaseId);
  assert(p, `Unknown phase ${phaseId}`);
  const chapter = plan.chapters.find(c => c.id === p.areaId);
  assert(chapter && chapter.phaseIds.includes(p.id), `Invalid chapter ${p.id}`);
  assert(Number.isInteger(p.stage) && p.stage >= 1 && p.stage <= 6, `Invalid stage ${p.id}`);
  assert(p.orderCount === [0, 80, 120, 160, 200, 220, 220][p.stage], `Phase size mismatch ${p.id}`);
  assert(p.tasks.length === (p.stage === 1 ? 26 : 20), `Phase task count mismatch ${p.id}`);
  assert(p.globalStage === Math.max(p.stage, chapter.introductionStage), `Global stage mismatch ${p.id}`);
  assert(p.earningPolicy === (p.construction ? "project-in-open-building-then-gated-interior" : "interior-of-open-building"), `Invalid project earning policy ${p.id}`);
  for (const dependency of p.requiresCompletedPhases) {
    assert(phases.has(dependency) && completed.has(dependency), `Unsatisfied/cyclic dependency ${p.id} -> ${dependency}`);
  }
  if (p.stage > 1) assert(p.requiresCompletedPhases.includes(`${p.areaId}-${p.stage - 1}`), `Missing return dependency ${p.id}`);
  if (p.globalStage > 1) for (const gate of plan.globalStages[p.globalStage - 2].completionPhaseIds)
    assert(p.requiresCompletedPhases.includes(gate), `Missing global gate ${p.id} -> ${gate}`);
  const previousLocal = chapterOrders.get(p.areaId) ?? 0;
  assert(p.globalOrderRange[0] === nextGlobal && p.globalOrderRange[1] === nextGlobal + p.orderCount - 1, `Global range mismatch ${p.id}`);
  assert(p.localOrderRange[0] === previousLocal + 1 && p.localOrderRange[1] === previousLocal + p.orderCount, `Chapter range mismatch ${p.id}`);
  const slots = plan.orderSlots.filter(s => s.phaseId === p.id);
  assert(slots.length === p.orderCount, `Missing order slots ${p.id}`);
  for (const [index, slot] of slots.entries()) {
    assert(slot.globalNumber === nextGlobal + index && slot.chapterNumber === previousLocal + index + 1, `Order numbering mismatch ${slot.id}`);
    assert(families.has(slot.family), `Unknown order family ${slot.id}`);
    assert(["tutorial", "intro", "rest", "standard", "complex"].includes(slot.difficulty), `Unknown planned difficulty ${slot.id}`);
    assert(["existing-definition", "implemented-definition", "planned-no-definition"].includes(slot.status), `Incorrect verification status ${slot.id}`);
    assert(["construction-project", "interior"].includes(slot.kind), `Unknown order purpose ${slot.id}`);
  }
  unique(p.goodsPool, `goods pool ${p.id}`);
  for (const id of p.goodsPool) {
    const good = goods.get(id);
    assert(good && phases.get(good.introducedIn).globalStage <= p.globalStage, `Premature/unknown good ${id} in ${p.id}`);
  }
  const cost = sum(p.tasks.map(t => t.cost));
  assert(cost === p.orderCount, `Phase cannot fund its tasks ${p.id}`);
  let phaseEarned = 0, taskIndex = 0, phaseSpent = 0;
  for (const t of p.tasks) {
    assert(Number.isSafeInteger(t.cost) && t.cost > 0 && t.cost <= 12, `Invalid task price ${t.id}`);
    assert(t.name && t.target && ["existing", "implemented", "planned"].includes(t.status), `Incomplete task ${t.id}`);
    maxWaitForNextTask = Math.max(maxWaitForNextTask, t.cost);
  }
  // Greedy purchases demonstrate that available orders finance every task prefix.
  for (let order = 1; order <= p.orderCount; order++) {
    phaseEarned++;
    while (taskIndex < p.tasks.length && phaseEarned - phaseSpent >= p.tasks[taskIndex].cost) {
      phaseSpent += p.tasks[taskIndex++].cost;
    }
    minimumBalance = Math.min(minimumBalance, earned + phaseEarned - spent - phaseSpent);
  }
  assert(taskIndex === p.tasks.length && phaseSpent === phaseEarned, `Construction deadlock ${p.id}`);
  if (p.stage === 1 && p.areaId !== "shop") assert(p.construction, `Missing construction ${p.id}`);
  if (p.construction) {
    const construction = p.construction;
    const prefix = p.tasks.slice(0, construction.taskIds.length);
    assert(construction.taskIds.join() === prefix.map(task => task.id).join() && prefix.at(-1)?.id === construction.opensInteriorAfterTaskId, `Construction sequence mismatch ${p.id}`);
    assert(construction.earningContext === "any-already-open-building" && construction.projectOrders === sum(prefix.map(task => task.cost)) && construction.projectOrders + construction.interiorOrders === p.orderCount, `Construction funding mismatch ${p.id}`);
    for (const [index, slot] of slots.entries()) {
      if (index < construction.projectOrders) assert(slot.kind === "construction-project" && slot.executionContext === "already-open-building" && !slot.requiresCompletedTaskId, `Construction deadlock ${slot.id}`);
      else assert(slot.kind === "interior" && slot.requiresCompletedTaskId === construction.opensInteriorAfterTaskId, `Interior opened before building ${slot.id}`);
    }
    assert(construction.states.includes("foundation") && construction.states.includes("walls") && construction.states.includes("roof") && construction.states.at(-1) === "open", `Missing construction states ${p.id}`);
  } else assert(slots.every(slot => slot.kind === "interior" && !slot.requiresCompletedTaskId), `Unexpected construction slot ${p.id}`);
  earned += phaseEarned; spent += phaseSpent;
  nextGlobal += p.orderCount;
  chapterOrders.set(p.areaId, previousLocal + p.orderCount);
  completed.add(p.id);
  summary.push({ phase: p.id, globalStage: p.globalStage, orders: p.orderCount, tasks: p.tasks.length, stars: cost, globalRange: p.globalOrderRange, localRange: p.localOrderRange, dependencies: p.requiresCompletedPhases, constructionProjectOrders: p.construction?.projectOrders ?? 0 });
}
for (const c of plan.chapters) {
  assert(c.phaseIds.length === 6 && chapterOrders.get(c.id) === c.orderCount && c.orderCount === 1000, `Chapter budget mismatch ${c.id}`);
  assert(sum(c.phaseIds.map(id => phases.get(id).tasks.length)) === c.taskCount && c.taskCount === 126, `Chapter task mismatch ${c.id}`);
}
const globalSummary = plan.globalStages.map((global, index) => {
  assert(global.stage === index + 1, "Global stage numbering mismatch");
  const members = plan.phases.filter(phase => phase.globalStage === global.stage);
  const expectedGates = plan.chapters.filter(chapter => chapter.introductionStage <= global.stage).map(chapter => `${chapter.id}-${global.stage}`);
  assert(global.phaseIds.join() === members.map(phase => phase.id).join() && global.completionPhaseIds.join() === expectedGates.join(), `Global stage membership/gates mismatch ${global.stage}`);
  return { stage: global.stage, orders: sum(members.map(phase => phase.orderCount)), tasks: sum(members.map(phase => phase.tasks.length)), introducedAreaIds: global.introducedAreaIds, completionPhaseIds: global.completionPhaseIds };
});
for (const id of ["shop-2", "warehouse-2", "fruit-yard-1"])
  assert(phases.get(id).requiresCompletedPhases.every(required => ["shop-1", "warehouse-1"].includes(required)), `Stage 2 choice became linear ${id}`);
assert(phases.get("fruit-yard-2").requiresCompletedPhases.includes("fruit-yard-1") && !phases.get("fruit-yard-2").requiresCompletedPhases.includes("shop-2"), "Fruit development depends on sibling branch");
assert(plan.nextDelivery.orders === 600 && plan.nextDelivery.tasks === 138 && plan.nextDelivery.phaseIds.join() === plan.globalStages.slice(0, 2).flatMap(global => global.phaseIds).join(), "Large delivery scope mismatch");
assert(plan.monetization.launchRequired && plan.monetization.seasonPass.baseCampaignPaywall === false, "Commercial product scope mismatch");
const original = read("src/levels/chapter.json");
const existingSlots = plan.orderSlots.filter(s => s.status === "existing-definition");
assert(existingSlots.length === 10 && existingSlots.every((s, i) => s.id === original[i]?.id), "Published order ids changed");
const existingTasks = tasks.filter(t => t.status === "existing");
assert(existingTasks.map(t => `${t.id}:${t.cost}`).join() === "first-shelf:1,display-baskets:2,first-stock:2,order-counter:2,shop-opening:3", "Published tasks/prices changed");
const readySlots = plan.orderSlots.filter(s => s.status !== "planned-no-definition");
assert(readySlots.length === original.length && readySlots.every(s => original.some(d => d.id === s.id)), "Definition production status mismatch");
const readyTasks = tasks.filter(t => t.status !== "planned");
assert(plan.deliveryStatus.existingOrders === readySlots.length &&
  plan.deliveryStatus.plannedOrders === plan.orderSlots.length - readySlots.length &&
  plan.deliveryStatus.existingTasks === readyTasks.length &&
  plan.deliveryStatus.plannedTasks === tasks.length - readyTasks.length, "Delivery counts differ from actual statuses");
const runtimePhases = plan.route.map(id => {
  const p = phases.get(id);
  return { id: p.id, areaId: p.areaId, stage: p.stage, globalStage: p.globalStage, title: p.title,
    orderTarget: p.orderCount, taskTarget: p.tasks.length, starTarget: sum(p.tasks.map(t => t.cost)),
    taskIds: p.tasks.map(task => task.id),
    requiresCompletedPhases: p.requiresCompletedPhases };
});
if (process.argv.includes("--write")) {
  writeFileSync(new URL("src/campaign-plan.json", root), JSON.stringify(runtimePhases, null, 2) + "\n");
} else assert(JSON.stringify(read("src/campaign-plan.json")) === JSON.stringify(runtimePhases), "Runtime phase plan differs from master plan; run --write");

// Arithmetic for the 25 normal legacy repair prefixes. This does not execute migration.
const legacyRepairPrefixes = [
  [], ["shop-opening"], ["shop-opening", "first-shelf", "order-counter"],
  existingTasks.map(t => t.id)
];
let legacyArithmeticCases = 0;
for (const creditedIds of legacyRepairPrefixes) {
  const paid = sum(creditedIds.map(id => existingTasks.find(t => t.id === id).cost));
  for (let wins = paid; wins <= 10; wins++) {
    const retainedStars = wins - paid;
    const futureFirstPhaseOrders = 80 - wins;
    const remainingFirstPhaseCost = 80 - paid;
    assert(retainedStars + futureFirstPhaseOrders === remainingFirstPhaseCost, "Legacy star deficit");
    legacyArithmeticCases++;
  }
}
assert(legacyArithmeticCases === 25, "Legacy arithmetic coverage mismatch");

const difficultyCounts = Object.fromEntries(["tutorial", "intro", "rest", "standard", "complex"].map(key => [key, plan.orderSlots.filter(s => s.difficulty === key).length]));
const report = {
  planVersion: plan.planVersion, date: plan.date, scope: plan.validationScope,
  chapters: plan.chapters.length, globalStages: globalSummary, phases: plan.phases.length, plannedOrderSlots: plan.orderSlots.length,
  existingDefinitions: readySlots.length, definitionsToProduce: plan.orderSlots.length - readySlots.length,
  taskDesigns: tasks.length, existingTasks: readyTasks.length, tasksToImplement: tasks.length - readyTasks.length,
  goods: plan.goods.length, characters: plan.characters.length, starsEarned: earned, starsSpent: spent,
  finalStarBalance: earned - spent, minimumSimulatedBalance: minimumBalance,
  legacyArithmeticCases,
  maxNewOrdersBetweenPurchases: maxWaitForNextTask, constructionProjects: plan.phases.filter(p => p.construction).length,
  constructionProjectOrders: sum(plan.phases.map(p => p.construction?.projectOrders ?? 0)),
  byteBudgetTarget: plan.byteBudget.shippingTarget, byteBudgetHardLimitExclusive: plan.byteBudget.hardLimitExclusive,
  difficultyCounts, route: summary,
  notVerified: [`Решения ${plan.orderSlots.length - readySlots.length} будущих Definition`, "Интерес, длительность, удержание и доход", "Будущий размер dist и память", "Runtime глобальных Stage, выбора проектов и строительства", "Будущие сцены, UI, сезоны, платежи и SDK"]
};

if (process.argv.includes("--write")) {
  writeFileSync(new URL("docs/content-plan-report.json", root), JSON.stringify(report, null, 2) + "\n");
  const lines = [
    "# Каталог полной кампании", "",
    `План ${plan.planVersion}, ${plan.date}. Автоматически собран из [full-product-plan.json](content/full-product-plan.json).`, "",
    `Главный документ — [CONTENT_MASTER_PLAN.md](CONTENT_MASTER_PLAN.md). Это проект **6000 заказов и 756 работ**, шести глобальных Stage и 36 локальных этапов; готовых Definition сейчас ${readySlots.length}, реализованных покупок ${readyTasks.length}. Записи planned-no-definition не являются выдаваемыми уровнями.`, "",
    "## Глобальные стадии", ""
  ];
  for (const stage of globalSummary) lines.push(`- **Stage ${stage.stage}** — ${stage.orders} заказов, ${stage.tasks} работ; новые локации: ${stage.introducedAreaIds.join(", ") || "нет"}. Для перехода завершить ${stage.completionPhaseIds.join(", ")}.`);
  lines.push("", "Внутри глобального Stage игрок выбирает доступный проект. Порядок ниже служит нумерации каталога, не обязательному прохождению. Строительные заказы выполняются в уже открытом здании, внутренние — после подготовки нового помещения.", "", "## Каталог этапов", "");
  for (const [i, row] of summary.entries()) {
    const p = phases.get(row.phase);
    lines.push(`${i + 1}. **${p.title}** — ${plan.chapters.find(c => c.id === p.areaId).name}, локальный этап ${p.stage}, глобальный Stage ${p.globalStage}; номера каталога ${row.globalRange.join("–")}, заказы локации ${row.localRange.join("–")}. ${row.orders} заказов / ${row.tasks} работ / ${row.stars} ★. Зависимости: ${p.requiresCompletedPhases.join(", ") || "начало игры"}.`);
  }
  for (const c of plan.chapters) {
    lines.push("", `## ${c.name}: ${c.orderCount} заказов, ${c.taskCount} изменений`, "", `Вводится в Stage ${c.introductionStage}. Начало: ${c.initial}. Итог: ${c.final}.`);
    for (const id of c.phaseIds) {
      const p = phases.get(id);
      lines.push("", `### ${p.title} — ${p.id}`, "", `Глобальный Stage ${p.globalStage}. ${p.orderCount} заказов, ${p.tasks.length} работ, ${p.orderCount} ★. ${p.result}.`, "",
        `Локальные заказы: ${p.localOrderRange.join("–")}; номера каталога: ${p.globalOrderRange.join("–")}. Зависимости: ${p.requiresCompletedPhases.join(", ") || "начало игры"}.`, "");
      if (p.construction) lines.push(`Строительный проект: ${p.construction.projectOrders} заказов в уже работающем здании. Внутренние ${p.construction.interiorOrders} заказов открываются после покупки \`${p.construction.opensInteriorAfterTaskId}\`. Расчистка и стройка входят в бюджет этапа; дополнительной платы за открытие нет.`, "");
      let localThreshold = p.localOrderRange[0] - 1;
      for (const [i, t] of p.tasks.entries()) {
        localThreshold += t.cost;
        lines.push(`${i + 1}. **${t.name}** — ${t.cost} ★; накопленная цена этапа ${localThreshold - p.localOrderRange[0] + 1} ★, ориентир локального заказа ${localThreshold}. id: \`${t.id}\`${t.status !== "planned" ? "; уже реализовано" : ""}.`);
      }
    }
  }
  lines.push("", "## Каталог товаров", "", "48 товаров в общей библиотеке. На одном поле используется 2–4 вида. Название товара не доказывает новый план решения.", "");
  for (const g of plan.goods) lines.push(`- **${g.name}** — \`${g.id}\`; доступен с глобального Stage ${g.availableFromGlobalStage}; плановая вводная ${g.introducedIn}; ${g.status !== "planned" ? "существующий ресурс" : "новый ресурс к производству"}.`);
  lines.push("", "## Персонажи", "");
  for (const c of plan.characters) lines.push(`- **${c.name}** — ${c.role}.`);
  lines.push("", "## Семейства головоломок", "");
  for (const f of plan.orderFamilies) lines.push(`- **${f.name}** — \`${f.id}\`; ${f.engine}.`);
  lines.push("", "## Пересборка и проверка", "", "`node scripts/check-content-plan.mjs --write` проверяет маршрут, цены, бюджет, номера и id и обновляет этот каталог и отчёт. Проходимость будущих уровней этой командой не проверяется.", "");
  writeFileSync(new URL("docs/CONTENT_CATALOG.md", root), lines.join("\n"));
}
console.log(`План: ${report.chapters} локаций, 6 глобальных Stage, ${report.phases} локальных этапов, ${report.plannedOrderSlots} мест заказов, ${report.taskDesigns} работ; ${earned}/${spent} звёзд, остаток ${earned - spent}.`);
console.log(`Нужно произвести: ${report.definitionsToProduce} Definition и ${report.tasksToImplement} изменений. Будущая проходимость не проверена.`);
console.log(`Бюджет файлов: цель ${report.byteBudgetTarget}, предел <${report.byteBudgetHardLimitExclusive} байт. Каталог: ${fileURLToPath(new URL("docs/CONTENT_CATALOG.md", root))}`);
