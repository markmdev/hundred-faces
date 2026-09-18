import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERSONAS } from "../src/shared/personas.ts";
import { buildQuestions, buildState, NOULS, readAnswers, type BatchAnswers } from "../src/shared/questions.ts";
import { REACTION_CRITERIA, REACTIONS, topReaction } from "../src/shared/reactions.ts";

describe("buildQuestions", () => {
  it("asks one choice and three nouls per persona, each naming its persona by path", () => {
    const questions = buildQuestions(3);
    assert.equal(Object.keys(questions).length, 3 * (1 + NOULS.length));
    for (let i = 0; i < 3; i++) {
      const reaction = questions[`p${i}_reaction`]!;
      assert.equal(reaction.type, "choice");
      assert.deepEqual(reaction.criteria, REACTION_CRITERIA);
      for (const suffix of ["reaction", ...NOULS.map((n) => n.id)]) {
        const q = questions[`p${i}_${suffix}`]!;
        const text = JSON.stringify(q.instructions);
        assert.ok(text.includes(`\`personas[${i}]\``), `p${i}_${suffix} names personas[${i}]`);
        assert.ok(text.includes("`message`"), `p${i}_${suffix} names the message`);
        assert.ok(/not a typical reader/.test(text), `p${i}_${suffix} says it is about this specific person`);
      }
      for (const { id } of NOULS) assert.equal(questions[`p${i}_${id}`]!.type, "noul");
    }
  });

  it("describes every reaction contrastively, naming a neighbouring option", () => {
    for (const name of REACTIONS) {
      const others = REACTIONS.filter((r) => r !== name);
      assert.ok(others.some((o) => REACTION_CRITERIA[name].includes(o)), `${name} mentions a neighbour`);
    }
  });
});

describe("buildState", () => {
  it("pairs the message with the batch's personas", () => {
    const personas = PERSONAS.slice(0, 2);
    assert.deepEqual(buildState("hi", personas), { message: "hi", personas });
  });
});

describe("readAnswers", () => {
  const reaction = (overrides: Partial<{ choice: string; confidence: number; probabilities: Record<string, number> }> = {}) => ({
    type: "choice" as const,
    choice: "bored",
    confidence: 0.4,
    probabilities: { delighted: 0, interested: 0.1, neutral: 0.2, confused: 0, bored: 0.5, annoyed: 0.2, offended: 0 },
    ...overrides,
  });
  const bored = reaction();
  const delighted = reaction({ choice: "delighted", confidence: 1, probabilities: { delighted: 1, interested: 0, neutral: 0, confused: 0, bored: 0, annoyed: 0, offended: 0 } });
  const answers: BatchAnswers = {
    p0_reaction: bored,
    p0_understands: { type: "noul", noul: 0.8 },
    p0_trusts: { type: "noul", noul: 0.3 },
    p0_shares: { type: "noul", noul: 0.1 },
    p1_reaction: delighted,
    p1_understands: { type: "noul", noul: 1 },
    p1_trusts: { type: "noul", noul: 0 },
    p1_shares: { type: "noul", noul: 0.5 },
  };

  it("reads one face per persona in order", () => {
    const faces = readAnswers(answers, 2);
    assert.equal(faces.length, 2);
    const [first, second] = faces;
    assert.deepEqual(first, { reaction: bored.probabilities, understands: 0.8, trusts: 0.3, shares: 0.1 });
    assert.equal(topReaction(first!.reaction), "bored");
    assert.deepEqual(second, { reaction: delighted.probabilities, understands: 1, trusts: 0, shares: 0.5 });
    assert.equal(topReaction(second!.reaction), "delighted");
  });

  it("fails loudly when an answer is missing, lacks an option, or carries a value Jev cannot have meant", () => {
    assert.throws(() => readAnswers(answers, 3), /missing choice answer p2_reaction/);
    const { p0_shares: _dropped, ...withoutShares } = answers;
    assert.throws(() => readAnswers(withoutShares, 1), /missing noul answer p0_shares/);
    const withReaction = (r: ReturnType<typeof reaction>): BatchAnswers => ({ ...answers, p0_reaction: r });
    assert.throws(() => readAnswers(withReaction(reaction({ probabilities: { bored: 1 } })), 1), /p0_reaction has probabilities for \["bored"\]/);
    assert.throws(() => readAnswers(withReaction(reaction({ probabilities: { ...reaction().probabilities, elated: 0 } })), 1), /p0_reaction has probabilities for/);
    assert.throws(() => readAnswers(withReaction(reaction({ choice: "elated" })), 1), /p0_reaction chose "elated"/);
    assert.throws(() => readAnswers(withReaction(reaction({ confidence: 1.5 })), 1), /p0_reaction has confidence 1.5/);
    assert.throws(() => readAnswers(withReaction(reaction({ confidence: Number.NaN })), 1), /p0_reaction has confidence NaN/);
    assert.throws(() => readAnswers(withReaction(reaction({ probabilities: { ...reaction().probabilities, bored: -0.5 } })), 1), /p0_reaction has probability -0.5 for bored/);
    assert.throws(() => readAnswers(withReaction(reaction({ probabilities: { ...reaction().probabilities, bored: Number.POSITIVE_INFINITY } })), 1), /probability Infinity for bored/);
    assert.throws(() => readAnswers({ ...answers, p0_trusts: { type: "noul", noul: 2 } }, 1), /p0_trusts is 2, not a number/);
    assert.throws(() => readAnswers({ ...answers, p0_trusts: { type: "noul", noul: Number.NaN } }, 1), /p0_trusts is NaN/);
  });
});
