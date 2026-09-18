// Preset messages for the demo moment. They come in contrasting pairs so the
// wall visibly changes between them; the recording in recordings/ holds
// Jev's answers for exactly these strings, and the page serves those
// recordings from public/presets instead of calling Jev.

export interface Preset {
  id: string;
  label: string;
  message: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "launch-hype",
    label: "Launch, hype",
    message: "🚀 WE'RE LIVE. 18 months of grind and Clearpath is finally here. This changes everything for how teams ship. Link in bio 👇",
  },
  {
    id: "launch-plain",
    label: "Launch, plain",
    message:
      "Clearpath is out today. It's a checklist that lives inside your pull requests, so nothing ships half-done. Free for teams under ten. Here's what it looks like:",
  },
  {
    id: "dm-salesy",
    label: "Cold DM, salesy",
    message: "Hey! Love what you're building. I run a growth agency and we've helped 40+ startups 3x their pipeline. Got 15 min this week?",
  },
  {
    id: "dm-human",
    label: "Cold DM, human",
    message:
      "Hi Priya, your post on incident reviews changed how we run ours. If you're ever up for it, I'd love 15 minutes to hear how you got the team to actually read them. No pitch.",
  },
  {
    id: "hot-take",
    label: "Hot take",
    message: "Unpopular opinion: standups are a waste of time and everyone knows it. Cancel them for a month and see what happens.",
  },
  {
    id: "apology",
    label: "Apology",
    message:
      "We messed up. Yesterday's outage took your dashboards down for four hours because we shipped a change without testing it properly. Here's exactly what happened and what we're changing so it doesn't happen again.",
  },
];
