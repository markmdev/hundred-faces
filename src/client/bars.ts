// One labelled bar: a label, a track with a fill, and a value. The summary
// panel keeps its rows and updates them on every wall update; the hover card
// builds fresh ones each time it opens.

export interface BarRow {
  readonly root: HTMLElement;
  set(fraction: number, text: string): void;
}

export function barRow(label: string, color?: string): BarRow {
  const root = document.createElement("div");
  root.className = "bar";
  const name = document.createElement("span");
  name.textContent = label;
  const track = document.createElement("div");
  track.className = "track";
  const fill = document.createElement("span");
  if (color) fill.style.background = color;
  track.append(fill);
  const value = document.createElement("b");
  root.append(name, track, value);
  const row: BarRow = {
    root,
    set(fraction, text) {
      fill.style.width = `${fraction * 100}%`;
      value.textContent = text;
    },
  };
  row.set(0, "–");
  return row;
}
