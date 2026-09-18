// The HTTP app: /api/react judges a message against every persona through
// the Jev client it is given, /api/health reports configuration, and when a
// dist directory is given the built front end is served from it. main.ts
// wires in the real TypeSafe client; the contract test wires in a fake.

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { APIError } from "@typesafe-ai/sdk";
import type { WallErrorResponse, WallRequest, WallResponse } from "../src/shared/types.ts";
import { BATCH_SIZE, judgeWall, type JevClient } from "../src/shared/wall.ts";

// Message length bound. A batch of personas with a short message is a few
// thousand tokens; Jev allows 32k for state plus the longest question, so
// 4,000 characters (~1k tokens) leaves a wide margin, and the demo is for
// messages people would actually type in a box.
export const MAX_MESSAGE_CHARS = 4_000;
const MAX_BODY_BYTES = 64 * 1024;

export interface AppOptions {
  client: JevClient & { defaultModel?: string };
  // Directory of built static files to serve, or null for API only.
  distDir: string | null;
}

export function createApp({ client, distDir }: AppOptions): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "POST" && url.pathname === "/api/react") return await handleReact(req, res, client);
      if (req.method === "GET" && url.pathname === "/api/health") {
        return sendJson(res, 200, { ok: true, model: client.defaultModel ?? null, batchSize: BATCH_SIZE });
      }
      if (distDir && req.method === "GET") return serveStatic(distDir, url.pathname, res);
      sendJson(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
    } catch (err) {
      console.error(`${req.method} ${url.pathname} failed:`, err);
      if (!res.headersSent) sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      else res.end();
    }
  });
}

async function handleReact(req: IncomingMessage, res: ServerResponse, client: JevClient): Promise<void> {
  const body = await readBody(req);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { error: "body is not JSON" });
  }
  const message = (parsed as Partial<WallRequest> | null)?.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return sendJson(res, 400, { error: "message must be a non-empty string" });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return sendJson(res, 413, { error: `message is ${message.length} characters; the limit is ${MAX_MESSAGE_CHARS}` });
  }

  // A browser that moved on (newer keystroke won, tab closed) closes the
  // connection; cancel the Jev calls instead of finishing work nobody reads.
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  try {
    const wall: WallResponse = await judgeWall(message, client, { signal: abort.signal });
    sendJson(res, 200, wall);
  } catch (err) {
    if (abort.signal.aborted) return;
    if (err instanceof APIError) {
      console.error(`Jev returned ${err.status}${err.requestId ? ` (request ${err.requestId})` : ""}: ${err.message}`);
      return sendJson(res, err.status === 429 ? 429 : 502, { error: `Jev returned ${err.status}: ${err.message}` });
    }
    throw err;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: WallResponse | WallErrorResponse | Record<string, unknown>): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

// Files are served as themselves; a path with no extension is a page route
// and gets index.html. A missing file (a stale asset hash, say) is a 404, not
// the page.
function serveStatic(distDir: string, pathname: string, res: ServerResponse): void {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(distDir, relative);
  if (!file.startsWith(distDir)) return sendJson(res, 403, { error: "forbidden" });
  const isFile = existsSync(file) && !statSync(file).isDirectory();
  if (!isFile) {
    if (extname(relative) !== "") return sendJson(res, 404, { error: `no file at ${pathname}` });
    file = join(distDir, "index.html");
    if (!existsSync(file)) return sendJson(res, 404, { error: `${distDir} has no index.html; run npm run build first` });
  }
  const type = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(file));
}
