import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { BATCH_SIZE, batchesOf, judgeWall } from "../src/shared/wall.ts";
import { fixtureClient, loadFixture } from "./helpers/fixture-client.ts";

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

  it("returns every persona in wall order from parallel batches of BATCH_SIZE", async () => {
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
    const client = fixtureClient(fixture);
    const wall = await judgeWall(preset("clickbait").message, client, { batchSize: 25 });
    assert.equal(wall.calls, 4);
    assert.equal(client.calls.every((c) => c.personaNames.length === 25), true);
  });

  it("refuses a message the fixture never saw", async () => {
    await assert.rejects(judgeWall("something unrecorded", fixtureClient(fixture)), /no recording/);
  });

  it("shows the presets doing what they were written to do", async () => {
    const client = fixtureClient(fixture);
    const walls = Object.fromEntries(await Promise.all(PRESETS.map(async (p) => [p.id, aggregateWall((await judgeWall(p.message, client)).faces)] as const)));
    const jargon = walls["blurb-jargon"]!;
    const plain = walls["blurb-plain"]!;
    const blunt = walls["price-blunt"]!;
    const gentle = walls["price-gentle"]!;
    assert.ok(jargon.understands < plain.understands, `jargon understood by ${jargon.understands}, plain by ${plain.understands}`);
    assert.ok(jargon.reaction.confused > plain.reaction.confused, "jargon confuses more than plain");
    assert.ok(blunt.reaction.annoyed > gentle.reaction.annoyed, `blunt annoys ${blunt.reaction.annoyed}, gentle ${gentle.reaction.annoyed}`);
    assert.ok(gentle.trusts > blunt.trusts, `gentle trusted by ${gentle.trusts}, blunt by ${blunt.trusts}`);
  });
});
