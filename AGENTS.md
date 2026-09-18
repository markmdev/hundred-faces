# hundred-faces

A browser demo of TypeSafe AI's Jev: one hundred personas react while you type.
Mark's global contract applies; this file holds what is specific to this repo.

## Where truth lives

- `README.md`: what it is, how to run and check it, layout.
- `log/`: dated entries, newest first. Measurements, decisions, and what was
  verified live there with their numbers. Read the newest entry before resumed work.
- `src/shared/wall.ts`: `BATCH_SIZE`, the one measured tunable. The reasoning
  and the numbers behind it live only in the log; change it with a new
  measurement (`npm run measure`) and a new log entry.
- `test/fixtures/jev-presets.json`: Jev's real answers for the presets. The
  suite runs against it offline. The fixture carries a hash of the personas,
  the questions, and the batch size it was recorded against, and the loader
  refuses to serve it when the code no longer matches, so a change to any of
  them means `npm run record` before the suite passes again. The preset
  assertions in `test/wall.test.ts` are the demo's claims about its own presets.

## Rules

- The API key is `TYPESAFE_API_KEY` in the environment and nothing else. Never
  print, log, or write it. The browser never sees it; only `server/` calls Jev.
- Jev cannot count or do arithmetic: every aggregate is computed in code.
- Every question names its persona by path and says the judgment is about that
  person, not a typical reader. Keep instructions and criteria literal and aligned.
- Personas are specific individuals with dignity, never caricatures of a group.
- No new runtime dependency without Mark's decision. Current: `@typesafe-ai/sdk`.
  Dev: `vite`, `typescript`, `@types/node`.
- Node runs the TypeScript directly (type stripping): relative imports carry
  `.ts`, and only erasable syntax is allowed (`erasableSyntaxOnly`).

## Verification

`npm run check` (typecheck, offline tests, build) before any report. Behaviour
that touches the API or the page is verified on the real surface: `npm run
probe` against Jev, and the real flow in a real browser (type, presets, hover,
clear mid-flight, a failed request, aggregates against per-face numbers).
