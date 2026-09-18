// Runs the API server and the Vite dev server together, so `npm run dev` is
// the whole development setup. The presets are built first so the page can
// load them. Either child exiting, or failing to start, stops the other.

import { execFileSync, spawn } from "node:child_process";

try {
  execFileSync("node", ["scripts/build-presets.ts"], { stdio: "inherit" });
} catch (err) {
  // The builder printed why; leave with its status (null when a signal killed it).
  const status = err instanceof Error && "status" in err && typeof err.status === "number" ? err.status : 1;
  process.exit(status);
}

const children = [
  spawn("node", ["--watch", "server/main.ts"], { stdio: "inherit" }),
  spawn("npx", ["vite"], { stdio: "inherit" }),
];

const stopAll = (code: number) => {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  process.exit(code);
};

for (const child of children) {
  // A child killed by a signal exits with no code; that is not a clean stop.
  child.on("exit", (code) => stopAll(code ?? 1));
  child.on("error", (err) => {
    console.error(`${child.spawnargs.join(" ")} could not start:`, err);
    stopAll(1);
  });
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
