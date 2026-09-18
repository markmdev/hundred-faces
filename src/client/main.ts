// Wires the page together: the text box, the presets, the live update loop
// against the server, the wall of faces, the aggregates, the share loop, and
// the hover card.

import { aggregateWall } from "../shared/aggregate.ts";
import { rgbCss } from "../shared/face.ts";
import { PERSONAS } from "../shared/personas.ts";
import { PRESETS, type Preset } from "../shared/presets.ts";
import { NOULS, type FaceAnswer } from "../shared/questions.ts";
import { percentages, REACTION_FACES, REACTIONS } from "../shared/reactions.ts";
import { postOnXUrl, resultLine, shareResult, shareText } from "../shared/share.ts";
import { MAX_MESSAGE_CHARS, MESSAGE_PARAM, type WallResponse } from "../shared/types.ts";
import { fetchPreset, fetchWall, WallRequestError } from "./api.ts";
import { barRow } from "./bars.ts";
import { FaceWall } from "./faces.ts";
import { renderWallImage } from "./image.ts";
import { Tooltip } from "./tooltip.ts";

// Keystrokes settle for this long before a request goes out.
const DEBOUNCE_MS = 600;
// A 429 (Jev busy, or the platform's rate limit) is retried once after this
// pause; a second 429 shows the busy copy.
const RETRY_AFTER_MS = 2_000;

const BUSY_COPY = "The wall is busy right now. Try again in a few seconds.";
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
const shareEl = must<HTMLElement>("share");
const shareX = must<HTMLAnchorElement>("share-x");
const shareImage = must<HTMLButtonElement>("share-image");
const shareCopy = must<HTMLButtonElement>("share-copy");

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
// One request at a time. Text typed while it is out waits here and goes out
// when it settles, so a burst of typing costs one more update, not one per pause.
let inFlight: AbortController | null = null;
let pendingText: string | null = null;
let debounceHandle = 0;
// The face whose card is open.
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
// Share loop
// ---------------------------------------------------------------------------

// The page URL carries the message, so the link opens on the same wall.
function setUrlMessage(text: string | null): void {
  const url = new URL(location.href);
  if (text === null) url.searchParams.delete(MESSAGE_PARAM);
  else url.searchParams.set(MESSAGE_PARAM, text);
  history.replaceState(null, "", url);
}

function renderShare(): void {
  const shown = answers.length > 0;
  shareEl.hidden = !shown;
  if (shown) shareX.href = postOnXUrl(shareText(shareResult(answers), location.href));
}

shareImage.addEventListener("click", () => {
  if (answers.length === 0) return;
  const canvas = renderWallImage(answers, messageBox.value, `A hundred faces read it: ${resultLine(shareResult(answers))}.`);
  canvas.toBlob((blob) => {
    if (!blob) {
      console.error("the wall image could not be encoded");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hundred-faces.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, "image/png");
});

const COPY_LABEL = shareCopy.textContent;
let copyHandle = 0;
shareCopy.addEventListener("click", async () => {
  let label = "Copied";
  try {
    await navigator.clipboard.writeText(location.href);
  } catch (err) {
    console.error("copying the link failed:", err);
    label = "Couldn't copy";
  }
  shareCopy.textContent = label;
  clearTimeout(copyHandle);
  copyHandle = window.setTimeout(() => {
    shareCopy.textContent = COPY_LABEL;
  }, 1_500);
});

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

function scheduleUpdate(): void {
  clearTimeout(debounceHandle);
  debounceHandle = window.setTimeout(() => requestUpdate(messageBox.value), DEBOUNCE_MS);
}

function requestUpdate(text: string): void {
  if (inFlight) {
    pendingText = text;
    return;
  }
  const seq = ++latestSeq;
  const controller = new AbortController();
  inFlight = controller;
  setUrlMessage(text);
  renderStatus();
  void settle(seq, judge(text, controller.signal)).finally(() => {
    if (inFlight === controller) inFlight = null;
    if (pendingText !== null) {
      const next = pendingText;
      pendingText = null;
      requestUpdate(next);
    }
  });
}

// A preset is served from its recording; anything else is judged, with one
// retry after a pause when the wall is busy.
async function judge(text: string, signal: AbortSignal): Promise<WallResponse> {
  const preset = PRESETS.find((p) => p.message === text);
  if (preset) return fetchPreset(preset.id, signal);
  try {
    return await fetchWall(text, signal);
  } catch (err) {
    if (!(err instanceof WallRequestError && err.status === 429)) throw err;
    await pause(RETRY_AFTER_MS, signal);
    return fetchWall(text, signal);
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(handle);
      reject(signal.reason);
    };
    const handle = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
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
    renderShare();
  } catch (err) {
    if (seq < shownSeq) return;
    shownSeq = seq;
    shownError = err instanceof WallRequestError && err.status === 429 ? BUSY_COPY : FAILED_COPY;
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
  renderShare();
}

// An empty box takes effect at once: nothing in flight may render, and the
// server is told to stop.
function clearWall(): void {
  clearTimeout(debounceHandle);
  shownSeq = ++latestSeq;
  shownError = null;
  inFlight?.abort();
  inFlight = null;
  pendingText = null;
  restWall();
  setUrlMessage(null);
  renderStatus();
  refreshCard();
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

messageBox.maxLength = MAX_MESSAGE_CHARS;

messageBox.addEventListener("input", () => {
  pressPreset(null);
  if (messageBox.value.trim() === "") clearWall();
  else scheduleUpdate();
});

function pressPreset(pressed: Preset | null): void {
  for (const button of presetsEl.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.preset === pressed?.id));
}

for (const preset of PRESETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = preset.label;
  button.dataset.preset = preset.id;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    messageBox.value = preset.message;
    pressPreset(preset);
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

wallEl.classList.add("resting");

const initial = new URL(location.href).searchParams.get(MESSAGE_PARAM);
if (initial !== null && initial.trim() !== "") {
  messageBox.value = initial;
  pressPreset(PRESETS.find((p) => p.message === initial) ?? null);
  requestUpdate(initial);
}
