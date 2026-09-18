// Contract test across the HTTP boundary: the server built with the fixture
// client on one side, the browser's fetchWall on the other, one recorded
// fixture between them, including the error shapes.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { RateLimitError } from "@typesafe-ai/sdk";
import { createApp, type AppOptions } from "../server/app.ts";
import { fetchWall, WallRequestError } from "../src/client/api.ts";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { MAX_MESSAGE_CHARS } from "../src/shared/types.ts";
import { judgeWall } from "../src/shared/wall.ts";
import { loadFixture } from "./fixtures/schema.ts";
import { fixtureClient } from "./helpers/fixture-client.ts";

const silent: AppOptions["log"] = { error() {} };
const noAbort = new AbortController().signal;

const listen = (app: ReturnType<typeof createApp>): Promise<string> =>
  new Promise((resolve) => {
    app.listen(0, "127.0.0.1", () => {
      const address = app.address();
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

// Sends a body in chunks with no content-length, so only the streaming cap can stop it.
const postChunked = (base: string, body: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = request(`${base}/api/react`, { method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" } }, (res) => {
      let text = "";
      res.on("data", (chunk: Buffer) => (text += chunk.toString("utf8")));
      res.on("end", () => resolve({ status: res.statusCode!, body: text }));
    });
    req.on("error", reject);
    for (let i = 0; i < body.length; i += 8 * 1024) req.write(body.slice(i, i + 8 * 1024));
    req.end();
  });

describe("POST /api/react", () => {
  const fixture = loadFixture();
  const client = fixtureClient(fixture);
  const app = createApp({ client, distDir: null, log: silent });
  let base = "";
  before(async () => {
    base = await listen(app);
  });
  after(() => app.close());

  it("returns the same wall the browser would compute from judgeWall directly", async () => {
    const preset = PRESETS[0]!;
    const viaHttp = await fetchWall(preset.message, noAbort, base);
    const direct = await judgeWall(preset.message, fixtureClient(fixture));
    assert.deepEqual(viaHttp.faces, direct.faces);
    assert.equal(viaHttp.calls, direct.calls);
    assert.equal(viaHttp.inputTokens, direct.inputTokens);
    assert.equal(viaHttp.model, fixture.model);
    assert.equal(typeof viaHttp.latencyMs, "number");
    assert.deepEqual(aggregateWall(viaHttp.faces), aggregateWall(direct.faces));
  });

  it("rejects an empty message and an oversized one with the error shape the client shows", async () => {
    await rejectsWithStatus(fetchWall("   ", noAbort, base), 400, /message must be a non-empty string/);
    await rejectsWithStatus(fetchWall("x".repeat(MAX_MESSAGE_CHARS + 1), noAbort, base), 413, /the limit is 4000 characters/);
    // 4,000 astral characters are 8,000 UTF-16 units; counted in code points they pass the length check and reach judging.
    await rejectsWithStatus(fetchWall("🙂".repeat(MAX_MESSAGE_CHARS), noAbort, base), 500, /no recording/);
  });

  it("answers 413 to a 70 KB body, declared or streamed, instead of resetting the connection", async () => {
    const message = "x".repeat(70 * 1024);
    await rejectsWithStatus(fetchWall(message, noAbort, base), 413, /request body is \d+ bytes; the limit is 65536/);
    const streamed = await postChunked(base, JSON.stringify({ message }));
    assert.equal(streamed.status, 413);
    assert.deepEqual(JSON.parse(streamed.body), { error: "request body exceeds 65536 bytes" });
  });

  it("rejects a body that is not JSON", async () => {
    const res = await fetch(`${base}/api/react`, { method: "POST", body: "not json" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "body is not JSON" });
  });

  it("surfaces a failure inside judging as a 500 with the reason", async () => {
    await rejectsWithStatus(fetchWall("never recorded", noAbort, base), 500, /no recording/);
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
    log: silent,
  });
  let base = "";
  before(async () => {
    base = await listen(app);
  });
  after(() => app.close());

  it("passes the 429 through with the status the client reads", async () => {
    const res = await fetch(`${base}/api/react`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) });
    assert.equal(res.status, 429);
    assert.match(((await res.json()) as { error: string }).error, /Jev returned 429/);
    await rejectsWithStatus(fetchWall("hi", noAbort, base), 429, /Jev returned 429/);
  });
});

describe("static files in production", () => {
  const dist = mkdtempSync(join(tmpdir(), "hundred-faces-dist-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>t</title>");
  writeFileSync(join(dist, "assets", "app.js"), "console.log(1)");
  const app = createApp({ client: fixtureClient(), distDir: dist, log: silent });
  let base = "";
  before(async () => {
    base = await listen(app);
  });
  after(() => {
    app.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it("serves the page, its assets, and page routes, and 404s a missing file", async () => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type")!, /text\/html/);
    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type")!, /javascript/);
    assert.equal(await asset.text(), "console.log(1)");
    const route = await fetch(`${base}/some/route`);
    assert.equal(route.status, 200);
    assert.match(route.headers.get("content-type")!, /text\/html/);
    const missing = await fetch(`${base}/assets/old-hash.js`);
    assert.equal(missing.status, 404);
  });

  it("refuses a path that resolves outside dist and a path it cannot decode", async () => {
    const escape = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);
    assert.equal(escape.status, 403);
    assert.deepEqual(await escape.json(), { error: "forbidden" });
    const malformed = await fetch(`${base}/assets/%E0%A4%A`);
    assert.equal(malformed.status, 400);
    assert.match(((await malformed.json()) as { error: string }).error, /malformed percent-encoding/);
  });
});
