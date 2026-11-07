/// <reference types="vite/client" />

// Os assets .wasm importados com `?url` viram URL string no build do Vite.
declare module "@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm?url" {
  const src: string;
  export default src;
}
declare module "@strategicprojects/rpic/pkg/rpic_wasm_math_bg.wasm?url" {
  const src: string;
  export default src;
}

declare module "@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm?url" {
  const src: string;
  export default src;
}

// Texto do prelude pic do dune, extraído no build (plugin `dunePrelude` no vite.config.ts).
declare module "virtual:dune-prelude" {
  const prelude: string;
  export default prelude;
}

// Injetadas por `define` no vite.config.ts (rodapé do app).
declare const __APP_VERSION__: string;
declare const __RPIC_VERSION__: string;
