import { readdir, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push({ path: path.split(sep).join("/"), bytes: (await stat(path)).size });
  }
  return out;
}
const list = await files("dist");
const bytes = list.reduce((n, f) => n + f.bytes, 0);
console.log(
  `Размер dist: ${(bytes / 1024 / 1024).toFixed(2)} МиБ (${bytes.toLocaleString("ru-RU")} байт). Цель: <80 МБ.`,
);
await writeFile(
  "docs/build-size.json",
  JSON.stringify(
    { bytes, files: list.sort((a, b) => b.bytes - a.bytes) },
    null,
    2,
  ),
);
if (bytes > 80_000_000) {
  console.error("Внутренний бюджет сборки превышен.");
  process.exitCode = 1;
}
