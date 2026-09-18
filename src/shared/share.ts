// The share loop's text: one line about the wall a message got, with the link
// back to the wall. Pure, so the test pins the wording.

import { aggregateWall } from "./aggregate.ts";
import type { FaceAnswer } from "./questions.ts";
import { percentages, topReaction, type Reaction } from "./reactions.ts";

export interface ShareResult {
  // The top reaction of the mean distribution and its share of it, in whole percent.
  reaction: Reaction;
  percent: number;
  // People whose probability is above 50%.
  understands: number;
  trusts: number;
}

export function shareResult(faces: readonly FaceAnswer[]): ShareResult {
  const agg = aggregateWall(faces);
  const reaction = topReaction(agg.reaction);
  return { reaction, percent: percentages(agg.reaction)[reaction], understands: agg.understands, trusts: agg.trusts };
}

export function resultLine(result: ShareResult): string {
  return `${result.percent}/100 ${result.reaction}, ${result.understands} understand it, ${result.trusts} trust it`;
}

export function shareText(result: ShareResult, url: string): string {
  return `A hundred faces read my post: ${resultLine(result)}. Show yours to the wall first: ${url}`;
}

export function postOnXUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
