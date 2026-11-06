import { defineConfig } from "vitest/config";
import { searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";

// Versões injetadas no build (rodapé do app): a do studio (este package) e a do
// motor rpic (o WASM instalado). Lidas dos package.json, não hardcoded. O
// package do rpic não expõe `./package.json` nos exports, então chegamos ao
// diretório dele por um subpath exportado (o .wasm) e subimos até a raiz.
const require = createRequire(import.meta.url);
const readVersion = (pkgJsonPath: string): string =>
  JSON.parse(readFileSync(pkgJsonPath, "utf8")).version;
const rpicRoot = dirname(dirname(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm")));
const appVersion = readVersion(fileURLToPath(new URL("./package.json", import.meta.url)));
const rpicVersion = readVersion(join(rpicRoot, "package.json"));
// O simulador dune (`@strategicprojects/dune-sim`) vem do npm.

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __RPIC_VERSION__: JSON.stringify(rpicVersion),
  },
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
  // O worker da simulação (lib/dune.worker.ts) importa módulos ES + o .wasm `?url`.
  worker: { format: "es" },
  server: {
    port: 5173,
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
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
