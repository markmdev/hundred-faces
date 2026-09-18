# A hundred faces

A wall of one hundred faces that react while you type. Each face is a specific
person (name, age, job, where they live, temperament, what they care about, how
they read), and every keystroke sends the message to TypeSafe AI's Jev with four
questions per person: which of seven reactions they have (a Choice), and whether
they understand it, trust it, and would share it (three Nouls). The face is drawn
from the whole reaction distribution, not just the winner, so a face that is 60%
confused and 40% annoyed looks like that. Hover a face for the person and their
numbers. The aggregates above the grid are computed in code from the per-face
answers.

## Run it

Needs Node 24 and `TYPESAFE_API_KEY` in the environment (the server reads it;
the browser never sees it).

```sh
npm install
npm run dev        # API server on :8787 and Vite on :5173, one command
```

Open http://localhost:5173/ and type, or click a preset.

Production shape, one process serving the built page and the API:

```sh
npm run build
npm start          # http://localhost:8787
```

## Check it

```sh
npm run check      # typecheck + tests
npm test           # tests only; offline, against test/fixtures/jev-presets.json
npm run record     # re-record the fixture from the real API (after changing personas, questions, or presets)
npm run measure    # batching measurement against the real API; see log/ for the numbers
npm run probe      # movement, spread, self-consistency, and sanity probes against the real API
```

Tests use Node's built-in runner and run with no network. `test/server.test.ts`
is the contract test: the server with a fixture-backed fake client on one side,
the browser's `fetchWall` on the other, one recorded fixture between them.

## Layout

```
index.html               the page
src/client/              browser code: main.ts (update loop), faces.ts (SVG wall), tooltip.ts, api.ts
src/shared/              pure modules used by both sides
  personas.ts            the hundred people
  reactions.ts           the seven reactions, their contrastive descriptions, and face parameters
  questions.ts           builds the Jev request for a batch and reads the answers
  wall.ts                one wall update: batches, parallel calls, BATCH_SIZE
  face.ts                blend a distribution into face parameters and SVG geometry
  aggregate.ts           wall-level numbers
  presets.ts             the preset messages
  types.ts               the /api/react wire contract
server/                  app.ts (routes, testable), main.ts (holds the key, listens)
scripts/                 dev.ts, measure-batching.ts, record-fixture.ts, probe.ts
test/                    tests, the fixture-backed fake client, test/fixtures/jev-presets.json
```

## How a wall update works

1. The browser debounces input by 250 ms and posts `{ message }` to `/api/react`,
   allowing two requests in flight; a response older than the one on screen is
   discarded by sequence number.
2. The server splits the hundred personas into batches of `BATCH_SIZE` (5),
   builds one Jev request per batch with state `{ message, personas: [...] }` and
   four questions per persona addressed by path (`personas[3]`), and fires the
   batches in parallel.
3. Answers come back as probabilities; the browser blends the seven reaction
   probabilities into mouth, brow, eye, and tint parameters and tweens each face
   there over 180 ms.

Why five per call: measured on 2026-09-17 (details in `log/2026-09-17.md`).
Answers drift from the one-persona-per-call baseline as the batch grows, because
the other personas in the state are irrelevant to each question. Five keeps that
drift flat across positions and the wall as varied as the baseline, at the same
latency as ten (~420 ms p50). One hundred in one call exceeds Jev's 64k-token
context.

## Not in v1

Per-face explanations, editing personas in the page, saving sessions, any
generative model.
