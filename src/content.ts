import {
  clone,
  validateDefinition,
  type Definition,
  type Profile,
} from "./engine";
import levelDefinitions from "./levels/chapter.json" with { type: "json" };
import expansionStories from "./levels/shop-expansion.json" with { type: "json" };
export interface ChapterEntry {
  phaseId: string;
  id: string;
  name: string;
  customer: string;
  line: string;
  profile: Profile | "tutorial";
  lesson?: "transfer" | "tools" | "rear" | "crate";
  guidance?: "gentle";
}
const INTRO_CHAPTER = [
  {
    id: "morning-first",
    lesson: "transfer",
    name: "Первый покупатель",
    customer: "Нина",
    line: "К завтраку — хлеб, молоко и немного варенья.",
    profile: "tutorial",
  },
  {
    id: "morning-breakfast",
    guidance: "gentle",
    name: "Солнечный завтрак",
    customer: "Борис",
    line: "Хлеб ещё тёплый. Поможете собрать заказ?",
    profile: "tutorial",
  },
  {
    id: "morning-opening",
    guidance: "gentle",
    name: "Утро в лавке",
    customer: "Мила",
    line: "Ещё один заказ — и у нас будет новая вывеска!",
    profile: "tutorial",
  },
  {
    id: "morning-coast",
    name: "Привет с набережной",
    customer: "Нина",
    line: "Как хорошо, что ваша лавка совсем рядом.",
    profile: "front",
  },
  {
    id: "morning-picnic",
    name: "Пикник у маяка",
    customer: "Борис",
    line: "Возьмём самое вкусное с собой к морю.",
    profile: "front",
  },
  {
    id: "morning-neighbours",
    name: "Для добрых соседей",
    customer: "Мила",
    line: "Наши первые постоянные покупатели!",
    profile: "front",
  },
  {
    id: "morning-delivery",
    lesson: "rear",
    name: "Свежая поставка",
    customer: "Илья",
    line: "За первым рядом спрятан ещё один. Освободите полку!",
    profile: "layers",
  },
  {
    id: "morning-shelves",
    name: "Полные полки",
    customer: "Нина",
    line: "Сначала передний ряд, затем — всё остальное.",
    profile: "layers",
  },
  {
    id: "morning-baker",
    lesson: "crate",
    name: "Посылка от пекаря",
    customer: "Илья",
    line: "Поставка откроется после отправки троек.",
    profile: "crate",
  },
  {
    id: "morning-party",
    name: "Маленький праздник",
    customer: "Мила",
    line: "Сегодня гостей много. Давайте соберём все заказы!",
    profile: "mixed",
  },
] as const;
export const CHAPTER: readonly ChapterEntry[] = [
  ...INTRO_CHAPTER.map(story => ({ ...story, phaseId: "shop-1" })),
  ...expansionStories.map(story => ({ ...story, phaseId: "shop-1", profile: story.profile as Profile })),
];
export const CONTENT_VERSION = "coastal-shop-1-cold-1";
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
  if (!source) throw new Error(`Missing chapter Definition: ${story.id}`);
  const def = clone(source);
  def.number = number;
  def.name = story.name;
  def.note = story.line;
  if (def.profile !== story.profile)
    throw new Error(`Mismatched chapter profile: ${story.id}`);
  validateDefinition(def);
  return def;
}
