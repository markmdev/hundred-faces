// The shape of test/fixtures/jev-presets.json, its loader, the hash that ties
// a recording to what it was answered against, and the recorded wall in wire
// shape. The recorder writes the hash; the loader refuses a fixture whose hash
// no longer matches the code, so neither the suite nor the built presets can
// pass on answers Jev gave to different personas, questions, or batching.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONAS } from "../../src/shared/personas.ts";
import { buildQuestions, type FaceAnswer } from "../../src/shared/questions.ts";
import { REACTION_CRITERIA } from "../../src/shared/reactions.ts";
import type { WallResponse } from "../../src/shared/types.ts";
import { BATCH_SIZE } from "../../src/shared/wall.ts";

export interface FixturePreset {
  message: string;
  latencyMs: number;
  inputTokens: number;
  faces: Record<string, FaceAnswer>;
}

export interface Fixture {
  model: string;
  recordedAt: string;
  batchSize: number;
  requestHash: string;
  presets: Record<string, FixturePreset>;
}

export const FIXTURE_PATH = resolve(import.meta.dirname, "jev-presets.json");

export function requestHash(): string {
  const request = { personas: PERSONAS, questions: buildQuestions(BATCH_SIZE), criteria: REACTION_CRITERIA, batchSize: BATCH_SIZE };
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function loadFixture(): Fixture {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
  const expected = requestHash();
  if (fixture.requestHash !== expected) {
    throw new Error(
      `${FIXTURE_PATH} was recorded against different personas, questions, or batch size (hash ${fixture.requestHash}, code ${expected}); run npm run record`,
    );
  }
  return fixture;
}

// A preset's recording as the wall /api/react would answer with, faces in
// PERSONAS order. The page serves these from public/presets instead of judging.
export function recordedWall(fixture: Fixture, presetId: string): WallResponse {
  const preset = fixture.presets[presetId];
  if (!preset) throw new Error(`${FIXTURE_PATH} has no recording for preset ${presetId}; run npm run record`);
  const faces = PERSONAS.map((persona) => {
    const face = preset.faces[persona.name];
    if (!face) throw new Error(`${FIXTURE_PATH} has no answers for ${persona.name} on preset ${presetId}; run npm run record`);
    return face;
  });
  return { faces, latencyMs: preset.latencyMs, inputTokens: preset.inputTokens, calls: Math.ceil(PERSONAS.length / fixture.batchSize), model: fixture.model };
}
