// Probes against the real API, reported with numbers: how the wall moves
// between the two messages of each preset pair (the hype and plain launch,
// the salesy and human DM, the hot take and the apology), how spread out the
// hundred personas are for one message, how much a face moves between
// repeated identical requests, sanity checks on hand-picked personas, and
// latency at the shipped batch size.
//
// Usage: npm run probe

import { TypeSafeClient } from "@typesafe-ai/sdk";
import { aggregateWall } from "../src/shared/aggregate.ts";
import { PERSONAS } from "../src/shared/personas.ts";
import { PRESETS } from "../src/shared/presets.ts";
import { NOULS, type FaceAnswer } from "../src/shared/questions.ts";
import { percentages, topReaction, type Reaction } from "../src/shared/reactions.ts";
import type { WallResponse } from "../src/shared/types.ts";
import { BATCH_SIZE, batchCount, judgeWall } from "../src/shared/wall.ts";
import { mean, percentile, tv } from "./stats.ts";

const PAIRS: [string, string][] = [
  ["launch-hype", "launch-plain"],
  ["dm-salesy", "dm-human"],
  ["hot-take", "apology"],
];

const client = new TypeSafeClient({ timeout: 60_000 });
const preset = (id: string): string => {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`no preset ${id}; the probe names presets from src/shared/presets.ts`);
  return found.message;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mix = (faces: FaceAnswer[]) => percentages(aggregateWall(faces).reaction);
const name = (i: number) => PERSONAS[i]!.name;
const N = PERSONAS.length;

// Favourability: mass on the two positive reactions minus mass on the three negative ones.
const favour = (f: FaceAnswer) => f.reaction.delighted + f.reaction.interested - f.reaction.annoyed - f.reaction.offended - f.reaction.confused;

const latencies: number[] = [];
const tokens: number[] = [];
async function judge(message: string): Promise<WallResponse> {
  const result = await judgeWall(message, client);
  latencies.push(result.latencyMs);
  tokens.push(result.inputTokens);
  return result;
}

// Each preset is judged once and reused; the self-consistency probe judges its own repeats.
const walls = new Map<string, WallResponse>();
async function wall(id: string): Promise<WallResponse> {
  let w = walls.get(id);
  if (!w) {
    w = await judge(preset(id));
    walls.set(id, w);
  }
  return w;
}

console.log(`batch size ${BATCH_SIZE}, ${batchCount()} calls per update\n`);

