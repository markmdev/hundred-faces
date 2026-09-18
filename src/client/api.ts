// The browser's side of the /api/react contract. Kept free of DOM access so
// the contract test runs it in Node against the server.

import type { WallErrorResponse, WallRequest, WallResponse } from "../shared/types.ts";

// A response that was not a wall: the HTTP status and the server's reason.
export class WallRequestError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "WallRequestError";
    this.status = status;
  }
}

export async function fetchWall(message: string, signal: AbortSignal, baseUrl = ""): Promise<WallResponse> {
  const body: WallRequest = { message };
  const res = await fetch(`${baseUrl}/api/react`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await res.json()) as WallResponse | WallErrorResponse;
  if (!res.ok || "error" in payload) {
    throw new WallRequestError(res.status, "error" in payload ? payload.error : `HTTP ${res.status}`);
  }
  return payload;
}
