// Renders the wall to a canvas for saving: a header with the result line and
// the message, then the hundred faces drawn from the same geometry the SVG
// wall uses, in the page's current colours. How a face is stroked and filled
// is read from a rendered face, so the stylesheet stays the one owner of it.

import { blendFace, FACE_SIZE, faceGeometry, HEAD, type FaceGeometry } from "../shared/face.ts";
import type { FaceAnswer } from "../shared/questions.ts";

const IMAGE_SIZE = 1200;
const COLUMNS = 10;
const MARGIN = 60;
const GAP = 8;

// The header: the result line, a gap, up to two lines of the message, and a
// gap before the faces. Line heights follow the font sizes.
const LINE_HEIGHT = 1.4;
const RESULT_FONT_SIZE = 34;
const MESSAGE_FONT_SIZE = 26;
const MESSAGE_LINES = 2;
const RESULT_GAP = 8;
const HEADER_GAP = 28;
const lineHeight = (fontSize: number): number => Math.round(fontSize * LINE_HEIGHT);

export function renderWallImage(answers: readonly FaceAnswer[], message: string, result: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const font = style.fontFamily;
  const width = IMAGE_SIZE - 2 * MARGIN;

  ctx.fillStyle = token("--bg");
  ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

  ctx.textBaseline = "top";
  ctx.fillStyle = token("--ink");
  ctx.font = `600 ${RESULT_FONT_SIZE}px ${font}`;
  ctx.fillText(fit(ctx, result, width), MARGIN, MARGIN);
  ctx.fillStyle = token("--muted");
  ctx.font = `${MESSAGE_FONT_SIZE}px ${font}`;
  const messageTop = MARGIN + lineHeight(RESULT_FONT_SIZE) + RESULT_GAP;
  wrap(ctx, message, width, MESSAGE_LINES).forEach((line, i) => ctx.fillText(line, MARGIN, messageTop + i * lineHeight(MESSAGE_FONT_SIZE)));

  const top = messageTop + MESSAGE_LINES * lineHeight(MESSAGE_FONT_SIZE) + HEADER_GAP;
  const size = Math.floor((IMAGE_SIZE - top - MARGIN - GAP * (COLUMNS - 1)) / COLUMNS);
  const left = Math.round((IMAGE_SIZE - (COLUMNS * size + GAP * (COLUMNS - 1))) / 2);
  const sample = document.querySelector(".face");
  if (!sample) throw new Error("no rendered face to read the face style from");
  const faceStyle = readFaceStyle(sample);
  answers.forEach((answer, i) => {
    const x = left + (i % COLUMNS) * (size + GAP);
    const y = top + Math.floor(i / COLUMNS) * (size + GAP);
    drawFace(ctx, faceGeometry(blendFace(answer.reaction)), x, y, size, faceStyle);
  });
  return canvas;
}

// How the stylesheet draws a face's parts, as canvas state.
interface Stroke {
  stroke: string;
  width: number;
}
interface Line extends Stroke {
  cap: CanvasLineCap;
  join: CanvasLineJoin;
}
interface FaceStyle {
  head: Stroke;
  brow: Line;
  mouth: Line & { fill: string };
  eye: { fill: string };
}

function readFaceStyle(face: Element): FaceStyle {
  const part = (selector: string): CSSStyleDeclaration => {
    const el = face.querySelector(selector);
    if (!el) throw new Error(`the rendered face has no ${selector}`);
    return getComputedStyle(el);
  };
  const stroke = (s: CSSStyleDeclaration): Stroke => ({ stroke: s.stroke, width: Number.parseFloat(s.strokeWidth) });
  const line = (s: CSSStyleDeclaration): Line => ({ ...stroke(s), cap: s.strokeLinecap as CanvasLineCap, join: s.strokeLinejoin as CanvasLineJoin });
  const mouth = part(".mouth");
  return { head: stroke(part(".head")), brow: line(part(".brow")), mouth: { ...line(mouth), fill: mouth.fill }, eye: { fill: part(".eye").fill } };
}

// The SVG geometry as canvas paths: Path2D reads the same path data.
function drawFace(ctx: CanvasRenderingContext2D, g: FaceGeometry, x: number, y: number, size: number, style: FaceStyle): void {
  const line = ({ stroke, width, cap, join }: Line) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    ctx.lineJoin = join;
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / FACE_SIZE, size / FACE_SIZE);
  ctx.fillStyle = g.fill;
  ctx.strokeStyle = style.head.stroke;
  ctx.lineWidth = style.head.width;
  ctx.beginPath();
  ctx.arc(HEAD.cx, HEAD.cy, HEAD.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  line(style.brow);
  ctx.stroke(new Path2D(g.leftBrowPath));
  ctx.stroke(new Path2D(g.rightBrowPath));
  ctx.fillStyle = style.eye.fill;
  for (const eye of [g.leftEye, g.rightEye]) {
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const mouth = new Path2D(g.mouthPath);
  line(style.mouth);
  ctx.fillStyle = style.mouth.fill;
  ctx.fill(mouth);
  ctx.stroke(mouth);
  ctx.restore();
}

// Greedy word wrap to at most maxLines. A word wider than a line (a URL, a
// hashtag) is first broken into pieces that fit; the last line is cut with an
// ellipsis.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text
    .split(/\s+/)
    .filter((w) => w !== "")
    .flatMap((word) => pieces(ctx, word, maxWidth));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines) lines.push(line);
  else lines[maxLines - 1] = fit(ctx, `${lines[maxLines - 1]} ${line}`, maxWidth);
  return lines.filter((l) => l !== "");
}

// A word as pieces no wider than the line, split between code points.
function pieces(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  if (ctx.measureText(word).width <= maxWidth) return [word];
  const out: string[] = [];
  let piece = "";
  for (const char of word) {
    if (piece !== "" && ctx.measureText(piece + char).width > maxWidth) {
      out.push(piece);
      piece = "";
    }
    piece += char;
  }
  if (piece !== "") out.push(piece);
  return out;
}

// Cuts text to the width with an ellipsis, a code point at a time, so an
// emoji is never split.
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}
