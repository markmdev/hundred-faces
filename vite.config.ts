import { defineConfig } from "vite";

// The browser only ever talks to the Node server; in development Vite proxies
// /api there so the page and the API share an origin.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
