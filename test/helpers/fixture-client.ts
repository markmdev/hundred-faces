// A JevClient that answers from the recorded fixture instead of the API.
// Answers are keyed by preset message and persona name, so the fake serves
// any batch grouping and also checks that every request's questions address
// exactly the personas in its state.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FaceAnswer } from "../../src/shared/questions.ts";
import type { JevClient, JevResult } from "../../src/shared/wall.ts";

export interface FixturePreset {
  message: string;
  latencyMs: number;
  inputTokens: number;
  calls: number;
  faces: Record<string, FaceAnswer>;
}

export interface Fixture {
  model: string;
  recordedAt: string;
  batchSize: number;
  presets: Record<string, FixturePreset>;
}

export const FIXTURE_PATH = resolve(import.meta.dirname, "..", "fixtures", "jev-presets.json");

export function loadFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

export interface RecordedCall {
  message: string;
  personaNames: string[];
  questionIds: string[];
}

export interface FixtureClient extends JevClient {
  readonly calls: RecordedCall[];
  readonly defaultModel: string;
}

export function fixtureClient(fixture: Fixture = loadFixture()): FixtureClient {
  const calls: RecordedCall[] = [];
  return {
    calls,
    defaultModel: fixture.model,
    async systemOne(request): Promise<JevResult> {
      const { message, personas } = request.state;
      const preset = Object.values(fixture.presets).find((p) => p.message === message);
      if (!preset) throw new Error(`fixture has no recording for message: ${message.slice(0, 60)}`);
      const questionIds = Object.keys(request.questions);
      calls.push({ message, personaNames: personas.map((p) => p.name), questionIds });

      const answers: JevResult["answers"] = {};
      personas.forEach((persona, i) => {
        const face = preset.faces[persona.name];
        if (!face) throw new Error(`fixture has no answers for ${persona.name}`);
        for (const suffix of ["reaction", "understands", "trusts", "shares"]) {
          if (!(`p${i}_${suffix}` in request.questions)) throw new Error(`request lacks question p${i}_${suffix} for ${persona.name}`);
        }
        const choice = Object.entries(face.reaction).sort((a, b) => b[1] - a[1])[0]![0];
        answers[`p${i}_reaction`] = { type: "choice", choice, confidence: face.confidence, probabilities: { ...face.reaction } };
        answers[`p${i}_understands`] = { type: "noul", noul: face.understands };
        answers[`p${i}_trusts`] = { type: "noul", noul: face.trusts };
        answers[`p${i}_shares`] = { type: "noul", noul: face.shares };
      });
      const unexpected = questionIds.filter((id) => !(id in answers));
      if (unexpected.length) throw new Error(`request has questions for personas not in its state: ${unexpected.join(", ")}`);

      return {
        model: fixture.model,
        answers,
        // The recording's token count for the whole wall, apportioned by persona.
        usage: { input_tokens: Math.round((preset.inputTokens * personas.length) / Object.keys(preset.faces).length), output_tokens: 0 },
      };
    },
  };
}
