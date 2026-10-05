import { existsSync, statSync, writeFileSync } from "node:fs";
import {
  CHAPTER,
  CHAPTER_DEFINITIONS,
  chapterLevel,
  CONTENT_VERSION,
} from "../src/content";
import { validateDefinition, replay } from "../src/engine";
import { describeStructure, VERSION } from "../src/generator";
import { RENOVATIONS } from "../src/renovations";
import { GOODS } from "../src/catalog";
for (const file of [
  ...Object.values(GOODS).map((g) => g.file),
  "shelf",
  "shop",
  "counter",
  "garden",
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
const cost = RENOVATIONS.reduce((n, r) => n + r.cost, 0);
if (cost > CHAPTER.length)
  throw new Error("Not enough chapter stars for repairs");
writeFileSync(
  "docs/content-report.json",
  JSON.stringify(
    {
      contentVersion: CONTENT_VERSION,
      generatorVersion: VERSION,
      levels,
      renovations: RENOVATIONS,
      starsAvailable: CHAPTER.length,
      starsRequired: cost,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Контент: ${levels.length} решений воспроизведены, структуры различны; ремонт ${cost}/${CHAPTER.length} звёзд.`,
);
