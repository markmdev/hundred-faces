// The browser's side of the /api/react contract. Kept free of DOM access so
// the contract test runs it in Node against the server.

import type { WallErrorResponse, WallRequest, WallResponse } from "../shared/types.ts";

export async function fetchWall(message: string, expectedFaces: number, baseUrl = ""): Promise<WallResponse> {
  const body: WallRequest = { message };
  const res = await fetch(`${baseUrl}/api/react`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as WallResponse | WallErrorResponse;
  if (!res.ok || "error" in payload) {
    const detail = "error" in payload ? payload.error : `HTTP ${res.status}`;
    throw new Error(res.status === 429 ? `Jev is rate-limiting us; keep typing and it will catch up (${detail})` : detail);
  }
  if (!Array.isArray(payload.faces) || payload.faces.length !== expectedFaces) {
    throw new Error(`server returned ${Array.isArray(payload.faces) ? payload.faces.length : "no"} faces, expected ${expectedFaces}`);
  }
  return payload;
}
