// Wall-level numbers computed in code from the per-face answers. Jev cannot
// count, so nothing here is asked of the model.

import { NOULS, type FaceAnswer, type NoulId } from "./questions.ts";
import { emptyDistribution, REACTIONS, type ReactionDistribution } from "./reactions.ts";

// A noul above this is read as a yes when counting people.
export const YES = 0.5;

// The mean of the per-face reaction distributions, normalised to sum to 1, and
// for each noul the number of faces whose probability is above YES.
export type WallAggregate = { reaction: ReactionDistribution; total: number } & { [K in NoulId]: number };

export function aggregateWall(faces: readonly FaceAnswer[]): WallAggregate {
  const reaction = emptyDistribution();
  const counts = Object.fromEntries(NOULS.map(({ id }) => [id, 0])) as Record<NoulId, number>;
  for (const face of faces) {
    for (const r of REACTIONS) reaction[r] += face.reaction[r];
    for (const { id } of NOULS) if (face[id] > YES) counts[id]++;
  }
  // Divided by the total mass rather than the face count, as blendFace does,
  // so per-face rounding cannot leave the mean short of 1.
  let mass = 0;
  for (const r of REACTIONS) mass += reaction[r];
  if (mass > 0) for (const r of REACTIONS) reaction[r] /= mass;
  return { reaction, total: faces.length, ...counts };
}
