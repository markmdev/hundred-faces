// Wire contract between the server (`POST /api/react`) and the browser. Both
// sides import this file, and the contract test in test/ checks a recorded
// server response parses through the client's reader.

import type { FaceAnswer } from "./questions.ts";

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
