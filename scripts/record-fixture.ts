// Records Jev's real answers for every preset message into
// test/fixtures/jev-presets.json, so the suite runs offline against what the
// model actually said. Re-run after changing the personas, the question
// wording, the batch size, or the presets; the loader refuses a fixture whose
// request hash no longer matches the code.
//
// Usage: npm run record

import { renameSync, writeFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { BATCH_SIZE, judgeWall } from "../src/shared/wall.ts";
import { FIXTURE_PATH, requestHash, type Fixture } from "../test/fixtures/schema.ts";

const client = new TypeSafeClient({ timeout: 60_000 });
const fixture: Fixture = { model: "", recordedAt: new Date().toISOString(), batchSize: BATCH_SIZE, requestHash: requestHash(), presets: {} };

for (const preset of PRESETS) {
  const wall = await judgeWall(preset.message, client);
  fixture.model = wall.model;
  fixture.presets[preset.id] = {
    message: preset.message,
    latencyMs: wall.latencyMs,
    inputTokens: wall.inputTokens,
    faces: Object.fromEntries(wall.faces.map((face, i) => [PERSONAS[i]!.name, face])),
  };
  console.log(`${preset.id.padEnd(13)} ${wall.latencyMs} ms, ${wall.inputTokens} tokens, ${wall.calls} calls`);
}

// Written beside the target and renamed, so a crash mid-write leaves the old fixture intact.
const partial = `${FIXTURE_PATH}.${process.pid}.tmp`;
writeFileSync(partial, `${JSON.stringify(fixture, null, 1)}\n`);
renameSync(partial, FIXTURE_PATH);
console.log(`wrote ${FIXTURE_PATH}`);
