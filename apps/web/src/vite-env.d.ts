/// <reference types="vite/client" />

// O asset .wasm importado com `?url` vira uma URL string no build do Vite.
declare module "@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm?url" {
  const src: string;
  export default src;
}
