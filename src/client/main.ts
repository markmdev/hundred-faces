// Wires the page together: the text box, the presets, the live update loop
// against the server, the wall of faces, the aggregates, the share loop, and
// the person card (a hover card with a pointer, a bottom sheet on touch).

import { aggregateWall } from "../shared/aggregate.ts";
import { rgbCss } from "../shared/face.ts";
import { PERSONAS } from "../shared/personas.ts";
import { PRESETS, type Preset } from "../shared/presets.ts";
import { NOULS } from "../shared/questions.ts";
import { percentages, REACTION_FACES, REACTIONS } from "../shared/reactions.ts";
import { postOnXUrl, resultLine, shareResult, shareText } from "../shared/share.ts";
import { MESSAGE_PARAM, messageQuery, messageTooLong, type WallResponse } from "../shared/types.ts";
import { fetchPreset, fetchWall, WallRequestError } from "./api.ts";
import { barRow } from "./bars.ts";
import { Card } from "./card.ts";
import { FaceWall } from "./faces.ts";
import { renderWallImage } from "./image.ts";

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
const cardEl = must<HTMLElement>("card");

const wall = new FaceWall(wallEl, PERSONAS);
// Pointer devices hover the card; anything else taps it open as a sheet.
const hoverCapable = matchMedia("(hover: hover)").matches;
const card = new Card(cardEl, !hoverCapable);

// The wall on show: the message, the answers, and whether they came from a
// preset recording rather than a live judgement. Null while the wall rests.
// The share row and the saved image describe it and nothing else.
interface ShownWall {
  text: string;
  response: WallResponse;
  recorded: boolean;
}
let shown: ShownWall | null = null;
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

