// The shape of test/fixtures/jev-presets.json, its loader, and the hash that
// ties a recording to what it was answered against. The recorder writes the
// hash; the loader refuses a fixture whose hash no longer matches the code, so
// the suite cannot pass on answers Jev gave to different personas, questions,
// or batching.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERSONAS } from "../../src/shared/personas.ts";
import { buildQuestions, type FaceAnswer } from "../../src/shared/questions.ts";
import { REACTION_CRITERIA } from "../../src/shared/reactions.ts";
import { BATCH_SIZE } from "../../src/shared/wall.ts";

export interface FixturePreset {
  message: string;
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
