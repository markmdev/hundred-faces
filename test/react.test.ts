// Contract tests for GET /api/react: the handler with the fixture client on
// one side, the browser's fetchWall on the other, one recorded fixture between
// them, including the error shapes, the cache headers, and the Node adapter
// the local server uses.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { RateLimitError } from "@typesafe-ai/sdk";
import { createNodeServer, type Handler } from "../server/node.ts";
import { CACHE_NONE, CACHE_WALL, react, type ReactOptions } from "../server/react.ts";
import { fetchWall, WallRequestError, wallUrl } from "../src/client/api.ts";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { MAX_MESSAGE_CHARS } from "../src/shared/types.ts";
import { judgeWall } from "../src/shared/wall.ts";
import { loadFixture } from "../recordings/schema.ts";
import { fixtureClient } from "./helpers/fixture-client.ts";

const silent: ReactOptions["log"] = { info() {}, error() {} };
const noAbort = new AbortController().signal;
const ORIGIN = "http://wall.test";

const listen = (server: ReturnType<typeof createNodeServer>): Promise<string> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

const rejectsWithStatus = (promise: Promise<unknown>, status: number, message: RegExp) =>
  assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof WallRequestError, `threw ${String(err)}`);
    assert.equal(err.status, status);
    assert.match(err.message, message);
    return true;
  });

describe("GET /api/react", () => {
  const fixture = loadFixture();
  const options: ReactOptions = { client: fixtureClient(fixture), log: silent };
  const get = (message: string, headers: Record<string, string> = {}) => react(new Request(wallUrl(message, ORIGIN), { headers }), options);

  it("judges the message from the query and marks the wall cacheable", async () => {
    const preset = PRESETS[0]!;
    const res = await get(preset.message);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), CACHE_WALL);
    assert.match(res.headers.get("content-type")!, /application\/json/);
    const wall = await res.json();
    const direct = await judgeWall(preset.message, fixtureClient(fixture));
    assert.deepEqual(wall.faces, direct.faces);
    assert.equal(wall.calls, direct.calls);
    assert.equal(wall.inputTokens, direct.inputTokens);
    assert.equal(wall.model, fixture.model);
    assert.equal(typeof wall.latencyMs, "number");
    assert.deepEqual(aggregateWall(wall.faces), aggregateWall(direct.faces));
  });

  it("rejects an empty message and an oversized one, uncached, with the reason", async () => {
    const empty = await get("   ");
    assert.equal(empty.status, 400);
    assert.equal(empty.headers.get("cache-control"), CACHE_NONE);
    assert.deepEqual(await empty.json(), { error: "m must be a non-empty message" });
    const missing = await react(new Request(`${ORIGIN}/api/react`), options);
    assert.equal(missing.status, 400);
    const long = await get("x".repeat(MAX_MESSAGE_CHARS + 1));
    assert.equal(long.status, 413);
    assert.equal(long.headers.get("cache-control"), CACHE_NONE);
    assert.deepEqual(await long.json(), { error: `message is ${MAX_MESSAGE_CHARS + 1} characters; the limit is ${MAX_MESSAGE_CHARS} characters` });
    // 2,000 astral characters are 4,000 UTF-16 units; counted in code points they pass and reach judging.
    const astral = await get("🙂".repeat(MAX_MESSAGE_CHARS));
    assert.equal(astral.status, 500);
    assert.match(((await astral.json()) as { error: string }).error, /no recording/);
  });

  it("refuses a cross-site caller and allows the page and a typed URL", async () => {
    const preset = PRESETS[0]!;
    const cross = await get(preset.message, { "sec-fetch-site": "cross-site" });
    assert.equal(cross.status, 403);
    assert.equal(cross.headers.get("cache-control"), CACHE_NONE);
    assert.deepEqual(await cross.json(), { error: "the wall answers its own page only" });
    assert.equal((await get(preset.message, { "sec-fetch-site": "same-site" })).status, 403);
    assert.equal((await get(preset.message, { "sec-fetch-site": "same-origin" })).status, 200);
    assert.equal((await get(preset.message, { "sec-fetch-site": "none" })).status, 200);
  });

  it("answers 405 to anything but GET", async () => {
    const res = await react(new Request(wallUrl("hi", ORIGIN), { method: "POST" }), options);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET");
    assert.equal(res.headers.get("cache-control"), CACHE_NONE);
  });

  it("surfaces a failure inside judging as an uncached 500 with the reason", async () => {
    const res = await get("never recorded");
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("cache-control"), CACHE_NONE);
    assert.match(((await res.json()) as { error: string }).error, /no recording/);
  });

  it("passes a Jev 429 through, uncached", async () => {
    const busy: ReactOptions = {
      client: {
        async systemOne() {
          throw new RateLimitError(429, { error: "rate limit exceeded" }, new Headers({ "retry-after": "1" }));
        },
      },
      log: silent,
    };
    const res = await react(new Request(wallUrl("hi", ORIGIN)), busy);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("cache-control"), CACHE_NONE);
    assert.match(((await res.json()) as { error: string }).error, /Jev returned 429/);
  });
});

describe("the browser's fetchWall through the Node server", () => {
  const fixture = loadFixture();
  let aborted: AbortSignal | null = null;
  const handler: Handler = (request) => {
    aborted = request.signal;
    return react(request, { client: fixtureClient(fixture), log: silent });
  };
  const server = createNodeServer(handler);
  let base = "";
  before(async () => {
    base = await listen(server);
  });
  after(() => server.close());

  it("returns the same wall judgeWall computes directly, with the headers the handler set", async () => {
    const preset = PRESETS[1]!;
    const viaHttp = await fetchWall(preset.message, noAbort, base);
    const direct = await judgeWall(preset.message, fixtureClient(fixture));
    assert.deepEqual(viaHttp.faces, direct.faces);
    const raw = await fetch(wallUrl(preset.message, base));
    assert.equal(raw.headers.get("cache-control"), CACHE_WALL);
  });

  it("reads the error shape the handler sends, and a 429 the platform sends without JSON", async () => {
    await rejectsWithStatus(fetchWall("   ", noAbort, base), 400, /non-empty message/);
    await rejectsWithStatus(fetchWall("x".repeat(MAX_MESSAGE_CHARS + 1), noAbort, base), 413, /the limit is 2000 characters/);
    const platform = createNodeServer(async () => new Response("Too Many Requests", { status: 429, headers: { "content-type": "text/plain" } }));
    const platformBase = await listen(platform);
    try {
      await rejectsWithStatus(fetchWall("hi", noAbort, platformBase), 429, /^HTTP 429$/);
    } finally {
      platform.close();
    }
  });

  it("aborts the handler's request when the browser drops the connection", async () => {
    const controller = new AbortController();
    const slow = createNodeServer(async (request) => {
      aborted = request.signal;
      await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
      return new Response(null, { status: 499 });
    });
    const slowBase = await listen(slow);
    try {
      const pending = fetchWall("hi", controller.signal, slowBase);
      await new Promise((resolve) => setTimeout(resolve, 50));
      controller.abort();
      await assert.rejects(pending, (err: unknown) => (err as Error).name === "AbortError");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(aborted?.aborted, "the handler saw the abort");
    } finally {
      slow.close();
    }
  });
});
