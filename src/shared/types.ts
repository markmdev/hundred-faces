// Wire contract between the server (`GET /api/react?m=<message>`) and the
// browser. Both sides import this file, and the contract test in test/ drives
// the real `fetchWall` against the handler with a fake Jev.

import type { FaceAnswer } from "./questions.ts";

// The query parameter carrying the message, on the API and on the page URL.
export const MESSAGE_PARAM = "m";

// Longest message accepted, counted in code points; 2,000 keeps a typical post
// well inside Jev's context.
export const MAX_MESSAGE_CHARS = 2_000;
// Longest message accepted on the wire, as the length of the `m=` query it
// makes (see messageQuery). The message travels in the URL so the CDN can
// cache the answer per message, and Vercel's CDN answers 414 to a URL over
// 14 KB before the function runs (vercel.com/docs/errors/URL_TOO_LONG);
// 13,000 leaves room for the host, the path, and the tracking parameters a
// shared link tends to pick up.
export const MAX_MESSAGE_URL_BYTES = 13_000;

// The query that carries a message, exactly as the API request and the page
// URL send it (URLSearchParams escapes more than encodeURIComponent, so the
// limit measures this and nothing else).
export function messageQuery(message: string): string {
  return new URLSearchParams({ [MESSAGE_PARAM]: message }).toString();
}

// Why a message cannot be judged, in the visitor's words, or null when it fits
// both bounds. The browser runs it before sending and the server before
// judging, so both sides refuse the same messages with the same reason.
export function messageTooLong(message: string): string | null {
  const length = Array.from(message).length;
  if (length > MAX_MESSAGE_CHARS) return `This message is ${length} characters; the limit is ${MAX_MESSAGE_CHARS} characters.`;
  const bytes = messageQuery(message).length;
  if (bytes > MAX_MESSAGE_URL_BYTES) {
    return `This message is ${bytes} bytes once encoded for the link; the limit is ${MAX_MESSAGE_URL_BYTES} bytes (emoji and non-Latin text take more).`;
  }
  return null;
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
