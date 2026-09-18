// Writes public/presets/<id>.json, one recorded wall per preset in the wire
// shape the page reads from /api/react, so a preset never calls Jev. The
// fixture is the source; this runs before every build and dev session, and
// refuses a fixture the code has drifted from.
//
// Usage: node scripts/build-presets.ts [outDir]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PRESETS } from "../src/shared/presets.ts";
import { loadFixture, recordedWall } from "../test/fixtures/schema.ts";

const outDir = resolve(process.argv[2] ?? resolve(import.meta.dirname, "..", "public", "presets"));
const fixture = loadFixture();

mkdirSync(outDir, { recursive: true });
for (const preset of PRESETS) {
  writeFileSync(join(outDir, `${preset.id}.json`), JSON.stringify(recordedWall(fixture, preset.id)));
}
console.log(`wrote ${PRESETS.length} presets to ${outDir}`);
