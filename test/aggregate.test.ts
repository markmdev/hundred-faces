import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWall, YES } from "../src/shared/aggregate.ts";
import { PRESETS } from "../src/shared/presets.ts";
import type { FaceAnswer } from "../src/shared/questions.ts";
import { emptyDistribution, percentages, REACTIONS, type ReactionDistribution } from "../src/shared/reactions.ts";
import { judgeWall } from "../src/shared/wall.ts";
import { loadFixture } from "../recordings/schema.ts";
import { fixtureClient } from "./helpers/fixture-client.ts";

const face = (weights: Partial<ReactionDistribution>, nouls: [number, number, number]): FaceAnswer => ({
  reaction: { ...emptyDistribution(), ...weights },
  understands: nouls[0],
  trusts: nouls[1],
  shares: nouls[2],
});

const mass = (distribution: ReactionDistribution) => REACTIONS.reduce((s, r) => s + distribution[r], 0);

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
    assert.ok(Math.abs(mass(agg.reaction) - 1) < 1e-12, "mean distribution sums to 1");
    assert.equal(agg.understands, 1, "exactly the threshold is not a yes");
    assert.equal(agg.trusts, 2);
    assert.equal(agg.shares, 2);
  });

  it("normalises faces whose rounded probabilities fall short of 1", () => {
    const agg = aggregateWall([face({ confused: 0.66, annoyed: 0.33 }, [0, 0, 0]), face({ confused: 0.5, bored: 0.49 }, [0, 0, 0])]);
    assert.ok(Math.abs(mass(agg.reaction) - 1) < 1e-12);
  });

  it("handles an empty wall without dividing by zero", () => {
    const agg = aggregateWall([]);
    assert.equal(agg.total, 0);
    assert.equal(agg.understands, 0);
    for (const r of REACTIONS) assert.equal(agg.reaction[r], 0);
  });
});

describe("percentages", () => {
  it("totals exactly 100 where independent rounding would not", () => {
    const thirds = percentages({ ...emptyDistribution(), delighted: 0.335, neutral: 0.335, bored: 0.33 });
    assert.equal(Math.round(33.5) + Math.round(33.5) + Math.round(33), 101, "independent rounding overshoots");
    assert.deepEqual(thirds, { ...emptyDistribution(), delighted: 34, neutral: 33, bored: 33 });
    assert.equal(mass(thirds), 100);
  });

  it("totals exactly 100 for every recorded preset's mean and every recorded face", async () => {
    const fixture = loadFixture();
    const client = fixtureClient(fixture);
    for (const preset of PRESETS) {
      const wall = await judgeWall(preset.message, client);
      const agg = aggregateWall(wall.faces);
      const naive = REACTIONS.reduce((s, r) => s + Math.round(agg.reaction[r] * 100), 0);
      assert.equal(mass(percentages(agg.reaction)), 100, `${preset.id} (independent rounding gives ${naive})`);
      for (const f of wall.faces) assert.equal(mass(percentages(f.reaction)), 100);
    }
  });
});
