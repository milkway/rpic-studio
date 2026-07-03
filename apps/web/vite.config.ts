import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // base path: "/" na raiz ou "/rpic/" sob subcaminho (definido no build).
  base: process.env.BASE_PATH ?? "/",
  // Lê o .env único da raiz do monorepo.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  // cast: vitest empacota sua própria versão do vite (tipos de plugin divergem)
  plugins: [react(), tailwindcss()] as never,
  resolve: {
    // Aliases exatos (regex): "@rpic/design-system/tokens.css" continua
    // resolvendo pelos exports do package do workspace.
    alias: [
      {
        find: /^@rpic\/design-system$/,
        replacement: fileURLToPath(
          new URL("../../packages/design-system/src/index.ts", import.meta.url),
        ),
      },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Separa o editor (CodeMirror) e o vendor para melhor cache.
        manualChunks(id: string) {
          if (id.includes("@codemirror") || id.includes("@lezer")) return "editor";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Em dev, encaminha /api e /health para a API Rust (cookie first-party).
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/health": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
