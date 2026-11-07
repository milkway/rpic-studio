// Cliente do worker de simulação (thread principal). Um worker vivo entre
// execuções (o wasm carrega uma vez e a `Session` do circuito fica lá);
// Cancelar = `terminate()` — a próxima execução cria um worker novo (e
// recarrega o wasm, do cache HTTP, e reabre a sessão).
import type { PicSimOptions } from "./dune";
import type { SimAdopt, SimRequest, SimResponse } from "./simProtocol";
import type { Alters } from "./simValues";

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

/** Um re-run enfileirado foi substituído por outro mais novo antes de sair. */
export class SimSuperseded extends Error {
  constructor() {
    super("re-run superseded");
    this.name = "SimSuperseded";
  }
}

export interface RunInput {
  source: string;
  opts?: PicSimOptions;
  alters?: Alters;
  adopt?: readonly SimAdopt[];
}

interface Waiter {
  resolve: (r: SimResponse) => void;
  reject: (e: unknown) => void;
}

export class SimClient {
  private worker: WorkerLike | null = null;
  private seq = 0;
  private pending: (Waiter & { id: number }) | null = null;
  /** Re-run à espera do worker ficar livre (o mais novo vence). */
  private queued: (Waiter & { input: RunInput }) | null = null;

  constructor(private readonly factory: WorkerFactory = defaultWorkerFactory) {}

  /** Há uma simulação em curso? */
  get busy(): boolean {
    return this.pending !== null;
  }

  /** Execução nova (botão Simular): cancela a em curso — mata o worker. */
  run(input: RunInput): Promise<SimResponse> {
    if (this.pending) this.cancel();
    return this.send(input);
  }

  /** Re-run de slider: NUNCA mata o worker (isso jogaria fora o wasm e a
   *  sessão). Com o worker ocupado, espera numa fila de UM lugar — um pedido
   *  mais novo substitui o enfileirado (que rejeita com `SimSuperseded`). */
  rerun(input: RunInput): Promise<SimResponse> {
    if (!this.pending) return this.send(input);
    this.queued?.reject(new SimSuperseded());
    return new Promise<SimResponse>((resolve, reject) => {
      this.queued = { input, resolve, reject };
    });
  }

  /** Interrompe a simulação em curso (mata o worker) e descarta a fila. */
  cancel(): void {
    const p = this.pending;
    const q = this.queued;
    this.pending = null;
    this.queued = null;
    this.killWorker();
    p?.reject(new SimCancelled());
    q?.reject(new SimCancelled());
  }

  /** Libera o worker (unmount do painel). */
  dispose(): void {
    this.cancel();
  }

  private send(input: RunInput): Promise<SimResponse> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<SimResponse>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      const msg: SimRequest = { type: "run", id, source: input.source };
      if (input.opts) msg.opts = input.opts;
      if (input.alters) msg.alters = input.alters;
      if (input.adopt) msg.adopt = input.adopt;
      worker.postMessage(msg);
    });
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const w = this.factory();
    w.onmessage = (e) => {
      const p = this.pending;
      if (!p || e.data?.id !== p.id) return; // resposta de execução já descartada
      this.pending = null;
      // despacha a fila ANTES de resolver: quem aguarda vê `busy` correto
      const q = this.queued;
      this.queued = null;
      if (q) this.send(q.input).then(q.resolve, q.reject);
      p.resolve(e.data);
    };
    w.onerror = (e) => {
      // falha fora do protocolo (ex.: o módulo do worker não carregou)
      const p = this.pending;
      const q = this.queued;
      this.pending = null;
      this.queued = null;
      this.killWorker();
      const err = new Error(e.message || "simulation worker failed");
      p?.reject(err);
      q?.reject(err);
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
