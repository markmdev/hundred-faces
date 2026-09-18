// Writes public/presets/<id>.json, one recorded wall per preset in the wire
// shape the page reads from /api/react, so a preset never calls Jev. The
// recording is the source; this runs before every build and dev session,
// refuses a recording the code has drifted from, and removes any preset file
// in the output directory it did not just write, so a renamed or dropped
// preset does not linger in the build.
//
// Usage: node scripts/build-presets.ts [outDir]

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadFixture, recordedWall } from "../recordings/schema.ts";
import { PRESETS } from "../src/shared/presets.ts";

const outDir = resolve(process.argv[2] ?? join(import.meta.dirname, "..", "public", "presets"));
const fixture = loadFixture();

mkdirSync(outDir, { recursive: true });
const stale = new Set<string>();
for (const entry of readdirSync(outDir, { withFileTypes: true })) {
  // The presets directory holds only this script's files; a directory in it means the wrong outDir.
  if (entry.isDirectory()) throw new Error(`${outDir} contains a directory (${entry.name}); refusing to write presets there`);
  if (entry.name.endsWith(".json")) stale.add(entry.name);
}
for (const preset of PRESETS) {
  const name = `${preset.id}.json`;
  writeFileSync(join(outDir, name), JSON.stringify(recordedWall(fixture, preset)));
  stale.delete(name);
}
for (const name of stale) rmSync(join(outDir, name));
console.log(`wrote ${PRESETS.length} presets to ${outDir}${stale.size ? `, removed ${[...stale].join(", ")}` : ""}`);
