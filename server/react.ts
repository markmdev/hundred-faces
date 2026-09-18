// The judging handler behind GET /api/react, Web-standard so the same code
// runs as the Vercel function (api/react.ts) and behind the local Node server
// (server/main.ts). The message travels in the query so the CDN can cache the
// answer per message. Nothing typed is logged: statuses and durations only.

import { APIError } from "@typesafe-ai/sdk";
import { MAX_MESSAGE_CHARS, MESSAGE_PARAM, type WallErrorResponse, type WallResponse } from "../src/shared/types.ts";
import { judgeWall, type JevClient } from "../src/shared/wall.ts";

export interface Log {
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface ReactOptions {
  client: JevClient;
  log?: Log;
}

// A wall is served by Vercel's CDN for a day and revalidated in the background
// for a week after that, so a repeated message or a shared link costs no Jev call.
export const CACHE_WALL = "public, s-maxage=86400, stale-while-revalidate=604800";
export const CACHE_NONE = "no-store";

export async function react(request: Request, { client, log = console }: ReactOptions): Promise<Response> {
  const started = performance.now();
  const response = await answer(request, client, log);
  log.info(`${request.method} /api/react ${response.status} in ${Math.round(performance.now() - started)} ms`);
  return response;
}

async function answer(request: Request, client: JevClient, log: Log): Promise<Response> {
  if (request.method !== "GET") return error(405, `${request.method} is not allowed; judge with GET`, { allow: "GET" });
  // Browsers send Sec-Fetch-Site; only the page itself (or a typed URL) may judge.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return error(403, "the wall answers its own page only");
  const message = new URL(request.url).searchParams.get(MESSAGE_PARAM);
  if (message === null || message.trim().length === 0) return error(400, `${MESSAGE_PARAM} must be a non-empty message`);
  const length = Array.from(message).length;
  if (length > MAX_MESSAGE_CHARS) return error(413, `message is ${length} characters; the limit is ${MAX_MESSAGE_CHARS} characters`);

  try {
    const wall: WallResponse = await judgeWall(message, client, { signal: request.signal });
    return json(200, wall, CACHE_WALL);
  } catch (err) {
    // The browser left (the box was cleared or the tab closed); nobody reads this.
    if (request.signal.aborted) return error(499, "the client closed the request");
    if (err instanceof APIError) {
      log.error(`Jev returned ${err.status}${err.requestId ? ` (request ${err.requestId})` : ""}: ${err.message}`);
      return error(err.status === 429 ? 429 : 502, `Jev returned ${err.status}: ${err.message}`);
    }
    log.error("judging failed:", err);
    return error(500, err instanceof Error ? err.message : String(err));
  }
}

function json(status: number, payload: WallResponse | WallErrorResponse, cacheControl: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, ...headers },
  });
}

function error(status: number, reason: string, headers?: Record<string, string>): Response {
  return json(status, { error: reason }, CACHE_NONE, headers);
}
