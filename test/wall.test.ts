import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { BATCH_SIZE, batchCount, batchesOf, judgeWall } from "../src/shared/wall.ts";
import { loadFixture } from "../recordings/schema.ts";
import { fixtureClient } from "./helpers/fixture-client.ts";

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe("batchesOf", () => {
  it("splits into consecutive slices with a short tail", () => {
    assert.deepEqual(batchesOf([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(batchesOf([], 3), []);
    assert.throws(() => batchesOf([1], 0), /positive integer/);
  });
});

describe("judgeWall against the recorded fixture", () => {
  const fixture = loadFixture();

  it("returns every persona in wall order from batches of BATCH_SIZE", async () => {
    const client = fixtureClient(fixture);
    const wall = await judgeWall(preset("launch-hype").message, client);
    assert.equal(wall.faces.length, PERSONAS.length);
    assert.equal(wall.calls, batchCount());
    assert.equal(client.calls.length, wall.calls);
    assert.equal(wall.model, fixture.model);
    assert.deepEqual(client.calls.flatMap((c) => c.personaNames), PERSONAS.map((p) => p.name));
    for (const call of client.calls) assert.ok(call.personaNames.length <= BATCH_SIZE);
    const recorded = fixture.presets["launch-hype"]!;
    assert.deepEqual(wall.faces[0], recorded.faces[PERSONAS[0]!.name]);
    assert.deepEqual(wall.faces[99], recorded.faces[PERSONAS[99]!.name]);
    // The fake apportions the recorded total per call and rounds, so allow one token per call.
    assert.ok(Math.abs(wall.inputTokens - recorded.inputTokens) <= wall.calls, `${wall.inputTokens} vs recorded ${recorded.inputTokens}`);
  });

  it("honours a batch size override", async () => {
    const client = fixtureClient(fixture, { ignoreBatchSize: true });
    const wall = await judgeWall(preset("hot-take").message, client, { batchSize: 25 });
    assert.equal(wall.calls, 4);
    assert.equal(client.calls.every((c) => c.personaNames.length === 25), true);
    await assert.rejects(judgeWall(preset("hot-take").message, fixtureClient(fixture), { batchSize: 25 }), /recorded in batches of 10/);
  });

  it("refuses a message the fixture never saw", async () => {
    await assert.rejects(judgeWall("something unrecorded", fixtureClient(fixture)), /no recording/);
  });

  it("aborts the other batches once one fails and rethrows the first failure", async () => {
    const signals: AbortSignal[] = [];
    const client = {
      systemOne(_request: unknown, options?: { signal?: AbortSignal }) {
        signals.push(options!.signal!);
        return signals.length === 1 ? Promise.reject(new Error("batch one failed")) : new Promise<never>(() => {});
      },
    };
    await assert.rejects(judgeWall("anything", client), /batch one failed/);
    assert.equal(signals.length, batchCount());
    assert.ok(signals.every((s) => s.aborted), "every sibling call was aborted");
  });

  it("shows the presets doing what they were written to do", async () => {
    const client = fixtureClient(fixture);
    const walls = Object.fromEntries(await Promise.all(PRESETS.map(async (p) => [p.id, aggregateWall((await judgeWall(p.message, client)).faces)] as const)));
    const hype = walls["launch-hype"]!;
    const plain = walls["launch-plain"]!;
    const salesy = walls["dm-salesy"]!;
    const human = walls["dm-human"]!;
    const hotTake = walls["hot-take"]!;
    const apology = walls["apology"]!;
    assert.ok(hype.reaction.annoyed > plain.reaction.annoyed, `hype annoys ${hype.reaction.annoyed}, plain ${plain.reaction.annoyed}`);
    assert.ok(human.trusts > salesy.trusts, `human DM trusted by ${human.trusts}, salesy by ${salesy.trusts}`);
    assert.ok(salesy.reaction.annoyed > human.reaction.annoyed, `salesy DM annoys ${salesy.reaction.annoyed}, human ${human.reaction.annoyed}`);
    assert.ok(apology.trusts > hotTake.trusts, `apology trusted by ${apology.trusts}, hot take by ${hotTake.trusts}`);
    assert.ok(apology.reaction.interested > hotTake.reaction.interested, `apology interests ${apology.reaction.interested}, hot take ${hotTake.reaction.interested}`);
  });
});
