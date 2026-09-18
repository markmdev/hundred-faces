# hundred-faces

A browser demo of TypeSafe AI's Jev: one hundred personas react while you type.
Deployed on Vercel as a static site plus one function. Mark's global contract
applies; this file holds what is specific to this repo.

## Where truth lives

- `README.md`: what it is, the deploy shape, capacity and abuse controls, how
  to run and check it, layout.
- `log/`: dated entries, newest first. Measurements, decisions, and what was
  verified live there with their numbers. Read the newest entry before resumed work.
- `src/shared/wall.ts`: `BATCH_SIZE`, the one measured tunable. The reasoning
  and the numbers behind it live only in the log; change it with a new
  measurement (`npm run measure`) and a new log entry.
- `recordings/jev-presets.json`: Jev's real answers for the presets, the
  source for both the suite and the page, and a build input: `npm run build`
  reads it through `recordings/schema.ts`. The suite runs against it offline;
  `scripts/build-presets.ts` writes it into `public/presets/<id>.json` (generated,
  ignored by git, swept of any preset file it did not just write) before every
  build and dev session, and the page serves a preset from there instead of
  calling Jev. The recording carries a hash of the personas, the questions, the
  batch size, and the preset messages it was answered against; the loader
  refuses it when the code no longer matches, and the builder refuses a preset
  whose recorded message is not the code's, so a change to any of them means
  `npm run record` before the suite or the build passes again. The preset
  assertions in `test/wall.test.ts` are the demo's claims about its own presets.
- `server/react.ts`: the one judging handler, Web-standard, used by the Vercel
  function (`api/react.ts`) and the local server (`server/main.ts`). The wire
  contract and the message limits are in `src/shared/types.ts`; `messageTooLong`
  there is the one check the browser runs before sending and the server before judging.
- Vercel, not the repo: the project `hundred-faces`, its `TYPESAFE_API_KEY`
  for preview and production, and the firewall rate-limit rule on `/api/react`
  (60 requests a minute per IP, 429). `vercel.json` holds only the build
  command, the output directory, and the function's cancellation flag.

## Rules

- The API key is `TYPESAFE_API_KEY` in the environment and nothing else. Never
  print, log, or write it. The browser never sees it; only `api/` and `server/`
  hold the client. In Vercel it is set with `vercel env add`, piped, never on a
  command line.
- Your text goes to Jev and comes back as numbers; this site keeps none of it:
  the handler logs statuses and durations only, but the message is in the URL,
  so Vercel's request logs, the CDN cache key, and Web Analytics (query
  parameters) see it, and TypeSafe receives it.
- Jev cannot count or do arithmetic: every aggregate is computed in code.
- Every question names its persona by path and says the judgment is about that
  person, not a typical reader. Keep instructions and criteria literal and aligned.
- Personas are specific individuals with dignity, never caricatures of a group.
- No new runtime dependency without Mark's decision. Current: `@typesafe-ai/sdk`.
  Dev: `vite`, `typescript`, `@types/node`.
- Node runs the TypeScript directly (type stripping): relative imports carry
  `.ts`, and only erasable syntax is allowed (`erasableSyntaxOnly`). Vercel
  compiles `api/` with the root tsconfig; keep it free of path mappings.
- Preview deploys with `vercel`; production deploys are Mark's call.

## Verification

`npm run check` (typecheck, offline tests, build) before any report. Two build
noises are not breakage: Vite prints `<script src="/_vercel/insights/script.js">
in "/index.html" can't be bundled without type="module" attribute` (it is
Vercel's Web Analytics script, left as is; it also 404s until Web Analytics is
enabled in the dashboard), and Vercel's
function build prints `error TS2688: Cannot find type definition file for
'node'` for the root tsconfig's `types` entry; the function builds and runs
regardless. Behaviour
that touches the API or the page is verified on the real surface: `npm run
probe` against Jev, and the real flow in a real browser against a preview
deployment (type, presets, hover and tap card, clear mid-flight, a 429 and a
failed request, the share buttons, a shared link, the CDN cache HIT on a
repeated message, aggregates against per-face numbers), at desktop and phone
widths, light and dark.
