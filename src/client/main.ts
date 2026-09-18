// Wires the page together: the text box, the presets, the live update loop
// against the server, the wall of faces, the aggregates, and the hover card.

import { aggregateWall } from "../shared/aggregate.ts";
import { rgbCss } from "../shared/face.ts";
import { PERSONAS } from "../shared/personas.ts";
import { PRESETS } from "../shared/presets.ts";
import { NOULS, type FaceAnswer } from "../shared/questions.ts";
import { percentages, REACTION_FACES, REACTIONS } from "../shared/reactions.ts";
import { MAX_MESSAGE_CHARS, type WallResponse } from "../shared/types.ts";
import { fetchWall, WallRequestError } from "./api.ts";
import { barRow } from "./bars.ts";
import { FaceWall } from "./faces.ts";
import { Tooltip } from "./tooltip.ts";

// Keystrokes settle for this long before a request goes out.
const DEBOUNCE_MS = 250;
// Requests allowed in flight at once; further text waits for one to settle.
// A superseded request is left to finish so the wall keeps moving mid-typing.
const MAX_IN_FLIGHT = 2;

const RATE_LIMITED_COPY = "Jev is rate-limiting this demo. Wait a moment and type again.";
const FAILED_COPY = "Couldn't judge this message. Try again.";

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
// Every request gets the next sequence number; a clear takes one too, so
// anything in flight at the clear is older than the empty box.
let latestSeq = 0;
// The sequence whose outcome the page shows, and its failure copy if it failed.
let shownSeq = 0;
let shownError: string | null = null;
const inFlight = new Map<number, AbortController>();
let pendingText: string | null = null;
let debounceHandle = 0;
// The face whose card is open, under the pointer or keyboard focus.
let cardFace: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Summary panel
// ---------------------------------------------------------------------------

const legendItems = new Map<string, HTMLElement>();
const barSegments = new Map<string, HTMLElement>();
for (const name of REACTIONS) {
  const color = rgbCss(REACTION_FACES[name].tint);
  const segment = document.createElement("span");
  segment.style.background = color;
  segment.style.width = "0%";
  segment.title = name;
  reactionBar.append(segment);
  barSegments.set(name, segment);

  const item = document.createElement("li");
  const swatch = document.createElement("i");
  swatch.style.background = color;
  const label = document.createElement("span");
  label.textContent = name;
  const value = document.createElement("b");
  value.textContent = "–";
  item.append(swatch, label, value);
  legendEl.append(item);
  legendItems.set(name, value);
}

const noulRows = NOULS.map(({ id, label }) => {
  const row = barRow(label);
  row.root.title = "people whose probability is above 50%";
  noulsEl.append(row.root);
  return { id, row };
});

function renderSummary(response: WallResponse): void {
  const agg = aggregateWall(response.faces);
  statLatency.textContent = String(response.latencyMs);
  statTokens.textContent = response.inputTokens.toLocaleString();
  statCalls.textContent = `${response.calls} ${response.calls === 1 ? "call" : "parallel calls"} to ${response.model}`;
  const pct = percentages(agg.reaction);
  for (const name of REACTIONS) {
    barSegments.get(name)!.style.width = `${agg.reaction[name] * 100}%`;
    legendItems.get(name)!.textContent = `${pct[name]}%`;
  }
  for (const { id, row } of noulRows) row.set(agg[id] / agg.total, `${agg[id]}/${agg.total}`);
}

function clearSummary(): void {
  statLatency.textContent = "–";
  statTokens.textContent = "–";
  statCalls.textContent = "";
  for (const name of REACTIONS) {
    barSegments.get(name)!.style.width = "0%";
    legendItems.get(name)!.textContent = "–";
  }
  for (const { row } of noulRows) row.set(0, "–");
}

// "judging…" exactly while a request newer than the shown one is out;
// otherwise the shown request's failure, if any.
function renderStatus(): void {
  const judging = shownSeq < latestSeq;
  statusEl.textContent = judging ? "judging…" : (shownError ?? "");
  statusEl.classList.toggle("error", !judging && shownError !== null);
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

function scheduleUpdate(): void {
  clearTimeout(debounceHandle);
  debounceHandle = window.setTimeout(() => requestUpdate(messageBox.value), DEBOUNCE_MS);
}

function requestUpdate(text: string): void {
  if (inFlight.size >= MAX_IN_FLIGHT) {
    pendingText = text;
    return;
  }
  const seq = ++latestSeq;
  const controller = new AbortController();
  inFlight.set(seq, controller);
  renderStatus();
  void settle(seq, fetchWall(text, controller.signal)).finally(() => {
    inFlight.delete(seq);
    if (pendingText !== null) {
      const next = pendingText;
      pendingText = null;
      requestUpdate(next);
    }
  });
}

// Whatever lands with a sequence newer than the shown one becomes the shown
// one, success or failure; anything older is ignored.
async function settle(seq: number, request: Promise<WallResponse>): Promise<void> {
  try {
    const response = await request;
    if (seq < shownSeq) return;
    shownSeq = seq;
    shownError = null;
    answers = response.faces;
    wall.show(answers.map((face) => face.reaction));
    wallEl.classList.remove("resting");
    renderSummary(response);
  } catch (err) {
    if (seq < shownSeq) return;
    shownSeq = seq;
    shownError = err instanceof WallRequestError && err.status === 429 ? RATE_LIMITED_COPY : FAILED_COPY;
    console.error("wall update failed:", err);
    restWall();
  } finally {
    renderStatus();
    refreshCard();
  }
}

function restWall(): void {
  answers = [];
  wall.rest();
  wallEl.classList.add("resting");
  clearSummary();
}

// An empty box takes effect at once: nothing in flight may render, and the
// server is told to stop.
function clearWall(): void {
  clearTimeout(debounceHandle);
  shownSeq = ++latestSeq;
  shownError = null;
  for (const controller of inFlight.values()) controller.abort();
  pendingText = null;
  restWall();
  renderStatus();
  refreshCard();
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

messageBox.maxLength = MAX_MESSAGE_CHARS;

messageBox.addEventListener("input", () => {
  for (const button of presetsEl.querySelectorAll("button")) button.setAttribute("aria-pressed", "false");
  if (messageBox.value.trim() === "") clearWall();
  else scheduleUpdate();
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
    requestUpdate(preset.message);
  });
  presetsEl.append(button);
}

// ---------------------------------------------------------------------------
// Hover card
// ---------------------------------------------------------------------------

function faceOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".face") : null;
}

function openCard(face: HTMLElement): void {
  cardFace = face;
  const index = Number.parseInt(face.dataset.index!, 10);
  tooltip.show(PERSONAS[index]!, answers[index], face.getBoundingClientRect());
}

function closeCard(): void {
  cardFace = null;
  tooltip.hide();
}

// The card shows the answers on the wall, so it follows every update and clear.
function refreshCard(): void {
  if (cardFace) openCard(cardFace);
}

wallEl.addEventListener("mouseover", (event) => {
  const face = faceOf(event.target);
  if (face) openCard(face);
});
wallEl.addEventListener("mouseout", (event) => {
  if (!faceOf(event.relatedTarget)) closeCard();
});
wallEl.addEventListener("focusin", (event) => {
  const face = faceOf(event.target);
  if (face) openCard(face);
});
wallEl.addEventListener("focusout", closeCard);

wallEl.classList.add("resting");
