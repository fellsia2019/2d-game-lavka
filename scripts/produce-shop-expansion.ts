// Offline production only. Runtime always loads pinned, replayed Definitions.
import { readFileSync, writeFileSync } from "node:fs";
import { generate, structuralKey } from "../src/generator";
import { replay, validateDefinition, type Definition, type Profile } from "../src/engine";

const stories = JSON.parse(readFileSync("src/levels/shop-expansion.json", "utf8"));
const definitions: Definition[] = JSON.parse(readFileSync("src/levels/chapter.json", "utf8"));
const original = definitions.slice(0, 10);
if (definitions.some(d => !original.includes(d) && !stories.some((story: { id: string }) => story.id === d.id)))
  throw new Error("Unknown pinned orders must not be discarded by this producer");
const keys = original.map(structuralKey);
const output = [...original];
for (const [index, story] of stories.entries()) {
  // Rerunning never replaces a published Definition, including its exact proof.
  let pinned = definitions.find(d => d.id === story.id);
  if (!pinned) {
    for (let candidate = 0; candidate < 32; candidate++) {
      try {
        pinned = generate(`shop-1-order-${index + 11}-v1-${candidate}`, story.profile as Profile,
          index + 11, { recipe: story.recipe, avoidStructures: keys });
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Не удалось подтвердить")) throw error;
      }
    }
    if (!pinned) throw new Error(`Unverified order was not produced: ${story.id}`);
    pinned = { ...pinned, id: story.id, name: story.name, note: story.line };
  }
  validateDefinition(pinned);
  if (pinned.profile !== story.profile) throw new Error(`Pinned profile changed: ${story.id}`);
  const key = structuralKey(pinned);
  if (!replay(pinned, pinned.verifiedSolution) || keys.includes(key)) throw new Error(`Invalid/repeated order ${story.id}`);
  keys.push(key);
  output.push(pinned);
}
writeFileSync("src/levels/chapter.json", JSON.stringify(output, null, 2) + "\n");
console.log(`Verified ${output.length - original.length} pinned expansion orders; original ten preserved.`);
