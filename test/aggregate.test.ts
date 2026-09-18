import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWall, YES } from "../src/shared/aggregate.ts";
import type { FaceAnswer } from "../src/shared/questions.ts";
import { REACTIONS, type ReactionDistribution } from "../src/shared/reactions.ts";

const face = (weights: Partial<ReactionDistribution>, nouls: [number, number, number]): FaceAnswer => ({
  reaction: Object.fromEntries(REACTIONS.map((r) => [r, weights[r] ?? 0])) as ReactionDistribution,
  confidence: 1,
  understands: nouls[0],
  trusts: nouls[1],
  shares: nouls[2],
});

describe("aggregateWall", () => {
  it("averages the reaction distributions and counts nouls above the yes threshold", () => {
    const agg = aggregateWall([
      face({ delighted: 1 }, [0.9, 0.2, 0.7]),
      face({ annoyed: 0.5, bored: 0.5 }, [0.4, 0.6, 0.51]),
      face({ annoyed: 1 }, [YES, 0.55, 0.1]),
    ]);
    assert.equal(agg.total, 3);
    assert.ok(Math.abs(agg.reaction.delighted - 1 / 3) < 1e-12);
    assert.ok(Math.abs(agg.reaction.annoyed - 0.5) < 1e-12);
    assert.ok(Math.abs(agg.reaction.bored - 1 / 6) < 1e-12);
    const mass = REACTIONS.reduce((s, r) => s + agg.reaction[r], 0);
    assert.ok(Math.abs(mass - 1) < 1e-12, "mean distribution sums to 1");
    assert.equal(agg.understands, 1, "exactly the threshold is not a yes");
    assert.equal(agg.trusts, 2);
    assert.equal(agg.shares, 2);
  });

  it("handles an empty wall without dividing by zero", () => {
    const agg = aggregateWall([]);
    assert.equal(agg.total, 0);
    assert.equal(agg.understands, 0);
    for (const r of REACTIONS) assert.equal(agg.reaction[r], 0);
  });
});
