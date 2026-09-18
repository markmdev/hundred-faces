// The presets the page serves from public/presets are the recording in wire
// shape: what /api/react would have answered for that message, and nothing
// else lingers in the directory.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { loadFixture, recordedWall } from "../recordings/schema.ts";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PRESETS } from "../src/shared/presets.ts";
import type { WallResponse } from "../src/shared/types.ts";
import { judgeWall } from "../src/shared/wall.ts";
import { fixtureClient } from "./helpers/fixture-client.ts";

const BUILDER = resolve(import.meta.dirname, "..", "scripts", "build-presets.ts");

describe("scripts/build-presets.ts", () => {
  const fixture = loadFixture();
  const outDir = mkdtempSync(join(tmpdir(), "hundred-faces-presets-"));
  const stray = join(outDir, "dropped-preset.json");
  writeFileSync(stray, "{}");
  execFileSync("node", [BUILDER, outDir], { stdio: "pipe" });
  after(() => rmSync(outDir, { recursive: true, force: true }));

  it("writes every preset as the wall the server would answer with", async () => {
    for (const preset of PRESETS) {
      const written = JSON.parse(readFileSync(join(outDir, `${preset.id}.json`), "utf8")) as WallResponse;
      const served = await judgeWall(preset.message, fixtureClient(fixture));
      assert.deepEqual(written, recordedWall(fixture, preset), preset.id);
      assert.deepEqual(written.faces, served.faces, `${preset.id} faces`);
      assert.deepEqual(aggregateWall(written.faces), aggregateWall(served.faces));
    }
  });

  it("removes a preset file it did not just write", () => {
    assert.equal(existsSync(stray), false);
  });

  it("refuses a preset the recording never made, and one whose message changed since", () => {
    assert.throws(() => recordedWall(fixture, { id: "never-recorded", label: "Never", message: "never" }), /no recording for preset never-recorded/);
    assert.throws(() => recordedWall(fixture, { ...PRESETS[0]!, message: `${PRESETS[0]!.message} (edited)` }), /recorded a different message/);
  });
});
