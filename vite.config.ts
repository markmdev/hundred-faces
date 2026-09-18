import { defineConfig } from "vite";

// The browser only ever talks to the Node server; in development Vite proxies
// /api there so the page and the API share an origin.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": `http://127.0.0.1:${process.env.PORT ?? 8787}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
