// Cliente do worker geo (thread principal). Um worker vivo (o wasm carrega uma
// vez); só a resposta do pedido MAIS RECENTE resolve — as anteriores viram
// `null` (a edição já andou). Compilar é rápido (ms), então não há cancelamento.
import type { GeoRequest, GeoResponse } from "./geoProtocol";

/** O subconjunto de `Worker` que usamos (os testes injetam um falso). */
export interface GeoWorkerLike {
  postMessage(msg: GeoRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<GeoResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type GeoWorkerFactory = () => GeoWorkerLike;

/** Worker real — o `new URL(…, import.meta.url)` literal é o que o Vite empacota. */
export const defaultGeoWorkerFactory: GeoWorkerFactory = () =>
  new Worker(new URL("./geo.worker.ts", import.meta.url), {
    type: "module",
    name: "rpic-geo",
  }) as unknown as GeoWorkerLike;

export class GeoClient {
  private worker: GeoWorkerLike | null = null;
  private seq = 0;
  private waiting = new Map<number, (r: GeoResponse | null) => void>();

  constructor(private readonly factory: GeoWorkerFactory = defaultGeoWorkerFactory) {}

  /** Georreferencia `source`; resolve `null` se um pedido mais novo chegou antes. */
  run(source: string, opts: GeoRequest["opts"]): Promise<GeoResponse | null> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      worker.postMessage({ type: "geo", id, source, opts });
    });
  }

  dispose(): void {
    this.flush(null);
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }

  private flush(r: GeoResponse | null): void {
    for (const resolve of this.waiting.values()) resolve(r);
    this.waiting.clear();
  }

  private ensureWorker(): GeoWorkerLike {
    if (this.worker) return this.worker;
    const w = this.factory();
    w.onmessage = (e) => {
      const id = e.data?.id;
      const resolve = this.waiting.get(id);
      if (!resolve) return;
      this.waiting.delete(id);
      // respostas mais velhas que esta não interessam mais
      for (const [other, res] of this.waiting) {
        if (other < id) {
          this.waiting.delete(other);
          res(null);
        }
      }
      resolve(id === this.seq ? e.data : null);
    };
    w.onerror = (e) => {
      // falha fora do protocolo (ex.: o módulo do worker não carregou): o
      // pedido mais recente recebe um erro; o próximo `run` cria outro worker
      const id = this.seq;
      const resolve = this.waiting.get(id);
      this.waiting.delete(id);
      this.dispose();
      resolve?.({
        type: "error",
        id,
        error: { kind: "other", message: e.message || "geo worker failed" },
      });
    };
    this.worker = w;
    return w;
  }
}
