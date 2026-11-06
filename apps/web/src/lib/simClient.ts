// Cliente do worker de simulação (thread principal). Um worker vivo entre
// execuções (o wasm carrega uma vez); Cancelar = `terminate()` — a próxima
// execução cria um worker novo (e recarrega o wasm, do cache HTTP).
import type { PicSimOptions } from "./dune";
import type { SimRequest, SimResponse } from "./simProtocol";

/** O subconjunto de `Worker` que usamos (os testes injetam um falso). */
export interface WorkerLike {
  postMessage(msg: SimRequest): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<SimResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

/** Worker real. O `new URL(…, import.meta.url)` literal é o que o Vite
 *  reconhece para empacotar o worker (e o `.wasm` `?url` que ele importa). */
export const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL("./dune.worker.ts", import.meta.url), {
    type: "module",
    name: "dune-sim",
  }) as unknown as WorkerLike;

export class SimCancelled extends Error {
  constructor() {
    super("simulation cancelled");
    this.name = "SimCancelled";
  }
}

export class SimClient {
  private worker: WorkerLike | null = null;
  private seq = 0;
  private pending: {
    id: number;
    resolve: (r: SimResponse) => void;
    reject: (e: unknown) => void;
  } | null = null;

  constructor(private readonly factory: WorkerFactory = defaultWorkerFactory) {}

  /** Há uma simulação em curso? */
  get busy(): boolean {
    return this.pending !== null;
  }

  /** Simula `source` no worker. Uma por vez: um `run` novo cancela o anterior. */
  run(source: string, opts?: PicSimOptions): Promise<SimResponse> {
    if (this.pending) this.cancel();
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<SimResponse>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      worker.postMessage({ type: "run", id, source, ...(opts ? { opts } : {}) });
    });
  }

  /** Interrompe a simulação em curso (mata o worker). */
  cancel(): void {
    const p = this.pending;
    this.pending = null;
    this.killWorker();
    p?.reject(new SimCancelled());
  }

  /** Libera o worker (unmount do painel). */
  dispose(): void {
    this.cancel();
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const w = this.factory();
    w.onmessage = (e) => {
      const p = this.pending;
      if (!p || e.data?.id !== p.id) return; // resposta de execução já descartada
      this.pending = null;
      p.resolve(e.data);
    };
    w.onerror = (e) => {
      // falha fora do protocolo (ex.: o módulo do worker não carregou)
      const p = this.pending;
      this.pending = null;
      this.killWorker();
      p?.reject(new Error(e.message || "simulation worker failed"));
    };
    this.worker = w;
    return w;
  }

  private killWorker(): void {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
}
