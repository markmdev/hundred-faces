// Entry point: the only process that holds the TypeSafe API key. Reads
// TYPESAFE_API_KEY from the environment (the SDK refuses to start without it),
// serves /api on loopback, and in production serves the built front end from
// dist/.

import { resolve } from "node:path";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { BATCH_SIZE } from "../src/shared/wall.ts";
import { createApp } from "./app.ts";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const distDir = process.env.NODE_ENV === "production" ? resolve(import.meta.dirname, "..", "dist") : null;

const client = new TypeSafeClient({ timeout: 20_000 });
const app = createApp({ client, distDir });

app.listen(PORT, "127.0.0.1", () => {
  console.log(`hundred-faces on http://127.0.0.1:${PORT} (model ${client.defaultModel}, batch size ${BATCH_SIZE}${distDir ? `, serving ${distDir}` : ", API only"})`);
});
