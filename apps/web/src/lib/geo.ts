// Wrapper do build GEO do rpic (`compileGeoJSON`, geopic). Roda DENTRO do Web
// Worker (`geo.worker.ts`): o pacote guarda UM wasm por instância de módulo e a
// escolha lean/math/geo é FIXADA no primeiro `ready()` — a thread principal já
// usa o lean ou o math (`ensureRpic`), então o geo só convive com eles num
// grafo de módulos separado (o do worker). Bônus: visitante sem fonte geo nunca
// cria o worker e nunca baixa o `rpic_wasm_geo_bg.wasm` (~665 KB).
import * as rpic from "@strategicprojects/rpic";
import type { GeoOptions, GeoResult } from "@strategicprojects/rpic";
import geoWasmUrl from "@strategicprojects/rpic/pkg/rpic_wasm_geo_bg.wasm?url";

let readyPromise: Promise<void> | null = null;

/** Carrega o build geo (idempotente). Browser/worker: a URL do asset (padrão);
 *  Node/Vitest: os bytes (`readFileSync`). Falha → limpa o slot p/ re-tentar. */
export function ensureGeo(input: string | URL | BufferSource = geoWasmUrl): Promise<void> {
  if (!readyPromise) {
    readyPromise = rpic.ready(input, { geo: true }).catch((e) => {
      readyPromise = null;
      throw e;
    });
  }
  return readyPromise;
}

/** Georreferencia a fonte. Requer `ensureGeo()`. Lança `CompileError`
 *  (`.errorInfo`), `GeoError` (`.info`) ou `Error`. */
export function compileGeo(source: string, opts: GeoOptions): GeoResult {
  return rpic.compileGeoJSON(source, opts);
}
