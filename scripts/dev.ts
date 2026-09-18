// Runs the API server and the Vite dev server together, so `npm run dev` is
// the whole development setup. Either child exiting, or failing to start,
// stops the other.

import { spawn } from "node:child_process";

const children = [
  spawn("node", ["--watch", "server/main.ts"], { stdio: "inherit" }),
  spawn("npx", ["vite"], { stdio: "inherit" }),
];

const stopAll = (code: number) => {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  process.exit(code);
};

for (const child of children) {
  child.on("exit", (code) => stopAll(code ?? 0));
  child.on("error", (err) => {
    console.error(`${child.spawnargs.join(" ")} could not start:`, err);
    stopAll(1);
  });
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
