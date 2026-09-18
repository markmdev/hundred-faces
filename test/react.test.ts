// Contract tests for GET /api/react: the handler with the recording-backed
// client on one side, the browser's fetchWall on the other, one recording
// between them, including the message limits, the error shapes, the cache
// headers, the Node adapter the local server uses, and the Vercel function.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { RateLimitError } from "@typesafe-ai/sdk";
import { loadFixture } from "../recordings/schema.ts";
import { createNodeServer } from "../server/node.ts";
import { CACHE_NONE, CACHE_WALL, react, type ReactOptions } from "../server/react.ts";
import { fetchWall, WallRequestError, wallUrl } from "../src/client/api.ts";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { MAX_MESSAGE_CHARS, MAX_MESSAGE_URL_BYTES, messageTooLong, type WallResponse } from "../src/shared/types.ts";
import { judgeWall } from "../src/shared/wall.ts";
import { fixtureClient } from "./helpers/fixture-client.ts";

const silent: ReactOptions["log"] = { info() {}, error() {} };
const noAbort = new AbortController().signal;
const ORIGIN = "http://wall.test";

// The same strings on both sides of the limits. An emoji is one code point
// and 12 bytes once URL-encoded, so 2,000 of them fit the count and not the
// encoded size; the smaller over-size string also fits Node's 16 KB header
// limit, so it reaches the handler over HTTP.
const OVER_BY_COUNT = "x".repeat(MAX_MESSAGE_CHARS + 1);
const AT_COUNT_LIMIT = "x".repeat(MAX_MESSAGE_CHARS);
const TWO_THOUSAND_EMOJI = "🙂".repeat(MAX_MESSAGE_CHARS);
const AT_BYTES_LIMIT = "🙂".repeat(MAX_MESSAGE_URL_BYTES / 12);
const OVER_BY_BYTES = "🙂".repeat(MAX_MESSAGE_URL_BYTES / 12 + 1);

const listen = (server: ReturnType<typeof createNodeServer>): Promise<string> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

const rejectsWithStatus = (promise: Promise<unknown>, status: number, message: RegExp | string) =>
  assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof WallRequestError, `threw ${String(err)}`);
    assert.equal(err.status, status);
    if (typeof message === "string") assert.equal(err.message, message);
    else assert.match(err.message, message);
    return true;
  });

describe("the message limits", () => {
  it("count code points first, then the encoded length, with one reason for each", () => {
    assert.equal(messageTooLong(AT_COUNT_LIMIT), null);
    assert.equal(encodeURIComponent(AT_BYTES_LIMIT).length, MAX_MESSAGE_URL_BYTES);
    assert.equal(messageTooLong(AT_BYTES_LIMIT), null);
    assert.equal(messageTooLong(OVER_BY_COUNT), `This message is ${MAX_MESSAGE_CHARS + 1} characters; the limit is ${MAX_MESSAGE_CHARS} characters.`);
    // 4,000 UTF-16 units, but 2,000 code points: within the count, refused for the encoded size alone.
    assert.match(messageTooLong(TWO_THOUSAND_EMOJI)!, new RegExp(`^This message is ${MAX_MESSAGE_CHARS * 12} bytes .* the limit is ${MAX_MESSAGE_URL_BYTES} bytes`));
    assert.match(messageTooLong(OVER_BY_BYTES)!, /bytes/);
  });
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

  it("rejects an empty message, and one over either limit, uncached, with the reason", async () => {
    const empty = await get("   ");
    assert.equal(empty.status, 400);
    assert.equal(empty.headers.get("cache-control"), CACHE_NONE);
    assert.deepEqual(await empty.json(), { error: "m must be a non-empty message" });
    const missing = await react(new Request(`${ORIGIN}/api/react`), options);
    assert.equal(missing.status, 400);
    for (const message of [OVER_BY_COUNT, TWO_THOUSAND_EMOJI, OVER_BY_BYTES]) {
      const long = await get(message);
      assert.equal(long.status, 413);
      assert.equal(long.headers.get("cache-control"), CACHE_NONE);
      assert.deepEqual(await long.json(), { error: messageTooLong(message) });
    }
    // At either limit the message reaches judging (where the recording has no answer for it).
    for (const message of [AT_COUNT_LIMIT, AT_BYTES_LIMIT]) {
      const fits = await get(message);
      assert.equal(fits.status, 500);
      assert.match(((await fits.json()) as { error: string }).error, /no recording/);
    }
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

describe("api/react.ts, the Vercel function", () => {
  const fixture = loadFixture();

  it("answers over its fetch export through the same handler, for a wall and a 413", async (t) => {
    t.mock.module(new URL("../server/jev.ts", import.meta.url).href, { namedExports: { jevClient: () => fixtureClient(fixture) } });
    t.mock.method(console, "info", () => {});
    const { default: fn } = await import("../api/react.ts");
    const preset = PRESETS[0]!;
    const res = await fn.fetch(new Request(wallUrl(preset.message, ORIGIN)));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), CACHE_WALL);
    const direct = await judgeWall(preset.message, fixtureClient(fixture));
    assert.deepEqual(((await res.json()) as WallResponse).faces, direct.faces);
    const long = await fn.fetch(new Request(wallUrl(OVER_BY_COUNT, ORIGIN)));
    assert.equal(long.status, 413);
    assert.deepEqual(await long.json(), { error: messageTooLong(OVER_BY_COUNT) });
  });
});

describe("the browser's fetchWall through the Node server", () => {
  const fixture = loadFixture();
  const server = createNodeServer((request) => react(request, { client: fixtureClient(fixture), log: silent }));
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
    await rejectsWithStatus(fetchWall(OVER_BY_COUNT, noAbort, base), 413, messageTooLong(OVER_BY_COUNT)!);
    await rejectsWithStatus(fetchWall(OVER_BY_BYTES, noAbort, base), 413, messageTooLong(OVER_BY_BYTES)!);
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
    let handlerSawAbort = false;
    const slow = createNodeServer(async (request) => {
      await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
      handlerSawAbort = true;
      return new Response(null, { status: 499 });
    });
    const slowBase = await listen(slow);
    try {
      const pending = fetchWall("hi", controller.signal, slowBase);
      await new Promise((resolve) => setTimeout(resolve, 50));
      controller.abort();
      await assert.rejects(pending, (err: unknown) => (err as Error).name === "AbortError");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(handlerSawAbort, "the handler saw the abort");
    } finally {
      slow.close();
    }
  });
});
