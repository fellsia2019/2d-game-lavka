import {
  clone,
  validateDefinition,
  type Definition,
  type Profile,
} from "./engine";
import levelDefinitions from "./levels/chapter.json" with { type: "json" };
import chapterStories from "./levels/stage-block.json" with { type: "json" };
export interface ChapterEntry {
  phaseId: string;
  localNumber: number;
  chapterNumber: number;
  /** Stable number in the full catalog, independent from the produced array. */
  catalogNumber?: number;
  denseNumber?: number;
  globalStage: number;
  orderContext: {
    kind: "construction-project" | "interior";
    executionContext?: "already-open-building";
    requiresCompletedTaskId?: string;
  };
  recipe?: string;
  plannedFamily?: string;
  implementedFamily?: string;
  plannedDifficulty?: string;
  id: string;
  name: string;
  customer: string;
  line: string;
  profile: Profile | "tutorial";
  lesson?: "transfer" | "tools" | "rear" | "crate";
  guidance?: "gentle";
}
export const CHAPTER: readonly ChapterEntry[] = chapterStories as ChapterEntry[];
export const CONTENT_VERSION = "coastal-stage-1-2-bakery-v2";
// Frozen migration map: changing a seed or reordering today's catalog must not
// change the meaning of ids that have already been stored by schema 1.
const LEGACY_IDS: Record<string, string> = {
  "tutorial:1": "morning-first",
  "tutorial:2": "morning-breakfast",
  "tutorial:3": "morning-opening",
  "front:coast-4": "morning-coast",
  "front:coast-5": "morning-picnic",
  "front:coast-6-v2": "morning-neighbours",
  "layers:coast-7": "morning-delivery",
  "layers:coast-8": "morning-shelves",
  "crate:coast-9": "morning-baker",
  "mixed:coast-10": "morning-party",
};
export function canonicalLevelId(id: string): string {
  const suffix = /^coastal-slice-[\w-]+:(.+)$/.exec(id)?.[1];
  return suffix && Object.hasOwn(LEGACY_IDS, suffix) ? LEGACY_IDS[suffix] : id;
}
export const CHAPTER_DEFINITIONS = levelDefinitions as Definition[];
export function chapterNumber(id: string): number | null {
  const index = CHAPTER.findIndex((s) => s.id === canonicalLevelId(id));
  return index < 0 ? null : index + 1;
}
export function catalogNumber(id: string): number | null {
  const index = chapterNumber(id);
  return index ? CHAPTER[index - 1].catalogNumber ?? index : null;
}
export function isCompleted(completed: string[], number: number): boolean {
  return completed.some(
    (id) => canonicalLevelId(id) === CHAPTER[number - 1]?.id,
  );
}
export const completedCount = (completed: string[]) =>
  CHAPTER.filter((_, i) => isCompleted(completed, i + 1)).length;
export const nextOrder = (completed: string[]) =>
  CHAPTER.findIndex((_, i) => !isCompleted(completed, i + 1)) + 1;
export const isUnlocked = (completed: string[], number: number) =>
  number >= 1 &&
  number <= CHAPTER.length &&
  CHAPTER.slice(0, number - 1).every((_, i) => isCompleted(completed, i + 1));
export function chapterLevel(number: number): Definition {
  if (!Number.isInteger(number) || number < 1 || number > CHAPTER.length)
    throw new Error("Unknown chapter level");
  const story = CHAPTER[number - 1];
  const source = CHAPTER_DEFINITIONS.find((d) => d.id === story.id);
  if (!source) throw new Error(`Use loadChapterLevel for project Definition: ${story.id}`);
  const def = clone(source);
  def.name = story.name;
  def.note = story.line;
  if (def.profile !== story.profile)
    throw new Error(`Mismatched chapter profile: ${story.id}`);
  validateDefinition(def);
  return def;
}

// Browser chunks retain only a small URL string. Parsed project JSON is owned by
// the bounded cache below, instead of the browser's permanent module cache.
const PROJECT_LOADERS: Record<string, () => Promise<Definition[]>> = {
  "shop-1": async () => readProjectUrl((await import("./levels/projects/shop-1.json?url")).default),
  "warehouse-1": async () => readProjectUrl((await import("./levels/projects/warehouse-1.json?url")).default),
  "shop-2": async () => readProjectUrl((await import("./levels/projects/shop-2.json?url")).default),
  "warehouse-2": async () => readProjectUrl((await import("./levels/projects/warehouse-2.json?url")).default),
  "fruit-yard-1": async () => readProjectUrl((await import("./levels/projects/fruit-yard-1.json?url")).default),
  "fruit-yard-2": async () => readProjectUrl((await import("./levels/projects/fruit-yard-2.json?url")).default),
  "bakery-1": async () => readProjectUrl((await import("./levels/projects/bakery-1.json?url")).default),
};
async function readProjectUrl(url: string): Promise<Definition[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не удалось загрузить закреплённые заказы проекта.");
  return await response.json() as Definition[];
}
export function createChapterLoader(loaders: Record<string, () => Promise<Definition[]>>, maxProjects = 2) {
  if (!Number.isInteger(maxProjects) || maxProjects < 1) throw new Error("Invalid project cache limit");
  const cache = new Map<string, Definition[]>();
  const pending = new Map<string, Promise<Definition[]>>();
  async function projectDefinitions(phaseId: string): Promise<Definition[]> {
    const cached = cache.get(phaseId);
    if (cached) {
      cache.delete(phaseId);
      cache.set(phaseId, cached);
      return cached;
    }
    const inFlight = pending.get(phaseId);
    if (inFlight) return inFlight;
    const loader = loaders[phaseId];
    if (!loader) throw new Error(`Unknown playable project: ${phaseId}`);
    const request = (async () => {
      const definitions = await loader();
      const ids = CHAPTER.filter(story => story.phaseId === phaseId).map(story => story.id);
      if (!Array.isArray(definitions) || definitions.length !== ids.length ||
        new Set(definitions.map(def => def.id)).size !== ids.length ||
        definitions.some(def => !ids.includes(def.id))) throw new Error(`Invalid project catalog: ${phaseId}`);
      for (const definition of definitions) {
        validateDefinition(definition);
        const index = chapterNumber(definition.id)!;
        const story = CHAPTER[index - 1];
        if (definition.profile !== story.profile || definition.number !== (story.catalogNumber ?? index))
          throw new Error(`Mismatched project catalog metadata: ${definition.id}`);
      }
      cache.set(phaseId, definitions);
      while (cache.size > maxProjects) cache.delete(cache.keys().next().value!);
      return definitions;
    })();
    pending.set(phaseId, request);
    try { return await request; }
    finally { pending.delete(phaseId); }
  }
  return {
    async load(number: number): Promise<Definition> {
      if (!Number.isInteger(number) || number < 1 || number > CHAPTER.length) throw new Error("Unknown chapter level");
      const story = CHAPTER[number - 1];
      const definitions = await projectDefinitions(story.phaseId);
      const source = definitions.find(definition => definition.id === story.id);
      if (!source || source.profile !== story.profile) throw new Error(`Missing/mismatched project Definition: ${story.id}`);
      const definition = clone(source);
      if (definition.number !== (story.catalogNumber ?? number)) throw new Error(`Mismatched catalog number: ${story.id}`);
      definition.name = story.name;
      definition.note = story.line;
      return definition;
    },
    cachedProjectIds: () => [...cache.keys()],
  };
}
const chapterLoader = createChapterLoader(PROJECT_LOADERS);
export const loadChapterLevel = chapterLoader.load;
