// Wire contract between the server (`POST /api/react`) and the browser. Both
// sides import this file, and the contract test in test/ drives the real
// `fetchWall` against the server with a fake Jev.

import type { FaceAnswer } from "./questions.ts";

// Longest message accepted, counted in code points. Jev's context is 64k
// tokens in total, of which the state plus the longest question may take 32k;
// a batch of five personas with a 4,000-character message stays far inside both.
export const MAX_MESSAGE_CHARS = 4_000;

export interface WallRequest {
  message: string;
}

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
