import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blendFace, faceGeometry, lerpFace } from "../src/shared/face.ts";
import { REACTION_FACES, REACTIONS, type ReactionDistribution } from "../src/shared/reactions.ts";

const distribution = (weights: Partial<ReactionDistribution>): ReactionDistribution =>
  Object.fromEntries(REACTIONS.map((r) => [r, weights[r] ?? 0])) as ReactionDistribution;

const close = (a: number, b: number, message?: string) => assert.ok(Math.abs(a - b) < 1e-9, message ?? `${a} != ${b}`);

describe("blendFace", () => {
  it("reproduces a pure reaction exactly", () => {
    for (const name of REACTIONS) {
      const params = blendFace(distribution({ [name]: 1 }));
      assert.deepEqual(params, { ...REACTION_FACES[name], tint: [...REACTION_FACES[name].tint] });
    }
  });

  it("weights every parameter by probability", () => {
    const params = blendFace(distribution({ confused: 0.6, annoyed: 0.4 }));
    const c = REACTION_FACES.confused;
    const a = REACTION_FACES.annoyed;
    close(params.mouthCurve, 0.6 * c.mouthCurve + 0.4 * a.mouthCurve);
    close(params.browInner, 0.6 * c.browInner + 0.4 * a.browInner);
    close(params.browSkew, 0.6 * c.browSkew + 0.4 * a.browSkew);
    close(params.eyeOpen, 0.6 * c.eyeOpen + 0.4 * a.eyeOpen);
    close(params.tint[0], 0.6 * c.tint[0] + 0.4 * a.tint[0]);
    close(params.tint[2], 0.6 * c.tint[2] + 0.4 * a.tint[2]);
  });

  it("renormalises a distribution whose rounding leaves it short of 1", () => {
    const exact = blendFace(distribution({ delighted: 0.5, bored: 0.5 }));
    const short = blendFace(distribution({ delighted: 0.49, bored: 0.49 }));
    close(exact.mouthCurve, short.mouthCurve);
    close(exact.tint[1], short.tint[1]);
  });

  it("refuses a distribution with no mass", () => {
    assert.throws(() => blendFace(distribution({})), /no mass/);
  });
});

describe("lerpFace", () => {
  it("returns the endpoints at 0 and 1 and clamps outside", () => {
    const from = REACTION_FACES.neutral;
    const to = REACTION_FACES.offended;
    assert.deepEqual(lerpFace(from, to, 0), { ...from, tint: [...from.tint] });
    assert.deepEqual(lerpFace(from, to, 1), { ...to, tint: [...to.tint] });
    assert.deepEqual(lerpFace(from, to, 7), { ...to, tint: [...to.tint] });
    close(lerpFace(from, to, 0.5).mouthCurve, (from.mouthCurve + to.mouthCurve) / 2);
  });
});

describe("faceGeometry", () => {
  const controlY = (mouthPath: string) => Number(mouthPath.match(/Q32 ([-\d.]+)/)![1]);

  it("bends the mouth down on screen for a smile and up for a frown", () => {
    const smile = faceGeometry(REACTION_FACES.delighted);
    const frown = faceGeometry(REACTION_FACES.offended);
    const flat = faceGeometry({ ...REACTION_FACES.neutral, mouthCurve: 0 });
    assert.ok(controlY(smile.mouthPath) > controlY(flat.mouthPath), "smile control point below the mouth line");
    assert.ok(controlY(frown.mouthPath) < controlY(flat.mouthPath), "frown control point above the mouth line");
  });

  it("closes the eyes as openness falls and tilts the brows inward when angry", () => {
    const open = faceGeometry(REACTION_FACES.interested);
    const half = faceGeometry(REACTION_FACES.bored);
    assert.ok(open.leftEye.ry > half.leftEye.ry);
    const angry = faceGeometry(REACTION_FACES.offended);
    const [, outerY, innerY] = angry.leftBrowPath.match(/M15 ([-\d.]+) L28 ([-\d.]+)/)!.map(Number);
    assert.ok(innerY! > outerY!, "inner end of the brow sits lower than the outer end");
  });

  it("emits an rgb() fill from the blended tint", () => {
    assert.equal(faceGeometry(REACTION_FACES.delighted).fill, "rgb(255, 214, 102)");
    assert.equal(faceGeometry(blendFace(distribution({ delighted: 0.5, offended: 0.5 }))).fill, "rgb(249, 163, 107)");
  });
});
