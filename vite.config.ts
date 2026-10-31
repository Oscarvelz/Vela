import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Served from https://oscarvelz.github.io/Vela/ — the built site goes to docs/.
export default defineConfig({
  base: "/Vela/",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [tailwindcss(), react()],
  build: { outDir: "docs", emptyOutDir: true, chunkSizeWarningLimit: 2000, sourcemap: false },
});
