import { isCompleted } from "./content";
import type { Progress } from "./storage";

export type ToolKind = "hint" | "mix" | "reserve";
export const TOOLS = [
  { id: "hint", name: "Подсказка", cost: 100, afterOrder: 0,
    description: "Покажет, какой товар куда перенести, если не знаешь ход." },
  { id: "mix", name: "Смешать", cost: 200, afterOrder: 3,
    description: "Переставит открытые товары. Сохранит запас и собранные тройки." },
  { id: "reserve", name: "Лоток", cost: 300, afterOrder: 6,
    description: "Отложи мешающий товар, освободи ячейку, затем верни его на полку." },
] as const;

export function toolUnlocked(progress: Progress, kind: ToolKind): boolean {
  const tool = TOOLS.find(tool => tool.id === kind)!;
  return !tool.afterOrder || isCompleted(progress.completed, tool.afterOrder);
}

// Buying replenishes inventory only. The active puzzle and its proof stay intact.
export function purchaseTool(progress: Progress, kind: string): boolean {
  const tool = TOOLS.find(tool => tool.id === kind);
  if (!tool || !toolUnlocked(progress, tool.id) ||
    !Number.isSafeInteger(progress.coins) || progress.coins < tool.cost ||
    !Number.isSafeInteger(progress.inventory[tool.id]) || progress.inventory[tool.id] < 0 ||
    progress.inventory[tool.id] === Number.MAX_SAFE_INTEGER) return false;
  progress.coins -= tool.cost;
  progress.inventory[tool.id]++;
  return true;
}
