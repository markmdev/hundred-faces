# A hundred faces

A wall of one hundred faces that react while you type. Each face is an
authored profile of one specific person (name, age, job, where they live,
temperament, what they care about, how they read), and each pause in typing
(250 ms) sends the message to TypeSafe AI's Jev with four questions per person:
which of seven reactions they have (a Choice, answered with a probability
distribution over the options), and whether they understand it, trust it, and
would share it (three Nouls; a Noul is a yes/no question answered with a
probability). The reactions are Jev's estimates of how each written person
would take the message. The face is drawn from the whole reaction distribution,
not just the winner, so a face that is 60% confused and 40% annoyed looks like
that. Hover a face for the person and their numbers. The aggregates above the
grid are computed in code from the per-face answers: the reaction mix is the
mean distribution, and the understands, trusts, and would-share counts are the
people whose probability is above 50%.

## Run it

Needs Node 24 and `TYPESAFE_API_KEY` in the environment (the server reads it;
the browser never sees it). The API server listens on loopback only, on port
8787; `PORT` overrides it for both the server and Vite's proxy.

```sh
npm install
npm run dev        # API server and Vite together; open http://localhost:5173/
```

Production shape, one process serving the built page and the API on the same
port:

```sh
npm run build
npm start
```

## Check it

```sh
npm run check      # typecheck + tests + build
npm test           # tests only; offline, against test/fixtures/jev-presets.json
npm run record     # re-record the fixture from the real API (after changing personas, questions, batch size, or presets)
npm run measure    # batching measurement against the real API; see log/ for the numbers
npm run probe      # movement, spread, self-consistency, and sanity probes against the real API
```

Tests use Node's built-in runner and run with no network. `test/server.test.ts`
is the contract test: the server with a fixture-backed fake client on one side,
the browser's `fetchWall` on the other, one recorded fixture between them. The
fixture carries a hash of the personas, questions, and batch size it was
recorded against, and the loader refuses a fixture whose hash no longer matches
the code, so the suite cannot pass on stale answers.

## Layout

```
index.html               the page
src/client/              browser code: main.ts (update loop), faces.ts (SVG wall), tooltip.ts (hover card), bars.ts (one labelled bar), api.ts
src/shared/              pure modules used by both sides
  personas.ts            the hundred people
  reactions.ts           the seven reactions, their contrastive descriptions, face parameters, and distribution helpers
  questions.ts           the three nouls, the Jev request for a batch, and reading the answers back
  wall.ts                one wall update: batches, parallel calls, BATCH_SIZE
  face.ts                blend a distribution into face parameters and SVG geometry
  aggregate.ts           wall-level numbers
  presets.ts             the preset messages
  types.ts               the /api/react wire contract and the message limit
server/                  app.ts (routes, testable), main.ts (holds the key, listens on loopback)
scripts/                 dev.ts, measure-batching.ts, record-fixture.ts, probe.ts, stats.ts
test/                    tests; fixtures/schema.ts (fixture shape, loader, request hash) and fixtures/jev-presets.json; helpers/fixture-client.ts
```

## How a wall update works

1. The browser waits for a 250 ms pause in typing, then posts `{ message }` to
   `/api/react`, allowing two requests in flight; text typed while both are out
   waits for one to settle. Whatever lands with a newer sequence than the wall
   shows becomes the wall, success or failure; an older response is ignored. A
   superseded request still runs to completion on the server: aborting it would
   save some Jev calls, but letting it land is what keeps the faces moving while
   someone is still typing, and that effect is worth the cost. Clearing the box
   takes effect at once and aborts everything in flight, which is what tells the
   server to cancel its Jev calls.
2. The server splits the hundred personas into batches of `BATCH_SIZE`, builds
   one Jev request per batch with state `{ message, personas: [...] }` and four
   questions per persona addressed by path (`personas[3]`), and fires the
   batches in parallel. Why five per call is measured and explained in
   `log/2026-09-17.md`.
3. Answers come back as probabilities, about half a second after the request
   left; the browser blends the seven reaction probabilities into mouth, brow,
   eye, and tint parameters and tweens each face there over 180 ms.

## Not in v1

Per-face explanations, editing personas in the page, saving sessions, any
generative model.
