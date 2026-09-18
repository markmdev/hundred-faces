// The card for one face: who they are, their seven-way reaction distribution,
// and the three yes/no probabilities. Beside the face on a pointer device, a
// sheet along the bottom of the screen on touch.

import { rgbCss } from "../shared/face.ts";
import type { Persona } from "../shared/personas.ts";
import { NOULS, type FaceAnswer } from "../shared/questions.ts";
import { percentages, REACTION_FACES, REACTIONS } from "../shared/reactions.ts";
import { barRow } from "./bars.ts";

export class Tooltip {
  readonly #el: HTMLElement;

  constructor(el: HTMLElement) {
    this.#el = el;
  }

  show(persona: Persona, answer: FaceAnswer | undefined, anchor: DOMRect, sheet = false): void {
    this.#el.replaceChildren(...render(persona, answer));
    this.#el.classList.toggle("sheet", sheet);
    this.#el.hidden = false;
    if (sheet) {
      this.#el.style.left = "";
      this.#el.style.top = "";
      return;
    }
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
  const pct = percentages(answer.reaction);
  for (const name of REACTIONS) {
    const row = barRow(name, rgbCss(REACTION_FACES[name].tint));
    row.set(pct[name] / 100, `${pct[name]}%`);
    reactions.append(row.root);
  }

  const nouls = document.createElement("div");
  nouls.className = "bars";
  for (const { id, label } of NOULS) {
    const row = barRow(label);
    row.set(answer[id], `${Math.round(answer[id] * 100)}%`);
    nouls.append(row.root);
  }

  return [title, bio, reactions, nouls];
}
