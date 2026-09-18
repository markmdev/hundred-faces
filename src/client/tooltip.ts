// The hover card for one face: who they are, their seven-way reaction
// distribution, and the three yes/no probabilities.

import type { Persona } from "../shared/personas.ts";
import type { FaceAnswer } from "../shared/questions.ts";
import { REACTION_FACES, REACTIONS } from "../shared/reactions.ts";

export function tintCss(name: (typeof REACTIONS)[number]): string {
  const [r, g, b] = REACTION_FACES[name].tint;
  return `rgb(${r}, ${g}, ${b})`;
}

export class Tooltip {
  readonly #el: HTMLElement;

  constructor(el: HTMLElement) {
    this.#el = el;
  }

  show(persona: Persona, answer: FaceAnswer | undefined, anchor: DOMRect): void {
    this.#el.replaceChildren(...render(persona, answer));
    this.#el.hidden = false;
    // Below the face when there is room, otherwise above; kept inside the viewport horizontally.
    const width = this.#el.offsetWidth;
    const height = this.#el.offsetHeight;
    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(12, Math.min(window.innerWidth - width - 12, left));
    let top = anchor.bottom + 8;
    if (top + height > window.innerHeight - 8) top = anchor.top - height - 8;
    this.#el.style.left = `${Math.round(left)}px`;
    this.#el.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  hide(): void {
    this.#el.hidden = true;
  }
}

function render(persona: Persona, answer: FaceAnswer | undefined): Node[] {
  const title = document.createElement("h2");
  title.textContent = `${persona.name}, ${persona.age}`;

  const bio = document.createElement("p");
  bio.className = "bio";
  for (const line of [
    `${persona.job}, ${persona.lives_in}`,
    `Temperament: ${persona.temperament}`,
    `Cares about: ${persona.cares_about}`,
    `Reads: ${persona.how_they_read}`,
  ]) {
    const span = document.createElement("span");
    span.textContent = line;
    bio.append(span);
  }

  if (!answer) {
    const note = document.createElement("p");
    note.className = "bio";
    note.textContent = "No message yet.";
    return [title, bio, note];
  }

  const reactions = document.createElement("div");
  reactions.className = "bars";
  for (const name of REACTIONS) {
    reactions.append(...bar(name, answer.reaction[name], tintCss(name)));
  }

  const nouls = document.createElement("div");
  nouls.className = "bars nouls-mini";
  nouls.append(...bar("understands", answer.understands), ...bar("trusts", answer.trusts), ...bar("would share", answer.shares));

  return [title, bio, reactions, nouls];
}

function bar(label: string, value: number, color?: string): Node[] {
  const name = document.createElement("span");
  name.textContent = label;
  const track = document.createElement("div");
  track.className = "track";
  const fill = document.createElement("span");
  fill.style.width = `${Math.round(value * 100)}%`;
  if (color) fill.style.background = color;
  track.append(fill);
  const num = document.createElement("b");
  num.textContent = `${Math.round(value * 100)}%`;
  return [name, track, num];
}
