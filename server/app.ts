// The HTTP app: /api/react judges a message against every persona through
// the Jev client it is given, and when a dist directory is given the built
// front end is served from it. main.ts wires in the real TypeSafe client; the
// contract test wires in a fake.

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { APIError } from "@typesafe-ai/sdk";
import { MAX_MESSAGE_CHARS, type WallErrorResponse, type WallRequest, type WallResponse } from "../src/shared/types.ts";
import { judgeWall, type JevClient } from "../src/shared/wall.ts";

const MAX_BODY_BYTES = 64 * 1024;

export interface Log {
  error(...args: unknown[]): void;
}

export interface AppOptions {
  client: JevClient;
  // Directory of built static files to serve, or null for API only.
  distDir: string | null;
  log?: Log;
}

export function createApp({ client, distDir, log = console }: AppOptions): Server {
  const root = distDir === null ? null : resolve(distDir);
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "POST" && url.pathname === "/api/react") return await handleReact(req, res, client, log);
      if (root && req.method === "GET") return serveStatic(root, url.pathname, res);
      sendJson(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
    } catch (err) {
      log.error(`${req.method} ${url.pathname} failed:`, err);
      if (!res.headersSent) sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      else res.end();
    }
  });
}

async function handleReact(req: IncomingMessage, res: ServerResponse, client: JevClient, log: Log): Promise<void> {
  const declared = Number(req.headers["content-length"]);
  if (declared > MAX_BODY_BYTES) return sendJson(res, 413, { error: `request body is ${declared} bytes; the limit is ${MAX_BODY_BYTES}` });
  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    if (!(err instanceof BodyTooLarge)) throw err;
    return sendJson(res, 413, { error: err.message });
  }
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
  const length = Array.from(message).length;
  if (length > MAX_MESSAGE_CHARS) {
    return sendJson(res, 413, { error: `message is ${length} characters; the limit is ${MAX_MESSAGE_CHARS} characters` });
  }

  // The browser drops the connection when the box is cleared or the tab
  // closes; cancel the Jev calls then instead of finishing work nobody reads.
  // A request superseded by newer typing is left to finish.
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
      log.error(`Jev returned ${err.status}${err.requestId ? ` (request ${err.requestId})` : ""}: ${err.message}`);
      return sendJson(res, err.status === 429 ? 429 : 502, { error: `Jev returned ${err.status}: ${err.message}` });
    }
    throw err;
  }
}

class BodyTooLarge extends Error {
  constructor() {
    super(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    this.name = "BodyTooLarge";
  }
}

// Backstop for a body sent without a content-length: the promise rejects as
// soon as the cap is passed and the rest of the body is drained, so the
// client is answered rather than reset.
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      if (size > MAX_BODY_BYTES) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0;
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: WallResponse | WallErrorResponse): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

// What Vite emits here, plus source maps.
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// Files are served as themselves; a path with no extension is a page route
// and gets index.html. A missing file (a stale asset hash, say) is a 404, not
// the page.
function serveStatic(root: string, pathname: string, res: ServerResponse): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: `malformed percent-encoding in ${pathname}` });
  }
  let file = resolve(join(root, decoded));
  if (relative(root, file).startsWith("..")) return sendJson(res, 403, { error: "forbidden" });
  const isFile = existsSync(file) && !statSync(file).isDirectory();
  if (!isFile) {
    if (extname(decoded) !== "") return sendJson(res, 404, { error: `no file at ${pathname}` });
    file = join(root, "index.html");
    if (!existsSync(file)) return sendJson(res, 404, { error: `${root} has no index.html; run npm run build first` });
  }
  const type = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  res.end(readFileSync(file));
}
