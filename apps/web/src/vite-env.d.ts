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

// Injetadas por `define` no vite.config.ts (rodapé do app).
declare const __APP_VERSION__: string;
declare const __RPIC_VERSION__: string;
