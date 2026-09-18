// Wire contract between the server (`GET /api/react?m=<message>`) and the
// browser. Both sides import this file, and the contract test in test/ drives
// the real `fetchWall` against the handler with a fake Jev.

import type { FaceAnswer } from "./questions.ts";

// The query parameter carrying the message, on the API and on the page URL.
export const MESSAGE_PARAM = "m";

// Longest message accepted, counted in code points. The message travels in
// the URL so the CDN can cache the answer per message; 2,000 code points keeps
// a typical post well inside URL limits and Jev's context.
export const MAX_MESSAGE_CHARS = 2_000;

export interface WallResponse {
  // One entry per persona, in PERSONAS order.
  faces: FaceAnswer[];
  // Wall-clock time from the first Jev request leaving to the last answer arriving.
  latencyMs: number;
  // Summed over every Jev call in this update.
  inputTokens: number;
  calls: number;
  model: string;
}

export interface WallErrorResponse {
  error: string;
}
