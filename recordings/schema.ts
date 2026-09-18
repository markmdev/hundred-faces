// The shape of recordings/jev-presets.json, its loader, the hash that ties a
// recording to what it was answered against, and a preset's recorded wall in
// wire shape. The recorder writes the hash; the loader refuses a recording
// whose hash no longer matches the code, so neither the suite nor the built
// presets can pass on answers Jev gave to different personas, questions,
// batching, or preset messages.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS, type Preset } from "../src/shared/presets.ts";
import { buildQuestions, type FaceAnswer } from "../src/shared/questions.ts";
import { REACTION_CRITERIA } from "../src/shared/reactions.ts";
import type { WallResponse } from "../src/shared/types.ts";
import { BATCH_SIZE, batchCount } from "../src/shared/wall.ts";

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
  const request = {
    personas: PERSONAS,
    questions: buildQuestions(BATCH_SIZE),
    criteria: REACTION_CRITERIA,
    batchSize: BATCH_SIZE,
    presets: PRESETS.map(({ id, message }) => ({ id, message })),
  };
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function loadFixture(): Fixture {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
  const expected = requestHash();
  if (fixture.requestHash !== expected) {
    throw new Error(
      `${FIXTURE_PATH} was recorded against different personas, questions, batch size, or presets (hash ${fixture.requestHash}, code ${expected}); run npm run record`,
    );
  }
  return fixture;
}

// A preset's recording as the wall /api/react would answer with, faces in
// PERSONAS order. The page serves these from public/presets instead of judging.
export function recordedWall(fixture: Fixture, preset: Preset): WallResponse {
  const recording = fixture.presets[preset.id];
  if (!recording) throw new Error(`${FIXTURE_PATH} has no recording for preset ${preset.id}; run npm run record`);
  if (recording.message !== preset.message) {
    throw new Error(`${FIXTURE_PATH} recorded a different message for preset ${preset.id} than the code has; run npm run record`);
  }
  const faces = PERSONAS.map((persona) => {
    const face = recording.faces[persona.name];
    if (!face) throw new Error(`${FIXTURE_PATH} has no answers for ${persona.name} on preset ${preset.id}; run npm run record`);
    return face;
  });
  return { faces, latencyMs: recording.latencyMs, inputTokens: recording.inputTokens, calls: batchCount(fixture.batchSize), model: fixture.model };
}
