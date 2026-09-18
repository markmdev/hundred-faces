import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { BATCH_SIZE, batchesOf, judgeWall } from "../src/shared/wall.ts";
import { loadFixture } from "./fixtures/schema.ts";
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
    const wall = await judgeWall(preset("price-blunt").message, client);
    assert.equal(wall.faces.length, PERSONAS.length);
    assert.equal(wall.calls, Math.ceil(PERSONAS.length / BATCH_SIZE));
    assert.equal(client.calls.length, wall.calls);
    assert.equal(wall.model, fixture.model);
    assert.deepEqual(client.calls.flatMap((c) => c.personaNames), PERSONAS.map((p) => p.name));
    for (const call of client.calls) assert.ok(call.personaNames.length <= BATCH_SIZE);
    const recorded = fixture.presets["price-blunt"]!;
    assert.deepEqual(wall.faces[0], recorded.faces[PERSONAS[0]!.name]);
    assert.deepEqual(wall.faces[99], recorded.faces[PERSONAS[99]!.name]);
    // The fake apportions the recorded total per call and rounds, so allow one token per call.
    assert.ok(Math.abs(wall.inputTokens - recorded.inputTokens) <= wall.calls, `${wall.inputTokens} vs recorded ${recorded.inputTokens}`);
  });

  it("honours a batch size override", async () => {
    const client = fixtureClient(fixture, { ignoreBatchSize: true });
    const wall = await judgeWall(preset("clickbait").message, client, { batchSize: 25 });
    assert.equal(wall.calls, 4);
    assert.equal(client.calls.every((c) => c.personaNames.length === 25), true);
    await assert.rejects(judgeWall(preset("clickbait").message, fixtureClient(fixture), { batchSize: 25 }), /recorded in batches of 5/);
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
    assert.equal(signals.length, Math.ceil(PERSONAS.length / BATCH_SIZE));
    assert.ok(signals.every((s) => s.aborted), "every sibling call was aborted");
  });

  it("shows the presets doing what they were written to do", async () => {
    const client = fixtureClient(fixture);
    const walls = Object.fromEntries(await Promise.all(PRESETS.map(async (p) => [p.id, aggregateWall((await judgeWall(p.message, client)).faces)] as const)));
    const jargon = walls["blurb-jargon"]!;
    const plain = walls["blurb-plain"]!;
    const blunt = walls["price-blunt"]!;
    const gentle = walls["price-gentle"]!;
    const clickbait = walls["clickbait"]!;
    assert.ok(jargon.understands < plain.understands, `jargon understood by ${jargon.understands}, plain by ${plain.understands}`);
    assert.ok(jargon.reaction.confused > plain.reaction.confused, "jargon confuses more than plain");
    assert.ok(blunt.reaction.annoyed > gentle.reaction.annoyed, `blunt annoys ${blunt.reaction.annoyed}, gentle ${gentle.reaction.annoyed}`);
    assert.ok(gentle.trusts > blunt.trusts, `gentle trusted by ${gentle.trusts}, blunt by ${blunt.trusts}`);
    assert.ok(clickbait.reaction.annoyed > plain.reaction.annoyed, `clickbait annoys ${clickbait.reaction.annoyed}, plain blurb ${plain.reaction.annoyed}`);
    assert.ok(clickbait.shares < gentle.shares, `clickbait shared by ${clickbait.shares}, gentle price message by ${gentle.shares}`);
  });
});
