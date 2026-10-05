import { CHAPTER, isCompleted } from "./content";
import { type Good, type Shelf } from "./engine";

export function guidanceMode(
  number: number | null,
  completed: string[],
  tutorialSeen: string[],
): "strict" | "gentle" | "none" {
  if (!number || isCompleted(completed, number)) return "none";
  if (number === 1 && !tutorialSeen.includes("spotlight-transfer")) return "strict";
  // Learning a mechanic is not finishing its order. Old reveal/unlock lesson
  // flags must not cut off practice while that order is still unfinished.
  return CHAPTER[number - 1]?.guidance === "gentle" ? "gentle" : "none";
}

export function hiddenStock(shelf: Pick<Shelf, "rear">): [Good, number][] {
  const counts = new Map<Good, number>();
  for (const good of shelf.rear.flat())
    if (good) counts.set(good, (counts.get(good) ?? 0) + 1);
  return [...counts];
}
