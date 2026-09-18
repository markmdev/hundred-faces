// The seven reactions a face can show, the contrastive descriptions Jev judges
// against, and the face parameters each pure reaction draws with. A face on the
// wall is the probability-weighted blend of these parameter sets.

export const REACTIONS = [
  "delighted",
  "interested",
  "neutral",
  "confused",
  "bored",
  "annoyed",
  "offended",
] as const;

export type Reaction = (typeof REACTIONS)[number];

export type ReactionDistribution = Record<Reaction, number>;

// Each description says what the option covers and what belongs to its
// neighbour instead, because Jev reads literally and confuses adjacent options
// when the boundary is left implicit.
export const REACTION_CRITERIA: Record<Reaction, string> = {
  delighted: "Pleased: good news for them, or it matches what they like. Not merely curious (interested).",
  interested: "Curious, wants to know more, but not yet pleased (delighted) and not indifferent (neutral).",
  neutral: "No particular feeling; reads it and moves on. Not curious (interested), not dismissive (bored), not irritated (annoyed).",
  confused: "Cannot follow what it means or why they are being told; the wording or language loses them. Not bored: they tried.",
  bored: "Understands it but does not care; dull or irrelevant to them. Not confused, not irritated.",
  annoyed: "Irritated by the tone, the demands, the hype, or bad news for them, but not personally insulted (offended).",
  offended: "Feels personally insulted, disrespected, or talked down to. Stronger and more personal than annoyed.",
};

// Drawing parameters for one face. Every value is linear so blending by
// probability is a weighted sum.
export interface FaceParams {
  // -1 full frown .. +1 full smile
  mouthCurve: number;
  // 0 closed .. 1 wide open
  mouthOpen: number;
  // 0 symmetric .. 1 one corner pulled up (the confused twist)
  mouthSkew: number;
  // 0 resting .. 1 raised high (surprise, interest)
  browRaise: number;
  // -1 inner ends up (worried) .. +1 inner ends down (angry)
  browInner: number;
  // 0 symmetric .. 1 one brow up, one down (confused)
  browSkew: number;
  // 0 shut .. 1 wide open (0.9 is a relaxed eye)
  eyeOpen: number;
  // sRGB 0..255 face tint
  tint: readonly [number, number, number];
}

export const REACTION_FACES: Record<Reaction, FaceParams> = {
  delighted: {
    mouthCurve: 1.0,
    mouthOpen: 0.55,
    mouthSkew: 0,
    browRaise: 0.5,
    browInner: -0.1,
    browSkew: 0,
    eyeOpen: 0.7,
    tint: [255, 214, 102],
  },
  interested: {
    mouthCurve: 0.35,
    mouthOpen: 0.15,
    mouthSkew: 0,
    browRaise: 1.0,
    browInner: 0,
    browSkew: 0,
    eyeOpen: 1.15,
    tint: [150, 225, 180],
  },
  neutral: {
    mouthCurve: 0.05,
    mouthOpen: 0,
    mouthSkew: 0,
    browRaise: 0.2,
    browInner: 0,
    browSkew: 0,
    eyeOpen: 0.9,
    tint: [218, 216, 208],
  },
  confused: {
    mouthCurve: -0.2,
    mouthOpen: 0.15,
    mouthSkew: 1.0,
    browRaise: 0.4,
    browInner: 0.1,
    browSkew: 1.0,
    eyeOpen: 0.95,
    tint: [200, 180, 235],
  },
  bored: {
    mouthCurve: -0.15,
    mouthOpen: 0,
    mouthSkew: 0,
    browRaise: 0,
    browInner: 0,
    browSkew: 0,
    eyeOpen: 0.4,
    tint: [172, 184, 196],
  },
  annoyed: {
    mouthCurve: -0.55,
    mouthOpen: 0,
    mouthSkew: 0.25,
    browRaise: 0,
    browInner: 0.7,
    browSkew: 0,
    eyeOpen: 0.6,
    tint: [255, 168, 105],
  },
  offended: {
    mouthCurve: -0.9,
    mouthOpen: 0.45,
    mouthSkew: 0,
    browRaise: 0.3,
    browInner: 1.0,
    browSkew: 0,
    eyeOpen: 1.1,
    tint: [242, 112, 112],
  },
};
