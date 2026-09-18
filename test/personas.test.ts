import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERSONAS } from "../src/shared/personas.ts";

describe("personas", () => {
  it("are one hundred distinct people with every field filled", () => {
    assert.equal(PERSONAS.length, 100);
    assert.equal(new Set(PERSONAS.map((p) => p.name)).size, 100, "names are unique");
    for (const p of PERSONAS) {
      for (const [key, value] of Object.entries(p)) {
        assert.ok(value !== "" && value !== undefined, `${p.name}.${key} is set`);
      }
      // Each person is written to between 35 and 65 words.
      const words = Object.values(p).join(" ").split(/\s+/).length;
      assert.ok(words >= 35 && words <= 65, `${p.name} is ${words} words`);
    }
  });
});
