import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../previews/win11-final");
// The shared world model and seed are vendored into src by src/ocean/sync-world-model.mjs
// (npm prebuild) and bundled, so standalone mode applies intents like the parent.

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "./",
  define: {
    "process.env.NODE_ENV": `"${mode}"`,
  },
  build: {
    outDir,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
}));
