// One wall update: every persona judged against one message. Personas are split
// into batches of BATCH_SIZE, each batch is one Jev call, and the calls run in
// parallel.

import type { RequestOptions, SystemOneResult } from "@typesafe-ai/sdk";
import { PERSONAS } from "./personas.ts";
import { buildQuestions, buildState, readAnswers, type BatchQuestions, type BatchState, type FaceAnswer } from "./questions.ts";
import type { WallResponse } from "./types.ts";

// Measured 2026-09-17 (log/2026-09-17.md); ten chosen 2026-09-18 (log/2026-09-18.md).
export const BATCH_SIZE = 10;

// The slice of the SDK client this module needs. The real TypeSafeClient
// satisfies it; tests pass a fixture-backed fake.
export interface JevClient {
  systemOne(
    request: { state: BatchState; questions: BatchQuestions },
    options?: RequestOptions,
  ): Promise<SystemOneResult<BatchQuestions>>;
}

export interface JudgeOptions {
  batchSize?: number;
  signal?: AbortSignal;
}

export function batchesOf<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`batch size must be a positive integer, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function judgeWall(message: string, client: JevClient, options: JudgeOptions = {}): Promise<WallResponse> {
  const batches = batchesOf(PERSONAS, options.batchSize ?? BATCH_SIZE);
  // One failed batch fails the update, so the others are cancelled rather than finished for nobody.
  const failed = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, failed.signal]) : failed.signal;
  const started = performance.now();
  let results: SystemOneResult<BatchQuestions>[];
  try {
    results = await Promise.all(
      batches.map((batch) => client.systemOne({ state: buildState(message, batch), questions: buildQuestions(batch.length) }, { signal })),
    );
  } catch (err) {
    failed.abort(err);
    throw err;
  }
  const latencyMs = Math.round(performance.now() - started);
  const faces: FaceAnswer[] = [];
  let inputTokens = 0;
  let model = "";
  results.forEach((result, b) => {
    faces.push(...readAnswers(result.answers, batches[b]!.length));
    inputTokens += result.usage.input_tokens;
    model = result.model;
  });
  return { faces, latencyMs, inputTokens, calls: batches.length, model };
}
