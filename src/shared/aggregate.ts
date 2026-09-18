// Wall-level numbers computed in code from the per-face answers. Jev cannot
// count, so nothing here is asked of the model.

import type { FaceAnswer } from "./questions.ts";
import { REACTIONS, type ReactionDistribution } from "./reactions.ts";

// A noul above this is read as a yes when counting people.
export const YES = 0.5;

export interface WallAggregate {
  // Mean of the per-face reaction distributions; sums to 1.
  reaction: ReactionDistribution;
  // Faces whose noul for each question is above YES.
  understands: number;
  trusts: number;
  shares: number;
  total: number;
}

export function aggregateWall(faces: readonly FaceAnswer[]): WallAggregate {
  const reaction = Object.fromEntries(REACTIONS.map((r) => [r, 0])) as ReactionDistribution;
  let understands = 0;
  let trusts = 0;
  let shares = 0;
  for (const face of faces) {
    for (const r of REACTIONS) reaction[r] += face.reaction[r];
    if (face.understands > YES) understands++;
    if (face.trusts > YES) trusts++;
    if (face.shares > YES) shares++;
  }
  if (faces.length > 0) for (const r of REACTIONS) reaction[r] /= faces.length;
  return { reaction, understands, trusts, shares, total: faces.length };
}
