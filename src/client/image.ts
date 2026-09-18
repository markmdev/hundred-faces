// Renders the wall to a canvas for saving: a header with the result line and
// the message, then the hundred faces drawn from the same geometry the SVG
// wall uses, in the page's current colours.

import { blendFace, FACE_SIZE, faceGeometry, HEAD, type FaceGeometry } from "../shared/face.ts";
import type { FaceAnswer } from "../shared/questions.ts";

export const IMAGE_SIZE = 1200;
const COLUMNS = 10;
const MARGIN = 60;
const GAP = 8;

export function renderWallImage(answers: readonly FaceAnswer[], message: string, result: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const font = style.fontFamily;

  ctx.fillStyle = token("--bg");
  ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

  ctx.textBaseline = "top";
  ctx.fillStyle = token("--ink");
  ctx.font = `600 34px ${font}`;
  ctx.fillText(fit(ctx, result, IMAGE_SIZE - 2 * MARGIN), MARGIN, MARGIN);
  ctx.fillStyle = token("--muted");
  ctx.font = `26px ${font}`;
  const lines = wrap(ctx, message, IMAGE_SIZE - 2 * MARGIN, 2);
  lines.forEach((line, i) => ctx.fillText(line, MARGIN, MARGIN + 56 + i * 36));

  const top = MARGIN + 56 + 2 * 36 + 28;
  const size = Math.floor((IMAGE_SIZE - top - MARGIN - GAP * (COLUMNS - 1)) / COLUMNS);
  const left = Math.round((IMAGE_SIZE - (COLUMNS * size + GAP * (COLUMNS - 1))) / 2);
  const ink = token("--face-ink");
  answers.forEach((answer, i) => {
    const x = left + (i % COLUMNS) * (size + GAP);
    const y = top + Math.floor(i / COLUMNS) * (size + GAP);
    drawFace(ctx, faceGeometry(blendFace(answer.reaction)), x, y, size, ink);
  });
  return canvas;
}

// The SVG geometry as canvas paths: Path2D reads the same path data.
function drawFace(ctx: CanvasRenderingContext2D, g: FaceGeometry, x: number, y: number, size: number, ink: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / FACE_SIZE, size / FACE_SIZE);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = g.fill;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(HEAD.cx, HEAD.cy, HEAD.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2.2;
  ctx.stroke(new Path2D(g.leftBrowPath));
  ctx.stroke(new Path2D(g.rightBrowPath));
  ctx.fillStyle = ink;
  for (const eye of [g.leftEye, g.rightEye]) {
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const mouth = new Path2D(g.mouthPath);
  ctx.fill(mouth);
  ctx.stroke(mouth);
  ctx.restore();
}

// Greedy word wrap to at most maxLines; the last line is cut with an ellipsis.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((w) => w !== "");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth || line === "") {
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

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
