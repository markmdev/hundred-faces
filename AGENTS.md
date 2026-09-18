# hundred-faces

A browser demo of TypeSafe AI's Jev: one hundred personas react while you type.
Mark's global contract applies; this file holds what is specific to this repo.

## Where truth lives

- `README.md`: what it is, how to run and check it, layout.
- `log/`: dated entries, newest first. Measurements, decisions, and what was
  verified live there with their numbers. Read the newest entry before resumed work.
- `src/shared/wall.ts`: `BATCH_SIZE`, the one measured tunable. Change it only
  with a new measurement (`npm run measure`) and a log entry.
- `test/fixtures/jev-presets.json`: Jev's real answers for the presets. The
  suite runs against it offline. Re-record (`npm run record`) after changing
  personas, question wording, or presets, and re-run the suite; the preset
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

`npm run check` (typecheck + offline tests) before any report. Behaviour that
touches the API or the page is verified on the real surface: `npm run probe`
against Jev, and the real flow in a real browser (type, presets, hover,
aggregates against per-face numbers).
