// The local server's bridge from Node's http module to a Web-standard
// handler: IncomingMessage becomes a Request, the Response is written back,
// and a connection closed before the answer aborts the request, which is what
// cancels the Jev calls. Vercel does the same for the deployed function.

import { createServer, type IncomingMessage, type Server } from "node:http";

export type Handler = (request: Request) => Promise<Response>;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function createNodeServer(handler: Handler): Server {
  return createServer(async (req, res) => {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    let request: Request;
    try {
      request = toRequest(req, controller.signal);
    } catch (err) {
      // A Host header that makes no URL is the client's mistake, not a failure here.
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: `bad request: ${reason(err)}` }));
      return;
    }
    try {
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error(`${req.method} ${new URL(request.url).pathname} failed:`, err);
      // Once headers are out a JSON body would be appended to whatever was sent;
      // dropping the connection is the only honest answer left.
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: reason(err) }));
    }
  });
}

function toRequest(req: IncomingMessage, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const each of value) headers.append(name, each);
    else if (value !== undefined) headers.set(name, value);
  }
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return new Request(url, { method: req.method ?? "GET", headers, signal });
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));
