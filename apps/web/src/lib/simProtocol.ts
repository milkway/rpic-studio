// Protocolo de mensagens UI ↔ worker de simulação. Puro (sem DOM, sem wasm):
// o worker só liga um `SimHost` ao `onmessage`; os testes chamam o mesmo host
// com o dune REAL em Node.
//
// A simulação vive numa `Session` do dune-sim DENTRO do worker: o 1º pedido
// de um fonte abre a sessão (extrai, elabora, desenha a figura) e os
// seguintes do MESMO fonte só aplicam as alterações (`alter`) e re-resolvem
// (`runTyped`) — é o que torna o slider ao vivo possível. Fonte novo = sessão
// nova. Cancelar mata o worker (e a sessão junto): o próximo pedido reabre.
import type { PicExtraction, PicRun, PicSimOptions, SimDiagnostic, SimSession } from "./dune";
import { unitForRefdes, type Alters, type SimControl } from "./simValues";

export interface SimRequest {
  type: "run";
  id: number;
  source: string;
  opts?: PicSimOptions;
  /** Conjunto COMPLETO de alterações (refdes → valor). Quem sumiu da lista
   *  volta ao valor do fonte — o pedido é idempotente, e um worker novo
   *  (após Cancelar) reconstrói o mesmo estado. */
  alters?: Alters;
}

/** Erro do simulador já serializável (um `Error` perde `kind`/`diagnostics`
 *  no structured clone do postMessage). */
export interface SimFailure {
  message: string;
  /** `pic` | `options` | `parse` | `elaborate` | `analysis` | `alter` | `internal` | `load`. */
  kind: string;
  diagnostics: SimDiagnostic[];
  /** Extração (netlist incluso) quando o erro veio depois dela. */
  pic?: PicExtraction;
}

/** A figura da execução, desenhada pelo rpic do PRÓPRIO dune (`renderPic`):
 *  os `<g id="sN">` batem com o `map` do extrator. */
export type SimFigureResult =
  { svg: string; error?: undefined } | { svg?: undefined; error: string };

/** Tempos do worker (ms): abrir a sessão (0 num re-run), `alter`, `runTyped`. */
export interface SimTiming {
  open: number;
  alter: number;
  run: number;
}

interface Common {
  id: number;
  /** A sessão foi (re)aberta neste pedido? Só então `figure`/`controls` vêm. */
  fresh: boolean;
  /** Figura nova (só em `fresh`; num re-run a da sessão segue valendo).
   *  `null` = o wasm nem carregou. */
  figure?: SimFigureResult | null;
  /** Elementos ajustáveis (só em `fresh`). */
  controls?: SimControl[];
  ms: number;
  timing: SimTiming;
}

export type SimResponse =
  (Common & { type: "ok"; run: PicRun }) | (Common & { type: "error"; error: SimFailure });

export interface SimApi {
  ensure: () => Promise<void>;
  openSession: (source: string, opts?: PicSimOptions) => SimSession;
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

/** Nome ngspice do valor PRINCIPAL (o que `alter(refdes, v)`/`param(refdes)`
 *  movem) pela letra do elemento. O dune-sim 0.3.0 não expõe esse nome. */
const PRINCIPAL: Readonly<Record<string, string>> = {
  R: "resistance",
  C: "capacitance",
  L: "inductance",
  V: "dc",
  I: "dc",
  E: "gain",
  F: "gain",
  G: "gain",
  H: "gain",
  D: "area",
  Q: "area",
  J: "area",
  Z: "area",
};

/** O nome do parâmetro que o slider move, CONFERIDO na sessão: o da letra do
 *  elemento se `alterable()` o lista e o valor bate com `param(refdes)`; senão
 *  o 1º nome cujo valor bate; em último caso `names[0]`. */
export function principalParam(
  session: SimSession,
  refdes: string,
  names: string[],
  value: number,
): string {
  const guess = PRINCIPAL[refdes[0]?.toUpperCase() ?? ""];
  const candidates = guess && names.includes(guess) ? [guess, ...names] : names;
  for (const name of candidates) {
    try {
      if (session.param(refdes, name) === value) return name;
    } catch {
      // nome que a sessão recusa: tenta o próximo
    }
  }
  return names[0];
}

/** Elementos com valor principal ajustável: `alterable()` não vazio e um
 *  valor finito ≠ 0 (o slider é log em torno dele). Fonte só com `PULSE(…)`
 *  (DC ausente) fica de fora. */
export function sessionControls(session: SimSession, pic: PicExtraction): SimControl[] {
  const out: SimControl[] = [];
  for (const el of pic.map.elements) {
    let names: string[];
    let value: number | Float64Array | null;
    try {
      names = session.alterable(el.refdes);
      value = names.length ? session.param(el.refdes) : null;
    } catch {
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) continue;
    out.push({
      refdes: el.refdes,
      param: principalParam(session, el.refdes, names, value),
      value,
      unit: unitForRefdes(el.refdes),
    });
  }
  return out;
}

const optsKey = (opts?: PicSimOptions) => JSON.stringify(opts ?? null);

interface Live {
  source: string;
  opts: string;
  session: SimSession;
  pic: PicExtraction;
  /** refdes → valor do fonte (p/ desfazer uma alteração). */
  originals: Map<string, number>;
  /** O que está aplicado na sessão agora. */
  applied: Map<string, number>;
}

const EMPTY_PIC: PicExtraction = { netlist: "", diagnostics: [], map: { elements: [], nets: [] } };

/** A sessão viva do worker. `handle` nunca lança. */
export class SimHost {
  private live: Live | null = null;

