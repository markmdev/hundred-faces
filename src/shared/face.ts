// Turns a reaction distribution into drawing parameters and SVG geometry. Pure
// functions of numbers and strings, so the browser draws with them and the
// tests check them without a DOM. The face lives in a 64x64 viewBox.

import { REACTION_FACES, REACTIONS, type FaceParams, type ReactionDistribution } from "./reactions.ts";

export const FACE_SIZE = 64;

// Weighted sum of every pure-reaction parameter set. Probabilities from Jev
// sum to 1; the weights are renormalised anyway so a slightly-off sum from
// rounding cannot brighten or dim a face.
export function blendFace(distribution: ReactionDistribution): FaceParams {
  let total = 0;
  for (const name of REACTIONS) total += distribution[name];
  if (!(total > 0)) throw new Error("reaction distribution has no mass");
  const out = { mouthCurve: 0, mouthOpen: 0, mouthSkew: 0, browRaise: 0, browInner: 0, browSkew: 0, eyeOpen: 0, tint: [0, 0, 0] as [number, number, number] };
  for (const name of REACTIONS) {
    const w = distribution[name] / total;
    if (w === 0) continue;
    const p = REACTION_FACES[name];
    out.mouthCurve += w * p.mouthCurve;
    out.mouthOpen += w * p.mouthOpen;
    out.mouthSkew += w * p.mouthSkew;
    out.browRaise += w * p.browRaise;
    out.browInner += w * p.browInner;
    out.browSkew += w * p.browSkew;
    out.eyeOpen += w * p.eyeOpen;
    out.tint[0] += w * p.tint[0];
    out.tint[1] += w * p.tint[1];
    out.tint[2] += w * p.tint[2];
  }
  return out;
}

// Linear interpolation between two parameter sets, for animating a face from
// its last answer to the new one; t is expected in [0, 1].
export function lerpFace(from: FaceParams, to: FaceParams, t: number): FaceParams {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    mouthCurve: mix(from.mouthCurve, to.mouthCurve),
    mouthOpen: mix(from.mouthOpen, to.mouthOpen),
    mouthSkew: mix(from.mouthSkew, to.mouthSkew),
    browRaise: mix(from.browRaise, to.browRaise),
    browInner: mix(from.browInner, to.browInner),
    browSkew: mix(from.browSkew, to.browSkew),
    eyeOpen: mix(from.eyeOpen, to.eyeOpen),
    tint: [mix(from.tint[0], to.tint[0]), mix(from.tint[1], to.tint[1]), mix(from.tint[2], to.tint[2])],
  };
}

export interface FaceGeometry {
  fill: string;
  mouthPath: string;
  leftBrowPath: string;
  rightBrowPath: string;
  leftEye: { cx: number; cy: number; rx: number; ry: number };
  rightEye: { cx: number; cy: number; rx: number; ry: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function rgbCss(tint: readonly [number, number, number]): string {
  return `rgb(${Math.round(tint[0])}, ${Math.round(tint[1])}, ${Math.round(tint[2])})`;
}

export function faceGeometry(p: FaceParams): FaceGeometry {
  const fill = rgbCss(p.tint);

  // Eyes: horizontal radius fixed, vertical radius follows openness.
  const eyeY = 27;
  const eyeRx = 3.6;
  const eyeRy = Math.max(0.6, 3.6 * p.eyeOpen);
  const leftEye = { cx: 22, cy: eyeY, rx: eyeRx, ry: r1(eyeRy) };
  const rightEye = { cx: 42, cy: eyeY, rx: eyeRx, ry: r1(eyeRy) };

  // Brows: a line per eye. browRaise lifts both; browInner tilts the inner
  // ends down (angry) or up (worried); browSkew lifts the left and drops the
  // right, the confused look.
  const browBase = 19 - 4 * p.browRaise;
  const tilt = 3.5 * p.browInner;
  const skew = 3 * p.browSkew;
  const leftOuterY = browBase - tilt - skew;
  const leftInnerY = browBase + tilt - skew;
  const rightInnerY = browBase + tilt + skew;
  const rightOuterY = browBase - tilt + skew;
  const leftBrowPath = `M15 ${r1(leftOuterY)} L28 ${r1(leftInnerY)}`;
  const rightBrowPath = `M36 ${r1(rightInnerY)} L49 ${r1(rightOuterY)}`;

  // Mouth: a closed shape between an upper and a lower curve. mouthCurve bends
  // both (positive = smile, so the control point sits lower on screen);
  // mouthOpen separates them; mouthSkew lifts the right corner.
  const mouthY = 45;
  const halfWidth = 10 + 2 * Math.abs(p.mouthCurve);
  const leftX = 32 - halfWidth;
  const rightX = 32 + halfWidth;
  const leftY = mouthY;
  const rightY = mouthY - 4 * p.mouthSkew;
  const bend = 11 * p.mouthCurve;
  const gap = 8 * p.mouthOpen;
  const upperControlY = mouthY + bend - gap / 2;
  const lowerControlY = mouthY + bend + gap / 2;
  const mouthPath =
    `M${r1(leftX)} ${r1(leftY)} Q32 ${r1(upperControlY)} ${r1(rightX)} ${r1(rightY)} ` +
    `Q32 ${r1(lowerControlY)} ${r1(leftX)} ${r1(leftY)} Z`;

  return { fill, mouthPath, leftBrowPath, rightBrowPath, leftEye, rightEye };
}
