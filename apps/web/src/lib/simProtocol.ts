// Protocolo de mensagens UI ↔ worker de simulação. Puro (sem DOM, sem wasm):
// o worker só liga `handleSimRequest` ao `onmessage`; os testes chamam o mesmo
// handler com o dune REAL em Node.
import type { PicExtraction, PicRun, PicSimOptions, SimDiagnostic } from "./dune";

export interface SimRequest {
  type: "run";
  id: number;
  source: string;
  opts?: PicSimOptions;
}

/** Erro do simulador já serializável (um `Error` perde `kind`/`diagnostics`
 *  no structured clone do postMessage). */
export interface SimFailure {
  message: string;
  /** `pic` | `options` | `parse` | `elaborate` | `analysis` | `internal` | `load`. */
  kind: string;
  diagnostics: SimDiagnostic[];
  /** Extração (netlist incluso) quando o erro veio depois dela. */
  pic?: PicExtraction;
}

export type SimResponse =
  | { type: "ok"; id: number; run: PicRun; prelude: string; ms: number }
  | { type: "error"; id: number; error: SimFailure; prelude: string | null; ms: number };

export interface SimApi {
  ensure: () => Promise<void>;
  simulatePic: (source: string, opts?: PicSimOptions) => PicRun;
  prelude: () => string;
}

export function toSimFailure(e: unknown, fallbackKind = "internal"): SimFailure {
  const err = e as Partial<SimFailure> & { message?: unknown };
  return {
    message: typeof err?.message === "string" ? err.message : String(e),
    kind: typeof err?.kind === "string" ? err.kind : fallbackKind,
    diagnostics: Array.isArray(err?.diagnostics) ? err.diagnostics : [],
    ...(err?.pic ? { pic: err.pic } : {}),
  };
}

/** Executa um pedido: carrega o wasm (1ª vez), simula, mede. Nunca lança. */
export async function handleSimRequest(req: SimRequest, api: SimApi): Promise<SimResponse> {
  const t0 = performance.now();
  try {
    await api.ensure();
  } catch (e) {
    return { type: "error", id: req.id, error: toSimFailure(e, "load"), prelude: null, ms: 0 };
  }
  const preludeText = api.prelude();
  try {
    const run = api.simulatePic(req.source, req.opts);
    return { type: "ok", id: req.id, run, prelude: preludeText, ms: performance.now() - t0 };
  } catch (e) {
    return {
      type: "error",
      id: req.id,
      error: toSimFailure(e),
      prelude: preludeText,
      ms: performance.now() - t0,
    };
  }
}
