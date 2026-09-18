// The browser's side of the /api/react contract and of the recorded presets.
// Kept free of DOM access so the contract test runs it in Node against the
// handler.

import { messageQuery, type WallErrorResponse, type WallResponse } from "../shared/types.ts";

// A response that was not a wall: the HTTP status and the server's reason.
export class WallRequestError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "WallRequestError";
    this.status = status;
  }
}

// A GET with the message in the query, so the CDN answers a repeated message
// without a Jev call.
export function wallUrl(message: string, baseUrl = ""): string {
  return `${baseUrl}/api/react?${messageQuery(message)}`;
}

// The page URL carries the message too; sent as the Referer it would double
// the request's size, and the local Node server refuses headers over 16 KB.
const NO_REFERRER: RequestInit = { referrerPolicy: "no-referrer" };

export async function fetchWall(message: string, signal: AbortSignal, baseUrl = ""): Promise<WallResponse> {
  return readWall(await fetch(wallUrl(message, baseUrl), { ...NO_REFERRER, signal }));
}

// A preset's recorded wall, built into the site from the recording.
export async function fetchPreset(id: string, signal: AbortSignal): Promise<WallResponse> {
  return readWall(await fetch(`/presets/${id}.json`, { ...NO_REFERRER, signal }));
}

// The wall, or the reason the server gave. A 429 from the platform's rate
// limit arrives without a JSON body, so the status alone must be enough.
async function readWall(res: Response): Promise<WallResponse> {
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  const failed = typeof payload === "object" && payload !== null && "error" in payload ? (payload as WallErrorResponse) : null;
  if (!res.ok || failed || payload === null) throw new WallRequestError(res.status, failed ? failed.error : `HTTP ${res.status}`);
  return payload as WallResponse;
}
