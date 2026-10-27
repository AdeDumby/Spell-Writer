import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" is required so the built index.html works when Electron loads it from disk.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist" },
});
