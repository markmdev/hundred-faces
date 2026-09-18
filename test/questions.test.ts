import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERSONAS } from "../src/shared/personas.ts";
import { buildQuestions, buildState, readAnswers, topReaction, type RawAnswers } from "../src/shared/questions.ts";
import { REACTION_CRITERIA, REACTIONS } from "../src/shared/reactions.ts";

describe("personas", () => {
  it("are one hundred distinct people with every field filled", () => {
    assert.equal(PERSONAS.length, 100);
    assert.equal(new Set(PERSONAS.map((p) => p.name)).size, 100, "names are unique");
    for (const p of PERSONAS) {
      for (const [key, value] of Object.entries(p)) {
        assert.ok(value !== "" && value !== undefined, `${p.name}.${key} is set`);
      }
      // The design asks for around 40 to 60 words per person.
      const words = Object.values(p).join(" ").split(/\s+/).length;
      assert.ok(words >= 38 && words <= 70, `${p.name} is ${words} words`);
    }
  });
});

describe("buildQuestions", () => {
  it("asks one choice and three nouls per persona, each naming its persona by path", () => {
    const questions = buildQuestions(3);
    assert.equal(Object.keys(questions).length, 12);
    for (let i = 0; i < 3; i++) {
      const reaction = questions[`p${i}_reaction`]!;
      assert.equal(reaction.type, "choice");
      assert.deepEqual(reaction.criteria, REACTION_CRITERIA);
      for (const suffix of ["reaction", "understands", "trusts", "shares"]) {
        const q = questions[`p${i}_${suffix}`]!;
        const text = JSON.stringify(q.instructions);
        assert.ok(text.includes(`\`personas[${i}]\``), `p${i}_${suffix} names personas[${i}]`);
        assert.ok(text.includes("`message`"), `p${i}_${suffix} names the message`);
        assert.ok(/not a typical reader/.test(text), `p${i}_${suffix} says it is about this specific person`);
      }
      for (const suffix of ["understands", "trusts", "shares"]) assert.equal(questions[`p${i}_${suffix}`]!.type, "noul");
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
  it("copies the personas so the batch cannot alias the source list", () => {
    const personas = PERSONAS.slice(0, 2);
    const state = buildState("hi", personas);
    assert.deepEqual(state, { message: "hi", personas });
    assert.notEqual(state.personas, personas);
  });
});

describe("readAnswers", () => {
  const answers: RawAnswers = {
    p0_reaction: { type: "choice", choice: "bored", confidence: 0.4, probabilities: { delighted: 0, interested: 0.1, neutral: 0.2, confused: 0, bored: 0.5, annoyed: 0.2, offended: 0 } },
    p0_understands: { type: "noul", noul: 0.8 },
    p0_trusts: { type: "noul", noul: 0.3 },
    p0_shares: { type: "noul", noul: 0.1 },
  };

  it("reads one face per persona in order", () => {
    const [face] = readAnswers(answers, 1);
    assert.equal(face!.confidence, 0.4);
    assert.equal(face!.reaction.bored, 0.5);
    assert.equal(face!.understands, 0.8);
    assert.equal(face!.trusts, 0.3);
    assert.equal(face!.shares, 0.1);
    assert.equal(topReaction(face!.reaction), "bored");
  });

  it("fails loudly when an answer is missing or lacks an option", () => {
    assert.throws(() => readAnswers(answers, 2), /missing choice answer p1_reaction/);
    const { p0_shares: _dropped, ...withoutShares } = answers;
    assert.throws(() => readAnswers(withoutShares, 1), /missing noul answer p0_shares/);
    const partial = { ...answers, p0_reaction: { type: "choice" as const, choice: "bored", confidence: 1, probabilities: { bored: 1 } } };
    assert.throws(() => readAnswers(partial, 1), /lacks option delighted/);
  });
});
