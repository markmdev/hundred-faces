// Records Jev's real answers for every preset message into
// test/fixtures/jev-presets.json, so the suite runs offline against what the
// model actually said. Re-run after changing the personas, the question
// wording, or the presets; the tests read the fixture, never the API.
//
// Usage: npm run record

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { BATCH_SIZE, judgeWall } from "../src/shared/wall.ts";
import type { Fixture } from "../test/helpers/fixture-client.ts";

const OUT = resolve(import.meta.dirname, "..", "test", "fixtures", "jev-presets.json");

const client = new TypeSafeClient({ timeout: 60_000 });
const fixture: Fixture = { model: "", recordedAt: new Date().toISOString(), batchSize: BATCH_SIZE, presets: {} };

for (const preset of PRESETS) {
  const wall = await judgeWall(preset.message, client);
  fixture.model = wall.model;
  fixture.presets[preset.id] = {
    message: preset.message,
    latencyMs: wall.latencyMs,
    inputTokens: wall.inputTokens,
    calls: wall.calls,
    faces: Object.fromEntries(wall.faces.map((face, i) => [PERSONAS[i]!.name, face])),
  };
  console.log(`${preset.id.padEnd(13)} ${wall.latencyMs} ms, ${wall.inputTokens} tokens, ${wall.calls} calls`);
}

writeFileSync(OUT, `${JSON.stringify(fixture, null, 1)}\n`);
console.log(`wrote ${OUT}`);
