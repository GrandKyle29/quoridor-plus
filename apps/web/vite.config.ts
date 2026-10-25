import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Tell Vite to watch the engine package for changes
      ignored: ["!**/node_modules/@quoridor/engine/**"],
    },
  },
  optimizeDeps: {
    // Stop Vite from pre-bundling the engine so it always reads the live code
    exclude: ["@quoridor/engine"],
  },
});
