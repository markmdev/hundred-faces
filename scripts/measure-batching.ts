// Measures the batching strategies against the real Jev API: for each batch
// size, every preset message is judged RUNS times, one wall update per run
// with the batches fired in parallel exactly as the server does. Reports
// latency p50/p95, input tokens per update, agreement with the one-persona-
// per-call baseline (the cleanest state Jev can get), run-to-run
// self-consistency, and the number of 429 retries the SDK performed.
//
// Usage: npm run measure [-- --sizes 1,10,100 --runs 3 --out path.json]

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { NOULS, type FaceAnswer } from "../src/shared/questions.ts";
import { topReaction } from "../src/shared/reactions.ts";
import { judgeWall } from "../src/shared/wall.ts";
import { mean, percentile, tv } from "./stats.ts";

const { values } = parseArgs({
  options: {
    sizes: { type: "string", default: "1,5,10,25,50,100" },
    runs: { type: "string", default: "3" },
    out: { type: "string" },
  },
});
const SIZES = values.sizes.split(",").map((s) => Number.parseInt(s, 10));
const RUNS = Number.parseInt(values.runs, 10);

let rateLimitRetries = 0;
let otherRetries = 0;
const client = new TypeSafeClient({
  timeout: 60_000,
  logLevel: "info",
  logger: {
    debug: () => {},
    info: (message: string) => {
      if (!message.includes("retrying")) return;
      if (message.includes("after 429")) rateLimitRetries++;
      else otherRetries++;
    },
    warn: (message: string) => console.warn(message),
    error: (message: string) => console.error(message),
  },
});

interface Update {
  size: number;
  preset: string;
  run: number;
  latencyMs: number;
  inputTokens: number;
  calls: number;
  faces?: FaceAnswer[];
  error?: string;
}

const noulGap = (a: FaceAnswer, b: FaceAnswer): number => mean(NOULS.map(({ id }) => Math.abs(a[id] - b[id])));

function compare(a: FaceAnswer[], b: FaceAnswer[]) {
  const tvs = a.map((face, i) => tv(face, b[i]!));
  const tops = a.map((face, i) => (topReaction(face.reaction) === topReaction(b[i]!.reaction) ? 1 : 0));
  const nouls = a.map((face, i) => noulGap(face, b[i]!));
  return { meanTv: mean(tvs), maxTv: Math.max(...tvs), topAgree: mean(tops), noulMad: mean(nouls) };
}

const updates: Update[] = [];
for (const size of SIZES) {
  for (const preset of PRESETS) {
    for (let run = 0; run < RUNS; run++) {
      const started = performance.now();
      try {
        const wall = await judgeWall(preset.message, client, { batchSize: size });
        updates.push({ size, preset: preset.id, run, latencyMs: wall.latencyMs, inputTokens: wall.inputTokens, calls: wall.calls, faces: wall.faces });
        process.stdout.write(`size ${String(size).padStart(3)} ${preset.id.padEnd(13)} run ${run}: ${String(wall.latencyMs).padStart(5)} ms, ${wall.inputTokens} tokens, ${wall.calls} calls\n`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updates.push({ size, preset: preset.id, run, latencyMs: Math.round(performance.now() - started), inputTokens: 0, calls: Math.ceil(PERSONAS.length / size), error: message });
        process.stdout.write(`size ${String(size).padStart(3)} ${preset.id.padEnd(13)} run ${run}: FAILED ${message.slice(0, 160)}\n`);
      }
    }
  }
}

const baselineSize = Math.min(...SIZES);
const baseline = (preset: string, run: number) => updates.find((u) => u.size === baselineSize && u.preset === preset && u.run === run && u.faces);

console.log(`\nbaseline for agreement: batch size ${baselineSize}. ${RUNS} runs x ${PRESETS.length} presets per size.`);
console.log("size  calls  ok/all  lat p50  lat p95  tokens/update  vs-baseline: meanTV  maxTV  top-agree  noulMAD | run-to-run: meanTV  top-agree  noulMAD");
for (const size of SIZES) {
  const mine = updates.filter((u) => u.size === size);
  const ok = mine.filter((u) => u.faces);
  const latencies = ok.map((u) => u.latencyMs);
  const tokens = mean(ok.map((u) => u.inputTokens));
  const vsBase = ok.flatMap((u) => {
    const base = baseline(u.preset, u.run);
    return base && u.size !== baselineSize ? [compare(u.faces!, base.faces!)] : [];
  });
  const selfPairs: ReturnType<typeof compare>[] = [];
  for (const preset of PRESETS) {
    const runs = ok.filter((u) => u.preset === preset.id);
    for (let i = 1; i < runs.length; i++) selfPairs.push(compare(runs[i]!.faces!, runs[i - 1]!.faces!));
  }
  const f = (x: number, d = 3) => (Number.isNaN(x) ? "  -  " : x.toFixed(d));
  console.log(
    `${String(size).padStart(4)}  ${String(Math.ceil(PERSONAS.length / size)).padStart(5)}  ${String(ok.length).padStart(2)}/${String(mine.length).padEnd(3)} ` +
      `${String(Math.round(percentile(latencies, 50))).padStart(7)}  ${String(Math.round(percentile(latencies, 95))).padStart(7)}  ${String(Math.round(tokens)).padStart(13)}  ` +
      `${" ".repeat(12)}${f(mean(vsBase.map((c) => c.meanTv)))}  ${f(mean(vsBase.map((c) => c.maxTv)))}  ${f(mean(vsBase.map((c) => c.topAgree)))}      ${f(mean(vsBase.map((c) => c.noulMad)))} | ` +
      `${" ".repeat(11)}${f(mean(selfPairs.map((c) => c.meanTv)))}  ${f(mean(selfPairs.map((c) => c.topAgree)))}      ${f(mean(selfPairs.map((c) => c.noulMad)))}`,
  );
  const errors = mine.filter((u) => u.error);
  if (errors.length) console.log(`      errors: ${errors[0]!.error!.slice(0, 200)}`);
}
console.log(`\nSDK retries: ${rateLimitRetries} after 429, ${otherRetries} other.`);

if (values.out) {
  writeFileSync(values.out, JSON.stringify({ sizes: SIZES, runs: RUNS, rateLimitRetries, otherRetries, updates }, null, 1));
  console.log(`raw results written to ${values.out}`);
}