  constructor(private readonly api: SimApi) {}

  /** Libera a sessão (o wasm guarda o circuito até `free`). */
  dispose(): void {
    this.live?.session.free();
    this.live = null;
  }

  async handle(req: SimRequest): Promise<SimResponse> {
    const t0 = performance.now();
    const timing: SimTiming = { open: 0, alter: 0, run: 0 };
    try {
      await this.api.ensure();
    } catch (e) {
      return {
        type: "error",
        id: req.id,
        fresh: true,
        error: toSimFailure(e, "load"),
        figure: null,
        ms: 0,
        timing,
      };
    }

    const fresh =
      !this.live || this.live.source !== req.source || this.live.opts !== optsKey(req.opts);
    let extra: { figure?: SimFigureResult; controls?: SimControl[] } = {};
    if (fresh) {
      this.dispose();
      const figure = renderFigure(this.api, req.source);
      const tOpen = performance.now();
      let session: SimSession;
      try {
        session = this.api.openSession(req.source, req.opts);
      } catch (e) {
        timing.open = performance.now() - tOpen;
        return {
          type: "error",
          id: req.id,
          fresh,
          figure,
          controls: [],
          error: toSimFailure(e),
          ms: performance.now() - t0,
          timing,
        };
      }
      // `fromPic` sempre traz a extração; o fallback só satisfaz o tipo
      const pic = session.pic ?? EMPTY_PIC;
      const controls = sessionControls(session, pic);
      this.live = {
        source: req.source,
        opts: optsKey(req.opts),
        session,
        pic,
        originals: new Map(controls.map((c) => [c.refdes, c.value])),
        applied: new Map(),
      };
      timing.open = performance.now() - tOpen;
      extra = { figure, controls };
    }
    const live = this.live!;
    const fail = (e: unknown): SimResponse => ({
      type: "error",
      id: req.id,
      fresh,
      ...extra,
      error: { ...toSimFailure(e), pic: live.pic },
      ms: performance.now() - t0,
      timing,
    });

    const tAlter = performance.now();
    try {
      applyAlters(live, req.alters ?? {});
    } catch (e) {
      timing.alter = performance.now() - tAlter;
      return fail(e);
    }
    timing.alter = performance.now() - tAlter;

    const tRun = performance.now();
    try {
      const raw = live.session.runTyped();
      timing.run = performance.now() - tRun;
      return {
        type: "ok",
        id: req.id,
        fresh,
        ...extra,
        run: { ...raw, pic: live.pic },
        ms: performance.now() - t0,
        timing,
      };
    } catch (e) {
      timing.run = performance.now() - tRun;
      return fail(e);
    }
  }
}

/** Leva a sessão de `applied` a `want`: desfaz quem saiu, aplica quem mudou. */
function applyAlters(live: Live, want: Alters): void {
  for (const refdes of [...live.applied.keys()]) {
    if (Object.hasOwn(want, refdes)) continue;
    const orig = live.originals.get(refdes);
    if (orig !== undefined) live.session.alter(refdes, orig);
    live.applied.delete(refdes);
  }
  for (const [refdes, value] of Object.entries(want)) {
    if (live.applied.get(refdes) === value) continue;
    live.session.alter(refdes, value);
    live.applied.set(refdes, value);
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
