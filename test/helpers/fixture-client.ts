// A JevClient that answers from the recorded fixture instead of the API.
// Answers are keyed by preset message and persona name, and every request's
// questions must address exactly the personas in its state. A batch larger
// than the recording's is refused, since answers drift with batch size, unless
// the caller says it is testing the slicing rather than the answers.

import type { ChoiceResponse, NoulResponse } from "@typesafe-ai/sdk";
import { NOULS, type BatchAnswers } from "../../src/shared/questions.ts";
import type { JevClient } from "../../src/shared/wall.ts";
import { loadFixture, type Fixture } from "../fixtures/schema.ts";

export interface RecordedCall {
  message: string;
  personaNames: string[];
  questionIds: string[];
}

export interface FixtureClient extends JevClient {
  readonly calls: RecordedCall[];
}

export interface FixtureClientOptions {
  ignoreBatchSize?: boolean;
}

export function fixtureClient(fixture: Fixture = loadFixture(), { ignoreBatchSize = false }: FixtureClientOptions = {}): FixtureClient {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async systemOne(request) {
      const { message, personas } = request.state;
      const preset = Object.values(fixture.presets).find((p) => p.message === message);
      if (!preset) throw new Error(`fixture has no recording for message: ${message.slice(0, 60)}`);
      if (!ignoreBatchSize && personas.length > fixture.batchSize) {
        throw new Error(`request carries ${personas.length} personas; the fixture was recorded in batches of ${fixture.batchSize}`);
      }
      const questionIds = Object.keys(request.questions);
      calls.push({ message, personaNames: personas.map((p) => p.name), questionIds });

      const answers: Record<string, ChoiceResponse | NoulResponse> = {};
      personas.forEach((persona, i) => {
        const face = preset.faces[persona.name];
        if (!face) throw new Error(`fixture has no answers for ${persona.name}`);
        for (const suffix of ["reaction", ...NOULS.map((n) => n.id)]) {
          if (!(`p${i}_${suffix}` in request.questions)) throw new Error(`request lacks question p${i}_${suffix} for ${persona.name}`);
        }
        const [choice, top] = Object.entries(face.reaction).sort((a, b) => b[1] - a[1])[0]!;
        answers[`p${i}_reaction`] = { type: "choice", choice, confidence: top, probabilities: { ...face.reaction } };
        for (const { id } of NOULS) answers[`p${i}_${id}`] = { type: "noul", noul: face[id] };
      });
      const unexpected = questionIds.filter((id) => !(id in answers));
      if (unexpected.length) throw new Error(`request has questions for personas not in its state: ${unexpected.join(", ")}`);

      return {
        model: fixture.model,
        answers: answers as BatchAnswers,
        // The recording's token count for the whole wall, apportioned by persona.
        usage: { input_tokens: Math.round((preset.inputTokens * personas.length) / Object.keys(preset.faces).length), output_tokens: 0 },
      };
    },
  };
}