// (a) movement between the two messages of each pair
for (const [fromId, toId] of PAIRS) {
  const from = await wall(fromId);
  const to = await wall(toId);
  const moved = from.faces.map((f, i) => tv(f, to.faces[i]!));
  const topChanged = from.faces.filter((f, i) => topReaction(f.reaction) !== topReaction(to.faces[i]!.reaction)).length;
  const direction = from.faces.map((f, i) => favour(to.faces[i]!) - favour(f));
  const towardsPositive = direction.filter((d) => d > 0.1).length;
  const towardsNegative = direction.filter((d) => d < -0.1).length;
  console.log(`(a) ${fromId} -> ${toId}`);
  console.log(`    faces whose top reaction changed: ${topChanged}/${N}; moved by TV > 0.2: ${moved.filter((m) => m > 0.2).length}/${N}; mean TV ${mean(moved).toFixed(3)}`);
  console.log(`    direction: ${towardsPositive} more favourable, ${towardsNegative} less favourable, ${N - towardsPositive - towardsNegative} within 0.1`);
  console.log(`    ${fromId.padEnd(12)} mix ${JSON.stringify(mix(from.faces))}`);
  console.log(`    ${toId.padEnd(12)} mix ${JSON.stringify(mix(to.faces))}`);
  const af = aggregateWall(from.faces);
  const at = aggregateWall(to.faces);
  console.log(`    understand ${af.understands} -> ${at.understands}, trust ${af.trusts} -> ${at.trusts}, share ${af.shares} -> ${at.shares}`);
  const transitions = new Map<string, number>();
  from.faces.forEach((f, i) => {
    const key = `${topReaction(f.reaction)} -> ${topReaction(to.faces[i]!.reaction)}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
  });
  console.log(`    top-reaction transitions: ${[...transitions.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join(", ")}\n`);
}

// (b) spread across the hundred personas for one message
for (const id of ["hot-take", "launch-plain"]) {
  const w = await wall(id);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      sum += tv(w.faces[i]!, w.faces[j]!);
      n++;
    }
  }
  const tops = new Map<Reaction, number>();
  for (const f of w.faces) tops.set(topReaction(f.reaction), (tops.get(topReaction(f.reaction)) ?? 0) + 1);
  const ranked = w.faces.map((f, i) => ({ i, fav: favour(f) })).sort((a, b) => b.fav - a.fav);
  const describe = (i: number) => {
    const f = w.faces[i]!;
    return `${name(i)} (${topReaction(f.reaction)} ${pct(f.reaction[topReaction(f.reaction)])}, ${NOULS.map(({ id }) => `${id} ${pct(f[id])}`).join(", ")})`;
  };
  console.log(`(b) spread for "${id}"`);
  console.log(`    mean pairwise TV between personas ${(sum / n).toFixed(3)}; top reactions: ${[...tops.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`    most favourable: ${ranked.slice(0, 3).map((r) => describe(r.i)).join("; ")}`);
  console.log(`    least favourable: ${ranked.slice(-3).map((r) => describe(r.i)).join("; ")}`);
  const understands = w.faces.map((f) => f.understands);
  const stdUnderstands = Math.sqrt(mean(understands.map((u) => (u - mean(understands)) ** 2)));
  console.log(`    understands: mean ${pct(mean(understands))}, std ${stdUnderstands.toFixed(2)}, min ${pct(Math.min(...understands))}, max ${pct(Math.max(...understands))}\n`);
}

// (c) self-consistency: the same message three times
{
  const runs = [await wall("hot-take"), await judge(preset("hot-take")), await judge(preset("hot-take"))];
  const moves: number[] = [];
  let topFlips = 0;
  const noulMoves: number[] = [];
  for (let i = 0; i < N; i++) {
    for (let r = 1; r < runs.length; r++) {
      const a = runs[r - 1]!.faces[i]!;
      const b = runs[r]!.faces[i]!;
      moves.push(tv(a, b));
      if (topReaction(a.reaction) !== topReaction(b.reaction)) topFlips++;
      noulMoves.push(...NOULS.map(({ id }) => Math.abs(a[id] - b[id])));
    }
  }
  const worst = runs[0]!.faces.map((f, i) => ({ i, m: Math.max(tv(f, runs[1]!.faces[i]!), tv(f, runs[2]!.faces[i]!)) })).sort((a, b) => b.m - a.m)[0]!;
  console.log("(c) self-consistency, the hot take sent three times");
  console.log(`    reaction TV between consecutive runs: mean ${mean(moves).toFixed(3)}, p95 ${percentile(moves, 95).toFixed(3)}, max ${Math.max(...moves).toFixed(3)} (${name(worst.i)})`);
  console.log(`    top reaction flipped in ${topFlips} of ${moves.length} face-transitions; noul absolute move mean ${mean(noulMoves).toFixed(3)}, max ${Math.max(...noulMoves).toFixed(3)}`);
  const aggs = runs.map((r) => aggregateWall(r.faces));
  console.log(`    aggregate counts across runs: understand ${aggs.map((a) => a.understands).join("/")}, trust ${aggs.map((a) => a.trusts).join("/")}, share ${aggs.map((a) => a.shares).join("/")}\n`);
}

// (d) sanity on hand-picked personas
{
  const find = (n: string) => {
    const i = PERSONAS.findIndex((p) => p.name === n);
    if (i < 0) throw new Error(`no persona named ${n}; the probe names people from src/shared/personas.ts`);
    return i;
  };
  const show = (label: string, w: WallResponse, who: string) => {
    const f = w.faces[find(who)]!;
    console.log(`    ${label.padEnd(12)} ${who.padEnd(18)} ${topReaction(f.reaction).padEnd(10)} ${pct(f.reaction[topReaction(f.reaction)]).padStart(4)}  ${NOULS.map(({ id }) => `${id} ${pct(f[id]).padStart(4)}`).join("  ")}`);
  };
  console.log("(d) sanity on hand-picked personas");
  console.log("    Lucía Herrera does not read English; Bruce Kowalski is allergic to corporate speak; Henrik Dahl forgives buzzwords.");
  for (const who of ["Lucía Herrera", "Bruce Kowalski", "Henrik Dahl"]) {
    show("launch-hype", await wall("launch-hype"), who);
    show("launch-plain", await wall("launch-plain"), who);
  }
  console.log("    Susan Whitaker shares anything with energy; Nigel Hartley finds logical gaps; Gloria Nakamura believes most of what she reads.");
  for (const who of ["Susan Whitaker", "Nigel Hartley", "Gloria Nakamura"]) {
    show("dm-salesy", await wall("dm-salesy"), who);
    show("dm-human", await wall("dm-human"), who);
  }
  console.log("    Rosa Delgado distrusts anything with fine print; Marcus Lindqvist wants the number and the ask in the first line.");
  for (const who of ["Rosa Delgado", "Marcus Lindqvist"]) {
    show("hot-take", await wall("hot-take"), who);
    show("apology", await wall("apology"), who);
  }
  console.log();
}

console.log(
  `latency over ${latencies.length} wall updates at batch size ${BATCH_SIZE}: p50 ${percentile(latencies, 50)} ms, p95 ${percentile(latencies, 95)} ms, min ${Math.min(...latencies)} ms, max ${Math.max(...latencies)} ms; input tokens per update ${Math.round(mean(tokens))}`,
);
