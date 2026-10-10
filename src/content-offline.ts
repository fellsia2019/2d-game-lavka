// Build/test/production helper. Runtime entry points must import content.ts only.
import shop1 from "./levels/projects/shop-1.json" with { type: "json" };
import warehouse1 from "./levels/projects/warehouse-1.json" with { type: "json" };
import shop2 from "./levels/projects/shop-2.json" with { type: "json" };
import warehouse2 from "./levels/projects/warehouse-2.json" with { type: "json" };
import fruit1 from "./levels/projects/fruit-yard-1.json" with { type: "json" };
import fruit2 from "./levels/projects/fruit-yard-2.json" with { type: "json" };
import bakery1 from "./levels/projects/bakery-1.json" with { type: "json" };
import terrace1 from "./levels/projects/terrace-1.json" with { type: "json" };
import { CHAPTER } from "./content";
import { clone, validateDefinition, type Definition } from "./engine";

// Prepared catalogs only contribute once their IDs appear in the produced block.
export const OFFLINE_CHAPTER_DEFINITIONS = [shop1, warehouse1, shop2, warehouse2, fruit1, fruit2, bakery1, terrace1].flat()
  .filter(definition => CHAPTER.some(story => story.id === definition.id)) as Definition[];
export function offlineProjectDefinitions(phaseId: string): Definition[] {
  const ids = new Set(CHAPTER.filter(story => story.phaseId === phaseId).map(story => story.id));
  return clone(OFFLINE_CHAPTER_DEFINITIONS.filter(definition => ids.has(definition.id)));
}
export function offlineChapterLevel(number: number): Definition {
  const story = CHAPTER[number - 1];
  if (!Number.isInteger(number) || !story) throw new Error("Unknown chapter level");
  const source = OFFLINE_CHAPTER_DEFINITIONS.find(definition => definition.id === story.id);
  if (!source || source.profile !== story.profile) throw new Error(`Missing/mismatched offline Definition: ${story.id}`);
  const definition = clone(source);
  if (definition.number !== (story.catalogNumber ?? number)) throw new Error(`Mismatched catalog number: ${story.id}`);
  definition.name = story.name;
  definition.note = story.line;
  validateDefinition(definition);
  return definition;
}
