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

/** A figura da execução, desenhada pelo rpic do PRÓPRIO dune (`renderPic`):
 *  os `<g id="sN">` batem com o `map` do extrator. `null` = wasm não carregou. */
export type SimFigureResult =
  { svg: string; error?: undefined } | { svg?: undefined; error: string };

export type SimResponse =
  | { type: "ok"; id: number; run: PicRun; figure: SimFigureResult; ms: number }
  | { type: "error"; id: number; error: SimFailure; figure: SimFigureResult | null; ms: number };

export interface SimApi {
  ensure: () => Promise<void>;
  simulatePic: (source: string, opts?: PicSimOptions) => PicRun;
  renderPic: (source: string) => string;
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

function renderFigure(api: SimApi, source: string): SimFigureResult {
  try {
    return { svg: api.renderPic(source) };
  } catch (e) {
    return { error: toSimFailure(e, "pic").message };
  }
}

/** Executa um pedido: carrega o wasm (1ª vez), desenha a figura, simula,
 *  mede. Nunca lança. */
export async function handleSimRequest(req: SimRequest, api: SimApi): Promise<SimResponse> {
  const t0 = performance.now();
  try {
    await api.ensure();
  } catch (e) {
    return { type: "error", id: req.id, error: toSimFailure(e, "load"), figure: null, ms: 0 };
  }
  const figure = renderFigure(api, req.source);
  try {
    const run = api.simulatePic(req.source, req.opts);
    return { type: "ok", id: req.id, run, figure, ms: performance.now() - t0 };
  } catch (e) {
    return {
      type: "error",
      id: req.id,
      error: toSimFailure(e),
      figure,
      ms: performance.now() - t0,
    };
  }
}

/** Buffers das colunas da resposta, p/ a lista de transferables do
 *  `postMessage` (o worker abre mão deles: zero cópia). Sem repetição — o
 *  mesmo buffer duas vezes é `DataCloneError`. */
export function transferablesOf(res: SimResponse): ArrayBuffer[] {
  if (res.type !== "ok") return [];
  const out = new Set<ArrayBuffer>();
  for (const p of res.run.plots) for (const c of p.columns) out.add(c.buffer as ArrayBuffer);
  return [...out];
}
