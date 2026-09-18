// The hundred SVG faces on the wall: built once, then re-drawn from
// parameters. An update animates every face from its current parameters to
// the new blend over one short tween.

import { blendFace, FACE_SIZE, faceGeometry, HEAD, lerpFace } from "../shared/face.ts";
import type { Persona } from "../shared/personas.ts";
import { REACTION_FACES, type FaceParams, type ReactionDistribution } from "../shared/reactions.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const TWEEN_MS = 180;

// The face shown before any message: a neutral expression.
export const RESTING_PARAMS: FaceParams = REACTION_FACES.neutral;

interface FaceNode {
  root: HTMLButtonElement;
  head: SVGCircleElement;
  leftBrow: SVGPathElement;
  rightBrow: SVGPathElement;
  leftEye: SVGEllipseElement;
  rightEye: SVGEllipseElement;
  mouth: SVGPathElement;
  current: FaceParams;
  from: FaceParams;
  to: FaceParams;
}

export class FaceWall {
  readonly #faces: FaceNode[] = [];
  #tweenStart = 0;
  #tweenHandle = 0;

  constructor(container: HTMLElement, personas: readonly Persona[]) {
    personas.forEach((persona, index) => {
      const root = document.createElement("button");
      root.type = "button";
      root.className = "face";
      root.dataset.index = String(index);
      root.setAttribute("aria-label", `${persona.name}, ${persona.age}, ${persona.job}`);

      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${FACE_SIZE} ${FACE_SIZE}`);
      svg.setAttribute("aria-hidden", "true");

      const head = document.createElementNS(SVG_NS, "circle");
      head.setAttribute("class", "head");
      head.setAttribute("cx", String(HEAD.cx));
      head.setAttribute("cy", String(HEAD.cy));
      head.setAttribute("r", String(HEAD.r));

      const leftBrow = path("brow");
      const rightBrow = path("brow");
      const leftEye = document.createElementNS(SVG_NS, "ellipse");
      leftEye.setAttribute("class", "eye");
      const rightEye = document.createElementNS(SVG_NS, "ellipse");
      rightEye.setAttribute("class", "eye");
      const mouth = path("mouth");

      svg.append(head, leftBrow, rightBrow, leftEye, rightEye, mouth);
      root.append(svg);
      container.append(root);

      const node: FaceNode = { root, head, leftBrow, rightBrow, leftEye, rightEye, mouth, current: RESTING_PARAMS, from: RESTING_PARAMS, to: RESTING_PARAMS };
      this.#faces.push(node);
      this.#draw(node, RESTING_PARAMS);
    });
  }

  get size(): number {
    return this.#faces.length;
  }

  // Set every face's target from a list of distributions (one per face, in
  // wall order) and tween there.
  show(distributions: readonly ReactionDistribution[]): void {
    if (distributions.length !== this.#faces.length) {
      throw new Error(`expected ${this.#faces.length} distributions, got ${distributions.length}`);
    }
    this.#retarget((i) => blendFace(distributions[i]!));
  }

  rest(): void {
    this.#retarget(() => RESTING_PARAMS);
  }

  #retarget(target: (index: number) => FaceParams): void {
    this.#faces.forEach((node, i) => {
      node.from = node.current;
      node.to = target(i);
    });
    cancelAnimationFrame(this.#tweenHandle);
    this.#tweenStart = performance.now();
    const step = (now: number) => {
      // The first frame's timestamp can precede the performance.now() taken above.
      const t = Math.min(1, Math.max(0, (now - this.#tweenStart) / TWEEN_MS));
      for (const node of this.#faces) {
        node.current = t >= 1 ? node.to : lerpFace(node.from, node.to, t);
        this.#draw(node, node.current);
      }
      if (t < 1) this.#tweenHandle = requestAnimationFrame(step);
    };
    this.#tweenHandle = requestAnimationFrame(step);
  }

  #draw(node: FaceNode, params: FaceParams): void {
    const g = faceGeometry(params);
    node.head.setAttribute("fill", g.fill);
    node.leftBrow.setAttribute("d", g.leftBrowPath);
    node.rightBrow.setAttribute("d", g.rightBrowPath);
    node.mouth.setAttribute("d", g.mouthPath);
    setEllipse(node.leftEye, g.leftEye);
    setEllipse(node.rightEye, g.rightEye);
  }
}

function path(className: string): SVGPathElement {
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("class", className);
  return el;
}

function setEllipse(el: SVGEllipseElement, e: { cx: number; cy: number; rx: number; ry: number }): void {
  el.setAttribute("cx", String(e.cx));
  el.setAttribute("cy", String(e.cy));
  el.setAttribute("rx", String(e.rx));
  el.setAttribute("ry", String(e.ry));
}
