// Local development entry point: the only local process that holds the
// TypeSafe API key, serving /api/react on loopback. Vite proxies /api here.
// In production the same handler runs as the Vercel function in api/react.ts
// and Vercel serves the built page.

import { BATCH_SIZE } from "../src/shared/wall.ts";
import { jevClient } from "./jev.ts";
import { createNodeServer } from "./node.ts";
import { react } from "./react.ts";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const client = jevClient();

createNodeServer((request) => react(request, { client })).listen(PORT, "127.0.0.1", () => {
  console.log(`hundred-faces API on http://127.0.0.1:${PORT} (model ${client.defaultModel}, batch size ${BATCH_SIZE})`);
});
