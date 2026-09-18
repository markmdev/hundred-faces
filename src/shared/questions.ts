// Builds the Jev request for one batch of personas and reads the answers back.
// The state is `{ message, personas: [...] }` and every question names its
// persona by path (`personas[3]`) so Jev judges that one person, never a
// typical reader. Question ids are for code only; the full meaning is in the
// instructions. The wording is compact on purpose: it is repeated once per
// persona per update, and the questions are most of the tokens.

import type { ChoiceQuestion, NoulQuestion, SystemOneResult } from "@typesafe-ai/sdk";
import type { Persona } from "./personas.ts";
import { REACTION_CRITERIA, REACTIONS, type Reaction, type ReactionDistribution } from "./reactions.ts";

export type BatchState = {
  message: string;
  personas: Persona[];
};

export type BatchQuestions = Record<string, ChoiceQuestion | NoulQuestion>;

export type BatchAnswers = SystemOneResult<BatchQuestions>["answers"];

// The three yes/no questions asked of every persona, in display order. The id
// is the question suffix and the answer key; the label is what the page shows.
export const NOULS = [
  { id: "understands", label: "understands" },
  { id: "trusts", label: "trusts" },
  { id: "shares", label: "would share" },
] as const;

export type NoulId = (typeof NOULS)[number]["id"];

export type FaceAnswer = { reaction: ReactionDistribution } & { [K in NoulId]: number };

export function buildState(message: string, personas: readonly Persona[]): BatchState {
  // The SDK's JSON state type has no readonly arrays; the list is never mutated.
  return { message, personas: personas as Persona[] };
}

const NOUL_QUESTIONS: Record<NoulId, (who: string) => NoulQuestion> = {
  understands: (who) => ({
    type: "noul",
    instructions: `Would ${who} understand what \`message\` means on a first read, without re-reading or looking anything up? Judge this specific person from how they read, not a typical reader.`,
    criteria: {
      true: "Gets the meaning on the first pass.",
      false: "Misses the point, misreads it, or must re-read or look something up.",
    },
  }),
  trusts: (who) => ({
    type: "noul",
    instructions: `Would ${who} believe what \`message\` says and trust the sender's motives? Judge this specific person from their temperament and what they care about, not a typical reader.`,
    criteria: {
      true: "Takes it at face value and assumes the sender means well.",
      false: "Doubts the claims or suspects the sender's motives.",
    },
  }),
  shares: (who) => ({
    type: "noul",
    instructions: `Would ${who} share, forward, or repeat \`message\` to someone they know? Judge this specific person from their habits, not a typical reader.`,
    criteria: {
      true: "Would show, forward, or mention it to someone.",
      false: "Would keep it to themselves.",
    },
  }),
};

export function buildQuestions(personaCount: number): BatchQuestions {
  const questions: BatchQuestions = {};
  for (let i = 0; i < personaCount; i++) {
    const who = `the person in \`personas[${i}]\``;
    questions[`p${i}_reaction`] = {
      type: "choice",
      instructions: `Immediate reaction of ${who} on reading \`message\`. Judge this specific person, from their temperament, what they care about, and how they read, not a typical reader.`,
      criteria: REACTION_CRITERIA,
    };
    for (const { id } of NOULS) questions[`p${i}_${id}`] = NOUL_QUESTIONS[id](who);
  }
  return questions;
}

// The SDK types the answers but does not check their values, so this is the
// one place every number Jev returns is validated before the app reads it.
export function readAnswers(answers: BatchAnswers, personaCount: number): FaceAnswer[] {
  const faces: FaceAnswer[] = [];
  for (let i = 0; i < personaCount; i++) {
    const reactionId = `p${i}_reaction`;
    const reaction = answers[reactionId];
    if (reaction?.type !== "choice") throw new Error(`missing choice answer ${reactionId}`);
    if (!REACTIONS.includes(reaction.choice as Reaction)) throw new Error(`answer ${reactionId} chose ${JSON.stringify(reaction.choice)}, not a reaction`);
    if (!isProbability(reaction.confidence)) throw new Error(`answer ${reactionId} has confidence ${String(reaction.confidence)}, not a number in [0, 1]`);
    const labels = Object.keys(reaction.probabilities);
    if (labels.length !== REACTIONS.length || !REACTIONS.every((name) => name in reaction.probabilities)) {
      throw new Error(`answer ${reactionId} has probabilities for ${JSON.stringify(labels)}, expected exactly ${JSON.stringify(REACTIONS)}`);
    }
    const distribution = {} as ReactionDistribution;
    for (const name of REACTIONS) {
      const p = reaction.probabilities[name];
      if (!isProbability(p)) throw new Error(`answer ${reactionId} has probability ${String(p)} for ${name}, not a number in [0, 1]`);
      distribution[name] = p;
    }
    const nouls = {} as Record<NoulId, number>;
    for (const { id } of NOULS) {
      const noulId = `p${i}_${id}`;
      const answer = answers[noulId];
      if (answer?.type !== "noul") throw new Error(`missing noul answer ${noulId}`);
      if (!isProbability(answer.noul)) throw new Error(`answer ${noulId} is ${String(answer.noul)}, not a number in [0, 1]`);
      nouls[id] = answer.noul;
    }
    faces.push({ reaction: distribution, ...nouls });
  }
  return faces;
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
