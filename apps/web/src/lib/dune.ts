// Wrapper fino sobre o simulador dune (WASM, `@strategicprojects/dune-sim`).
// Espelha `ensureRpic()`: init idempotente, o `.wasm` entra como asset `?url`,
// e uma falha de carga NÃO fica cacheada (nova chamada tenta de novo).
//
// IMPORTANTE: este módulo roda DENTRO do Web Worker (`dune.worker.ts`) — a
// simulação vai até o fim na thread que a chama (o wasm não se interrompe
// sozinho), então só o worker pode ser terminado pelo botão Cancelar. A thread
// principal importa daqui apenas TIPOS e as funções puras (sem tocar o wasm).
import * as dune from "@strategicprojects/dune-sim";
import type {
  Diagnostic as SimDiagnostic,
  OverlayMap,
  PicExtraction,
  PicRun,
  PicSimOptions,
  Plot,
  SimError,
} from "@strategicprojects/dune-sim";
import wasmUrl from "@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm?url";

let readyPromise: Promise<void> | null = null;

/** Carrega o WASM do dune (idempotente). Browser/worker: URL do asset (padrão);
 *  Node/Vitest: os bytes (`readFileSync`). Falha → limpa o slot p/ re-tentar. */
export function ensureDune(input: string | URL | BufferSource = wasmUrl): Promise<void> {
  if (!readyPromise) {
    readyPromise = dune.ready(input).catch((e) => {
      readyPromise = null;
      throw e;
    });
  }
  return readyPromise;
}

/** Extrai o deck da figura e simula. Requer `ensureDune()` resolvido. */
export function simulatePic(source: string, opts?: PicSimOptions): PicRun {
  return dune.simulatePic(source, opts);
}

/** SVG da figura compilada pelo rpic INTERNO do dune com o prelude — a MESMA
 *  compilação que o `map` do extrator indexa: os `<g id="sN">` batem com
 *  `elements[].shapes`/`nets[].shapes` qualquer que seja o rpic do Studio
 *  (aceita as linhas `.tran`/`.ac`…, que o rpic 0.11 do Studio rejeita).
 *  Lança `SimError` kind `pic` (um diagnóstico `compile`) se o rpic rejeitar. */
export function renderPic(source: string): string {
  return dune.renderPic(source);
}

export type { OverlayMap, PicExtraction, PicRun, PicSimOptions, Plot, SimDiagnostic, SimError };
