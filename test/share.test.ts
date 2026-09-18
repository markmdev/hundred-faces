import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { percentages, topReaction } from "../src/shared/reactions.ts";
import { postOnXUrl, resultLine, shareResult, shareText } from "../src/shared/share.ts";
import { loadFixture, recordedWall } from "./fixtures/schema.ts";

describe("share text", () => {
  it("names the top reaction of the mean distribution with the legend's percentage and the counts", () => {
    const fixture = loadFixture();
    const wall = recordedWall(fixture, "hot-take");
    const agg = aggregateWall(wall.faces);
    const result = shareResult(wall.faces);
    assert.equal(result.reaction, topReaction(agg.reaction));
    assert.equal(result.percent, percentages(agg.reaction)[result.reaction]);
    assert.equal(result.understands, agg.understands);
    assert.equal(result.trusts, agg.trusts);
    const url = "https://hundred-faces.vercel.app/?m=Unpopular+opinion";
    assert.equal(
      shareText(result, url),
      `A hundred faces read my post: ${result.percent}/100 ${result.reaction}, ${result.understands} understand it, ${result.trusts} trust it. Show yours to the wall first: ${url}`,
    );
    assert.equal(resultLine({ reaction: "annoyed", percent: 62, understands: 84, trusts: 12 }), "62/100 annoyed, 84 understand it, 12 trust it");
  });

  it("builds the X intent URL with the text encoded", () => {
    const text = "A hundred faces read my post: 62/100 annoyed & more: https://hundred-faces.vercel.app/?m=a+b";
    const url = new URL(postOnXUrl(text));
    assert.equal(url.origin + url.pathname, "https://x.com/intent/post");
    assert.equal(url.searchParams.get("text"), text);
  });
});
