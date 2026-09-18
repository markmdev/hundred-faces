// Contract test across the HTTP boundary: the server built with the fixture
// client on one side, the browser's fetchWall on the other, one recorded
// fixture between them, including the error shapes.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { RateLimitError } from "@typesafe-ai/sdk";
import { createApp, MAX_MESSAGE_CHARS } from "../server/app.ts";
import { fetchWall } from "../src/client/api.ts";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { judgeWall } from "../src/shared/wall.ts";
import { fixtureClient, loadFixture } from "./helpers/fixture-client.ts";

const listen = (app: ReturnType<typeof createApp>): Promise<string> =>
  new Promise((resolve) => {
    app.listen(0, "127.0.0.1", () => {
      const address = app.address();
      if (!address || typeof address === "string") throw new Error("no port");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

describe("POST /api/react", () => {
  const fixture = loadFixture();
  const client = fixtureClient(fixture);
  const app = createApp({ client, distDir: null });
  let base = "";
  before(async () => {
    base = await listen(app);
  });
  after(() => app.close());

  it("returns the same wall the browser would compute from judgeWall directly", async () => {
    const preset = PRESETS[0]!;
    const viaHttp = await fetchWall(preset.message, PERSONAS.length, base);
    const direct = await judgeWall(preset.message, fixtureClient(fixture));
    assert.deepEqual(viaHttp.faces, direct.faces);
    assert.equal(viaHttp.calls, direct.calls);
    assert.equal(viaHttp.inputTokens, direct.inputTokens);
    assert.equal(viaHttp.model, fixture.model);
    assert.equal(typeof viaHttp.latencyMs, "number");
    assert.deepEqual(aggregateWall(viaHttp.faces), aggregateWall(direct.faces));
  });

  it("rejects an empty message and an oversized one with the error shape the client shows", async () => {
    await assert.rejects(fetchWall("   ", PERSONAS.length, base), /message must be a non-empty string/);
    await assert.rejects(fetchWall("x".repeat(MAX_MESSAGE_CHARS + 1), PERSONAS.length, base), /the limit is 4000/);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await fetch(`${base}/api/react`, { method: "POST", body: "not json" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "body is not JSON" });
  });

  it("surfaces a failure inside judging as a 500 with the reason", async () => {
    await assert.rejects(fetchWall("never recorded", PERSONAS.length, base), /no recording/);
  });

  it("reports health with the batch size", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; batchSize: number; model: string };
    assert.equal(body.ok, true);
    assert.equal(body.model, fixture.model);
    assert.equal(typeof body.batchSize, "number");
  });
});

describe("POST /api/react when Jev rate-limits", () => {
  const app = createApp({
    client: {
      async systemOne() {
        throw new RateLimitError(429, { error: "rate limit exceeded" }, new Headers({ "retry-after": "1" }));
      },
    },
    distDir: null,
  });
  let base = "";
  before(async () => {
    base = await listen(app);
  });
  after(() => app.close());

  it("passes the 429 through and the client explains it", async () => {
    const res = await fetch(`${base}/api/react`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) });
    assert.equal(res.status, 429);
    assert.match(((await res.json()) as { error: string }).error, /Jev returned 429/);
    await assert.rejects(fetchWall("hi", PERSONAS.length, base), /rate-limiting us/);
  });
});
