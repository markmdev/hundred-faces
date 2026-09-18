// The few statistics the measurement scripts share. mean and percentile of an
// empty list are NaN, which the reports print as "-".

import type { FaceAnswer } from "../src/shared/questions.ts";
import { REACTIONS } from "../src/shared/reactions.ts";

// Total-variation distance between two reaction distributions: 0 identical, 1 disjoint.
export const tv = (a: FaceAnswer, b: FaceAnswer): number =>
  0.5 * REACTIONS.reduce((sum, r) => sum + Math.abs(a.reaction[r] - b.reaction[r]), 0);

export const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : Number.NaN);

export const percentile = (xs: readonly number[], p: number): number => {
  if (xs.length === 0) return Number.NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};
