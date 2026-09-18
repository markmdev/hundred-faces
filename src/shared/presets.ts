// Preset messages for the demo moment. They come in contrasting pairs so the
// wall visibly changes between them; the fixture in test/fixtures records
// Jev's answers for exactly these strings.

export interface Preset {
  id: string;
  label: string;
  message: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "price-blunt",
    label: "Price increase, blunt",
    message:
      "Effective next month, your subscription price is going up from $9.99 to $14.99. This change is automatic. No action is needed.",
  },
  {
    id: "price-gentle",
    label: "Price increase, gentle",
    message:
      "We're changing our pricing on October 15: your plan will move from $9.99 to $14.99 a month. We know a price change is never welcome, so here is what you get for it: offline mode, family sharing for up to five people, and priority support. If the new price doesn't work for you, cancel any time before October 15 and we'll refund this month in full.",
  },
  {
    id: "blurb-jargon",
    label: "Product blurb, jargon",
    message:
      "Introducing SynergyMesh: a cloud-native, AI-augmented orchestration fabric that leverages composable microservices to hyperscale your omnichannel value streams with zero-trust observability.",
  },
  {
    id: "blurb-plain",
    label: "Product blurb, plain",
    message:
      "SynergyMesh is a tool that helps the apps your company uses talk to each other. It runs online, watches for problems, and tells you when something breaks. You pay per app you connect.",
  },
  {
    id: "clickbait",
    label: "Clickbait headline",
    message:
      "Doctors HATE this one weird trick: you won't BELIEVE what happens when you stop drinking coffee for 7 days! (Number 4 will shock you)",
  },
];
