// One wall update: every persona judged against one message. Personas are split
// into batches of BATCH_SIZE, each batch is one Jev call, and the calls run in
// parallel.

import type { Questions } from "@typesafe-ai/sdk";
import { PERSONAS, type Persona } from "./personas.ts";
import { asSdkQuestions, buildQuestions, buildState, readAnswers, type BatchState, type FaceAnswer, type RawAnswers } from "./questions.ts";
import type { WallResponse } from "./types.ts";

// Measured 2026-09-17 (log/2026-09-17.md): answers drift from the
// one-persona-per-call baseline as the batch grows, because the other
// personas in the state are irrelevant to each question. Five keeps the drift
// flat across positions and the wall as varied as the baseline, at the same
// latency as ten (~420 ms p50) for twice the requests; one hundred in one
// call exceeds Jev's 64k-token context.
export const BATCH_SIZE = 5;

// The slice of the SDK client this module needs. The real TypeSafeClient
// satisfies it; tests pass a fixture-backed fake.
export interface JevClient {
  systemOne(
    request: { state: BatchState; questions: Questions },
    options?: { signal?: AbortSignal },
  ): Promise<JevResult>;
}

export interface JevResult {
  model: string;
  answers: RawAnswers;
  usage: { input_tokens: number; output_tokens: number };
}

export interface JudgeOptions {
  batchSize?: number;
  personas?: readonly Persona[];
  signal?: AbortSignal;
}

export function batchesOf<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error(`batch size must be a positive integer, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function judgeWall(message: string, client: JevClient, options: JudgeOptions = {}): Promise<WallResponse> {
  const personas = options.personas ?? PERSONAS;
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const batches = batchesOf(personas, batchSize);
  const started = performance.now();
  const results = await Promise.all(
    batches.map((batch) => {
      const request = { state: buildState(message, batch), questions: asSdkQuestions(buildQuestions(batch.length)) };
      return options.signal ? client.systemOne(request, { signal: options.signal }) : client.systemOne(request);
    }),
  );
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
