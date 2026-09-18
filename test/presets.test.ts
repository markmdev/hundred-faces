// The presets the page serves from public/presets are the fixture in wire
// shape: what /api/react would have answered for that message.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import type { WallResponse } from "../src/shared/types.ts";
import { BATCH_SIZE, judgeWall } from "../src/shared/wall.ts";
import { loadFixture, recordedWall } from "./fixtures/schema.ts";
import { fixtureClient } from "./helpers/fixture-client.ts";

describe("scripts/build-presets.ts", () => {
  const fixture = loadFixture();
  const outDir = mkdtempSync(join(tmpdir(), "hundred-faces-presets-"));
  execFileSync("node", [resolve(import.meta.dirname, "..", "scripts", "build-presets.ts"), outDir], { stdio: "pipe" });
  after(() => rmSync(outDir, { recursive: true, force: true }));

  it("writes every preset as the wall the server would answer with", async () => {
    for (const preset of PRESETS) {
      const written = JSON.parse(readFileSync(join(outDir, `${preset.id}.json`), "utf8")) as WallResponse;
      const served = await judgeWall(preset.message, fixtureClient(fixture));
      assert.deepEqual(written.faces, served.faces, `${preset.id} faces`);
      assert.equal(written.faces.length, PERSONAS.length);
      assert.equal(written.calls, Math.ceil(PERSONAS.length / BATCH_SIZE));
      assert.equal(written.model, fixture.model);
      assert.equal(written.inputTokens, fixture.presets[preset.id]!.inputTokens);
      assert.equal(written.latencyMs, fixture.presets[preset.id]!.latencyMs);
      assert.ok(written.latencyMs > 0);
      assert.deepEqual(written, recordedWall(fixture, preset.id));
      assert.deepEqual(aggregateWall(written.faces), aggregateWall(served.faces));
    }
  });

  it("refuses a preset the fixture never recorded", () => {
    assert.throws(() => recordedWall(fixture, "never-recorded"), /no recording for preset never-recorded/);
  });
});
