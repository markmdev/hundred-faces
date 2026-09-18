// Builds the Jev request for one batch of personas and reads the answers back.
// The state is `{ message, personas: [...] }` and every question names its
// persona by path (`personas[3]`) so Jev judges that one person, never a
// typical reader. Question ids are for code only; the full meaning is in the
// instructions. The wording is compact on purpose: it is repeated once per
// persona per update, and the questions are most of the tokens.

import type { ChoiceQuestion, NoulQuestion, Questions } from "@typesafe-ai/sdk";
import type { Persona } from "./personas.ts";
import { REACTION_CRITERIA, REACTIONS, type Reaction, type ReactionDistribution } from "./reactions.ts";

export type BatchState = {
  message: string;
  personas: Persona[];
};

export type BatchQuestions = Record<string, ChoiceQuestion | NoulQuestion>;

export interface FaceAnswer {
  reaction: ReactionDistribution;
  // Jev's own peakedness statistic for the reaction distribution, 0..1.
  confidence: number;
  understands: number;
  trusts: number;
  shares: number;
}

export function buildState(message: string, personas: readonly Persona[]): BatchState {
  return { message, personas: [...personas] };
}

export function buildQuestions(personaCount: number): BatchQuestions {
  const questions: BatchQuestions = {};
  for (let i = 0; i < personaCount; i++) {
    const who = `the person in \`personas[${i}]\``;
    questions[`p${i}_reaction`] = {
      type: "choice",
      instructions: `Immediate reaction of ${who} on reading \`message\`. Judge this specific person, from their temperament, what they care about, and how they read, not a typical reader.`,
      criteria: REACTION_CRITERIA,
    };
    questions[`p${i}_understands`] = {
      type: "noul",
      instructions: `Would ${who} understand what \`message\` means on a first read, without re-reading or looking anything up? Judge this specific person from how they read, not a typical reader.`,
      criteria: {
        true: "Gets the meaning on the first pass.",
        false: "Misses the point, misreads it, or must re-read or look something up.",
      },
    };
    questions[`p${i}_trusts`] = {
      type: "noul",
      instructions: `Would ${who} believe what \`message\` says and trust the sender's motives? Judge this specific person from their temperament and what they care about, not a typical reader.`,
      criteria: {
        true: "Takes it at face value and assumes the sender means well.",
        false: "Doubts the claims or suspects the sender's motives.",
      },
    };
    questions[`p${i}_shares`] = {
      type: "noul",
      instructions: `Would ${who} share, forward, or repeat \`message\` to someone they know? Judge this specific person from their habits, not a typical reader.`,
      criteria: {
        true: "Would show, forward, or mention it to someone.",
        false: "Would keep it to themselves.",
      },
    };
  }
  return questions;
}

// The subset of the SDK's answer shape this app reads. Kept loose on purpose
// so a fixture-backed fake client and the real SDK satisfy the same type.
export interface RawAnswers {
  [id: string]:
    | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
    | { type: "noul"; noul: number }
    | { type: "score"; score: number; confidence: number };
}

export function readAnswers(answers: RawAnswers, personaCount: number): FaceAnswer[] {
  const faces: FaceAnswer[] = [];
  for (let i = 0; i < personaCount; i++) {
    const reaction = answers[`p${i}_reaction`];
    const understands = answers[`p${i}_understands`];
    const trusts = answers[`p${i}_trusts`];
    const shares = answers[`p${i}_shares`];
    if (reaction?.type !== "choice") throw new Error(`missing choice answer p${i}_reaction`);
    if (understands?.type !== "noul") throw new Error(`missing noul answer p${i}_understands`);
    if (trusts?.type !== "noul") throw new Error(`missing noul answer p${i}_trusts`);
    if (shares?.type !== "noul") throw new Error(`missing noul answer p${i}_shares`);
    const distribution = {} as ReactionDistribution;
    for (const name of REACTIONS) {
      const p = reaction.probabilities[name];
      if (typeof p !== "number") throw new Error(`answer p${i}_reaction lacks option ${name}`);
      distribution[name] = p;
    }
    faces.push({
      reaction: distribution,
      confidence: reaction.confidence,
      understands: understands.noul,
      trusts: trusts.noul,
      shares: shares.noul,
    });
  }
  return faces;
}

export function topReaction(distribution: ReactionDistribution): Reaction {
  let best: Reaction = REACTIONS[0];
  for (const name of REACTIONS) {
    if (distribution[name] > distribution[best]) best = name;
  }
  return best;
}

// Satisfies the SDK's Questions type at the call site without widening ids.
export function asSdkQuestions(questions: BatchQuestions): Questions {
  return questions;
}
