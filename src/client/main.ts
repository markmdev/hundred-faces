// Wires the page together: the text box, the presets, the live update loop
// against the server, the wall of faces, the aggregates, and the hover card.

import { aggregateWall } from "../shared/aggregate.ts";
import { PERSONAS } from "../shared/personas.ts";
import { PRESETS } from "../shared/presets.ts";
import type { FaceAnswer } from "../shared/questions.ts";
import { REACTIONS } from "../shared/reactions.ts";
import type { WallResponse } from "../shared/types.ts";
import { fetchWall } from "./api.ts";
import { FaceWall } from "./faces.ts";
import { tintCss, Tooltip } from "./tooltip.ts";

// Keystrokes settle for this long before a request goes out.
const DEBOUNCE_MS = 250;
// Requests already in flight when a new one is due. Older responses are
// discarded by sequence number when they arrive after a newer one.
const MAX_IN_FLIGHT = 2;

const must = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const messageBox = must<HTMLTextAreaElement>("message");
const presetsEl = must<HTMLElement>("presets");
const statLatency = must<HTMLElement>("stat-latency");
const statTokens = must<HTMLElement>("stat-tokens");
const statCalls = must<HTMLElement>("stat-calls");
const statusEl = must<HTMLElement>("status");
const reactionBar = must<HTMLElement>("reaction-bar");
const legendEl = must<HTMLElement>("legend");
const noulsEl = must<HTMLElement>("nouls");
const wallEl = must<HTMLElement>("wall");

const wall = new FaceWall(wallEl, PERSONAS);
const tooltip = new Tooltip(must<HTMLElement>("tooltip"));

// The answers currently on the wall, in PERSONAS order; empty before the first update.
let answers: FaceAnswer[] = [];
let latestSeq = 0;
let shownSeq = 0;
let inFlight = 0;
let pendingText: string | null = null;
let debounceHandle = 0;

// ---------------------------------------------------------------------------
// Summary panel
// ---------------------------------------------------------------------------

const legendItems = new Map<string, HTMLElement>();
const barSegments = new Map<string, HTMLElement>();
for (const name of REACTIONS) {
  const segment = document.createElement("span");
  segment.style.background = tintCss(name);
  segment.style.width = "0%";
  segment.title = name;
  reactionBar.append(segment);
  barSegments.set(name, segment);

  const item = document.createElement("li");
  const swatch = document.createElement("i");
  swatch.style.background = tintCss(name);
  const label = document.createElement("span");
  label.textContent = name;
  const value = document.createElement("b");
  value.textContent = "–";
  item.append(swatch, label, value);
  legendEl.append(item);
  legendItems.set(name, value);
}

const noulRows = new Map<string, { fill: HTMLElement; value: HTMLElement }>();
for (const [key, label] of [
  ["understands", "understand"],
  ["trusts", "trust"],
  ["shares", "would share"],
] as const) {
  const item = document.createElement("li");
  const name = document.createElement("span");
  name.textContent = label;
  const track = document.createElement("div");
  track.className = "track";
  const fill = document.createElement("span");
  fill.style.width = "0%";
  track.append(fill);
  const value = document.createElement("b");
  value.textContent = "–";
  item.append(name, track, value);
  noulsEl.append(item);
  noulRows.set(key, { fill, value });
}

function renderSummary(response: WallResponse): void {
  const agg = aggregateWall(response.faces);
  statLatency.textContent = String(response.latencyMs);
  statTokens.textContent = response.inputTokens.toLocaleString();
  statCalls.textContent = `${response.calls} ${response.calls === 1 ? "call" : "parallel calls"} to ${response.model}`;
  for (const name of REACTIONS) {
    const pct = agg.reaction[name] * 100;
    barSegments.get(name)!.style.width = `${pct}%`;
    legendItems.get(name)!.textContent = `${Math.round(pct)}%`;
  }
  for (const [key, count] of [
    ["understands", agg.understands],
    ["trusts", agg.trusts],
    ["shares", agg.shares],
  ] as const) {
    const row = noulRows.get(key)!;
    row.fill.style.width = `${(count / agg.total) * 100}%`;
    row.value.textContent = `${count}/${agg.total}`;
  }
}

function clearSummary(): void {
  statLatency.textContent = "–";
  statTokens.textContent = "–";
  statCalls.textContent = "";
  for (const name of REACTIONS) {
    barSegments.get(name)!.style.width = "0%";
    legendItems.get(name)!.textContent = "–";
  }
  for (const row of noulRows.values()) {
    row.fill.style.width = "0%";
    row.value.textContent = "–";
  }
}

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

function scheduleUpdate(): void {
  clearTimeout(debounceHandle);
  debounceHandle = window.setTimeout(() => void requestUpdate(messageBox.value), DEBOUNCE_MS);
}

async function requestUpdate(text: string): Promise<void> {
  const message = text.trim();
  if (message.length === 0) {
    // Anything still in flight is older than the empty box and must not repopulate it.
    shownSeq = ++latestSeq;
    pendingText = null;
    answers = [];
    wall.rest();
    wallEl.classList.add("resting");
    clearSummary();
    setStatus("");
    return;
  }
  if (inFlight >= MAX_IN_FLIGHT) {
    pendingText = text;
    return;
  }
  const seq = ++latestSeq;
  inFlight++;
  setStatus("judging…");
  try {
    const response = await fetchWall(message, wall.size);
    if (seq < shownSeq) return;
    shownSeq = seq;
    answers = response.faces;
    wall.show(answers.map((face) => face.reaction));
    wallEl.classList.remove("resting");
    renderSummary(response);
    // A newer request may still be out; keep saying so until it lands.
    setStatus(seq < latestSeq ? "judging…" : "");
  } catch (err) {
    if (seq < shownSeq) return;
    setStatus(err instanceof Error ? err.message : String(err), true);
  } finally {
    inFlight--;
    if (pendingText !== null) {
      const next = pendingText;
      pendingText = null;
      void requestUpdate(next);
    }
  }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

messageBox.addEventListener("input", () => {
  for (const button of presetsEl.querySelectorAll("button")) button.setAttribute("aria-pressed", "false");
  scheduleUpdate();
});

for (const preset of PRESETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = preset.label;
  button.dataset.preset = preset.id;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    messageBox.value = preset.message;
    for (const other of presetsEl.querySelectorAll("button")) other.setAttribute("aria-pressed", String(other === button));
    clearTimeout(debounceHandle);
    void requestUpdate(preset.message);
  });
  presetsEl.append(button);
}

// ---------------------------------------------------------------------------
// Hover card
// ---------------------------------------------------------------------------

function faceIndex(target: EventTarget | null): number | null {
  const face = target instanceof Element ? target.closest<HTMLElement>(".face") : null;
  if (!face?.dataset.index) return null;
  return Number.parseInt(face.dataset.index, 10);
}

function showFace(target: EventTarget | null): void {
  const index = faceIndex(target);
  if (index === null) return;
  const face = wallEl.querySelector<HTMLElement>(`.face[data-index="${index}"]`)!;
  tooltip.show(PERSONAS[index]!, answers[index], face.getBoundingClientRect());
}

wallEl.addEventListener("mouseover", (event) => showFace(event.target));
wallEl.addEventListener("mouseout", (event) => {
  if (faceIndex(event.relatedTarget) === null) tooltip.hide();
});
wallEl.addEventListener("focusin", (event) => showFace(event.target));
wallEl.addEventListener("focusout", () => tooltip.hide());

wallEl.classList.add("resting");