function renderSummary({ response, recorded }: ShownWall): void {
  const agg = aggregateWall(response.faces);
  statLatency.textContent = String(response.latencyMs);
  statTokens.textContent = response.inputTokens.toLocaleString();
  statCalls.textContent = `${response.calls} ${response.calls === 1 ? "call" : "parallel calls"} to ${response.model}${recorded ? ", recorded" : ""}`;
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

// The page URL carries the message being judged, so a refresh retries it and
// a shared link opens on it; a failed judgement leaves it there for the retry.
// Other parameters on the URL (a tracking tag from wherever the link was
// posted) are kept.
function setUrlMessage(text: string | null): void {
  const url = new URL(location.href);
  if (text === null) url.searchParams.delete(MESSAGE_PARAM);
  else url.searchParams.set(MESSAGE_PARAM, text);
  history.replaceState(null, "", url);
}

// The link the share row hands out: this page with the shown wall's message
// and nothing else, whatever the address bar has picked up.
function linkFor(text: string): string {
  return `${location.origin}${location.pathname}?${messageQuery(text)}`;
}

function renderShare(): void {
  shareEl.hidden = shown === null;
  if (shown) shareX.href = postOnXUrl(shareText(shareResult(shown.response.faces), linkFor(shown.text)));
}

shareImage.addEventListener("click", () => {
  if (!shown) return;
  const faces = shown.response.faces;
  const canvas = renderWallImage(faces, shown.text, `A hundred faces read it: ${resultLine(shareResult(faces))}.`);
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
  if (!shown) return;
  let label = "Copied";
  try {
    await navigator.clipboard.writeText(linkFor(shown.text));
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
  const tooLong = messageTooLong(text);
  if (tooLong !== null) {
    refuse(tooLong);
    return;
  }
  const seq = ++latestSeq;
  const controller = new AbortController();
  inFlight = controller;
  setUrlMessage(text);
  renderStatus();
  void settle(seq, text, wallFor(text, controller.signal)).finally(() => {
    // clearWall nulls inFlight, and a newer request may already own the slot
    // by the time an aborted request's finally runs; only this request's slot is released.
    if (inFlight === controller) inFlight = null;
    if (pendingText !== null) {
      const next = pendingText;
      pendingText = null;
      requestUpdate(next);
    }
  });
}

interface WallOutcome {
  response: WallResponse;
  recorded: boolean;
}

// A preset comes from its recording; anything else is judged, with one retry
// after a pause when the wall is busy.
async function wallFor(text: string, signal: AbortSignal): Promise<WallOutcome> {
  const preset = PRESETS.find((p) => p.message === text);
  if (preset) return { response: await fetchPreset(preset.id, signal), recorded: true };
  try {
    return { response: await fetchWall(text, signal), recorded: false };
  } catch (err) {
    if (!(err instanceof WallRequestError && err.status === 429)) throw err;
    await pause(RETRY_AFTER_MS, signal);
    return { response: await fetchWall(text, signal), recorded: false };
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
async function settle(seq: number, text: string, outcome: Promise<WallOutcome>): Promise<void> {
  try {
    const { response, recorded } = await outcome;
    if (seq < shownSeq) return;
    shownSeq = seq;
    shownError = null;
    shown = { text, response, recorded };
    wall.show(response.faces.map((face) => face.reaction));
    wallEl.classList.remove("resting");
    renderSummary(shown);
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
  shown = null;
  wall.rest();
  wallEl.classList.add("resting");
  clearSummary();
  renderShare();
}

// A message over a limit never leaves the browser: the wall rests and the
// status says why, in place of a request. It leaves the URL too; a link
// cannot carry it.
function refuse(reason: string): void {
  shownSeq = ++latestSeq;
  shownError = reason;
  restWall();
  setUrlMessage(null);
  renderStatus();
  refreshCard();
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
// Person card
// ---------------------------------------------------------------------------

function faceOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".face") : null;
}

function openCard(face: HTMLElement): void {
  cardFace = face;
  const index = Number.parseInt(face.dataset.index!, 10);
  card.show(PERSONAS[index]!, shown?.response.faces[index], face.getBoundingClientRect());
}

function closeCard(): void {
  cardFace = null;
  card.hide();
}

// The card shows the answers on the wall, so it follows every update and clear.
function refreshCard(): void {
  if (cardFace) openCard(cardFace);
}

if (hoverCapable) {
  wallEl.addEventListener("mouseover", (event) => {
    const face = faceOf(event.target);
    if (face) openCard(face);
  });
  wallEl.addEventListener("mouseout", (event) => {
    if (!faceOf(event.relatedTarget)) closeCard();
  });
} else {
  // A tap opens the sheet; the same face, or anywhere outside it, closes it.
  wallEl.addEventListener("click", (event) => {
    const face = faceOf(event.target);
    if (!face) return;
    if (face === cardFace) closeCard();
    else openCard(face);
  });
  document.addEventListener("pointerdown", (event) => {
    if (cardFace && !faceOf(event.target) && !(event.target instanceof Node && cardEl.contains(event.target))) closeCard();
  });
}
// Keyboard focus opens the card on any device; a tap focuses too, but is not :focus-visible.
wallEl.addEventListener("focusin", (event) => {
  const face = faceOf(event.target);
  if (face?.matches(":focus-visible")) openCard(face);
});
// Focus leaving the wall and the card closes it, in either mode.
for (const el of [wallEl, cardEl]) {
  el.addEventListener("focusout", (event) => {
    const to = event.relatedTarget;
    if (to instanceof Node && (wallEl.contains(to) || cardEl.contains(to))) return;
    closeCard();
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

wallEl.classList.add("resting");

// Vercel Web Analytics reports the page URL with each view; the message must
// not travel with it. The queue is how the documented hook reaches the script
// tag before it loads (vercel.com/docs/analytics/redacting-sensitive-data).
type AnalyticsQueue = { va?: (...args: unknown[]) => void; vaq?: unknown[][] };
const analytics = window as Window & AnalyticsQueue;
analytics.va ??= (...args) => {
  (analytics.vaq ??= []).push(args);
};
analytics.va("beforeSend", (event: { url: string }) => {
  const url = new URL(event.url);
  url.searchParams.delete(MESSAGE_PARAM);
  return { ...event, url: url.toString() };
});

const initial = new URL(location.href).searchParams.get(MESSAGE_PARAM);
if (initial !== null && initial.trim() !== "") {
  messageBox.value = initial;
  pressPreset(PRESETS.find((p) => p.message === initial) ?? null);
  requestUpdate(initial);
}
