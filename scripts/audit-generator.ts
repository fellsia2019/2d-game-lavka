import { writeFileSync } from "node:fs";
import { generate, structuralKey, VERSION } from "../src/generator";
import { replay, type Profile } from "../src/engine";

const report = {
  generatorVersion: VERSION,
  sample: "audit-0 through audit-99, no exclusion history",
  profiles: {} as Record<string, unknown>,
};
for (const profile of ["front", "layers", "crate", "mixed"] as Profile[]) {
  const structures = new Map<string, number>();
  const recipes = new Map<string, number>();
  let verified = 0,
    unknown = 0;
  for (let n = 0; n < 100; n++) {
    let definition;
    try {
      definition = generate(`audit-${n}`, profile);
    } catch {
      unknown++;
      continue;
    }
    if (!replay(definition, definition.verifiedSolution))
      throw new Error(`Broken proof: ${profile}/${n}`);
    verified++;
    const key = structuralKey(definition);
    structures.set(key, (structures.get(key) ?? 0) + 1);
    recipes.set(definition.recipe!, (recipes.get(definition.recipe!) ?? 0) + 1);
  }
  report.profiles[profile] = {
    requested: 100,
    verified,
    unknown,
    distinctStructures: structures.size,
    maxRepetitions: Math.max(0, ...structures.values()),
    recipes: Object.fromEntries(recipes),
  };
  console.log(profile, report.profiles[profile]);
}
writeFileSync(
  "docs/generator-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
