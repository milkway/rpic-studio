// Protocolo de mensagens UI ↔ worker de simulação. Puro (sem DOM, sem wasm):
// o worker só liga um `SimHost` ao `onmessage`; os testes chamam o mesmo host
// com o dune REAL em Node.
//
// A simulação vive numa `Session` do dune-sim DENTRO do worker: o 1º pedido
// de um fonte abre a sessão (extrai, elabora, desenha a figura) e os
// seguintes do MESMO fonte só aplicam as alterações (`alter`) e re-resolvem
// (`runTyped`) — é o que torna o slider ao vivo possível. Fonte novo = sessão
// nova. Cancelar mata o worker (e a sessão junto): o próximo pedido reabre.
//
// Grade de exibição (issue #33, `SimRequest.fine`): a sessão abre do deck
// DENSO (`displayDeck` do netlist extraído, `Session.fromDeck`) em vez do
// fiel (`Session.fromPic`) — a extração (netlist + mapa) e a figura seguem as
// do fonte. Deck diferente = sessão diferente: alternar o modo REABRE.
import type {
  PicExtraction,
  PicRun,
  ExtractOptions,
  PicSimOptions,
  SimDiagnostic,
  SimOptions,
  SimSession,
} from "./dune";
import { displayDeck } from "./simAnalysis";
import { unitForRefdes, type Alters, type SimControl } from "./simValues";
import { hasAcAnalysis } from "./simSource";

/** UM passo de reescrita do fonte da sessão pela escrita de volta de um
 *  slider: `to` difere de `from` só nos valores de `originals` (refdes →
 *  valor agora escrito no fonte). O pedido leva a CADEIA de passos ainda não
 *  confirmados (escritas rápidas seguidas: A→B→C); o worker acha o passo cujo
 *  `from` é a sua sessão e ADOTA dali até o fim sem reabrir (plot/estado
 *  ficam): os valores viram os originais, figura e netlist do texto novo.
 *  Nenhum passo bate (worker novo após Cancelar) = abertura normal. */
export interface SimAdopt {
  from: string;
  to: string;
  originals: Readonly<Record<string, number>>;
}

export interface SimRequest {
  type: "run";
  id: number;
  source: string;
  opts?: PicSimOptions;
  /** Conjunto COMPLETO de alterações (refdes → valor). Quem sumiu da lista
   *  volta ao valor do fonte — o pedido é idempotente, e um worker novo
   *  (após Cancelar) reconstrói o mesmo estado. */
  alters?: Alters;
  /** Cadeia de reescritas não confirmadas, em ordem; a última termina em `source`. */
  adopt?: readonly SimAdopt[];
  /** Modo "grade fina" (só VISUALIZAÇÃO, issue #33): a sessão roda o deck
   *  com os cartões de análise refinados para ≥ `DISPLAY_PTS` pontos
   *  (`displayDeck`) — o fonte, o netlist mostrado e as tolerâncias da
   *  engine ficam os do deck. Ausente = o deck como está. Mudar o modo
   *  REABRE a sessão (outro deck), reaplicando o conjunto `alters`. */
  fine?: boolean;
}

/** Em que grade o run da resposta foi calculado: `dense` = a de exibição
 *  (deck refinado); `deck` = a do próprio deck (modo normal, ou nada a
 *  refinar — já denso/cartão ilegível); `fallback` = o modo pediu a densa,
 *  mas ela falhou (abrir ou rodar) e o run é o do deck fiel. */
export type SimDisplayGrid = "dense" | "deck" | "fallback";

/** Erro do simulador já serializável (um `Error` perde `kind`/`diagnostics`
 *  no structured clone do postMessage). */
export interface SimFailure {
  message: string;
  /** `pic` | `options` | `parse` | `elaborate` | `analysis` | `pss` | `alter` | `internal` | `load`. */
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
  /** A sessão foi (re)aberta neste pedido? */
  fresh: boolean;
  /** Figura nova (em `fresh` e ao adotar um fonte reescrito; num re-run a da
   *  sessão segue valendo). `null` = o wasm nem carregou. */
  figure?: SimFigureResult | null;
  /** Elementos ajustáveis (em `fresh` e ao adotar). */
  controls?: SimControl[];
  ms: number;
  timing: SimTiming;
  /** O fonte da sessão viva DEPOIS do pedido (ausente = sem sessão): é a
   *  confirmação das adoções — o cliente descarta os passos até ele. */
  liveSource?: string;
  /** O fonte de onde saiu a extração (`run.pic`/`error.pic`) desta resposta:
   *  a figura só casa com o `map.canvas` dela se for do MESMO texto. */
  picSource?: string;
  /** A grade do run desta resposta (ausente = sem sessão). */
  displayGrid?: SimDisplayGrid;
}

export type SimResponse =
  (Common & { type: "ok"; run: PicRun }) | (Common & { type: "error"; error: SimFailure });

export interface SimApi {
  ensure: () => Promise<void>;
  openSession: (source: string, opts?: PicSimOptions) => SimSession;
  renderPic: (source: string) => string;
  /** Extração sem simular: a re-extração ao adotar um fonte reescrito
   *  (netlist com o valor novo) e o netlist de onde sai o deck denso. Ausente:
   *  o netlist mostrado fica o da abertura, e a grade fina fica a do deck. */
  extractPic?: (source: string, opts?: ExtractOptions) => PicExtraction;
  /** Sessão de um deck SPICE (`Session.fromDeck`) — a grade de exibição.
   *  Ausente: o modo fica na grade do deck (`deck`). */
  openDeck?: (deck: string, opts?: SimOptions) => SimSession;
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

const usable = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v !== 0;

/** Elementos com valor principal ajustável: `alterable()` não vazio e um
 *  valor finito ≠ 0 (o slider é log em torno dele). Fonte só com `PULSE(…)`
 *  (DC ausente) fica de fora. Sob `.ac` no deck, a fonte independente (V/I)
 *  com `AC x` move a MAGNITUDE AC (`acmag`) — mexer no `dc` não mudaria nada
 *  no Bode; sem `AC` cai no principal (`dc`). */
export function sessionControls(session: SimSession, pic: PicExtraction): SimControl[] {
  const out: SimControl[] = [];
  const ac = hasAcAnalysis(pic.netlist);
  for (const el of pic.map.elements) {
    let names: string[];
    let param: string | null = null;
    let value: number | Float64Array | null = null;
    try {
      names = session.alterable(el.refdes);
      if (!names.length) continue;
      if (ac && /^[VI]/i.test(el.refdes) && names.includes("acmag")) {
        const mag = session.param(el.refdes, "acmag");
        if (usable(mag)) {
          param = "acmag";
          value = mag;
        }
      }
      if (param === null) value = session.param(el.refdes);
    } catch {
      continue;
    }
    if (!usable(value)) continue;
    out.push({
      refdes: el.refdes,
      param: param ?? principalParam(session, el.refdes, names, value),
      value,
      unit: unitForRefdes(el.refdes),
    });
  }
  return out;
}

const optsKey = (opts?: PicSimOptions) => JSON.stringify(opts ?? null);

/** As opções de simulação (sem as de extração, `snap`) p/ o `fromDeck`. */
function simOptions(opts?: PicSimOptions): SimOptions | undefined {
  if (!opts) return undefined;
  const rest: PicSimOptions = { ...opts };
  delete rest.snap;
  return rest;
}

interface Live {
  source: string;
  opts: string;
  session: SimSession;
  pic: PicExtraction;
  /** O texto de onde `pic` saiu (≠ `source` se a extração do texto adotado
   *  falhou ou a API não a oferece). */
  picSource: string;
  /** Os controles da sessão (refdes, parâmetro, valor do fonte). */
  controls: SimControl[];
  /** refdes → valor do fonte (p/ desfazer uma alteração). */
  originals: Map<string, number>;
  /** O que está aplicado na sessão agora. */
  applied: Map<string, number>;
  /** O modo pedido na abertura (`SimRequest.fine`): mudar = reabrir. */
  fine: boolean;
  /** A grade em que a sessão roda. */
  grid: SimDisplayGrid;
  /** O deck denso da sessão (`displayDeck` do netlist de `pic`), em `dense`. */
  deck: string | null;
}

const EMPTY_PIC: PicExtraction = {
  netlist: "",
  diagnostics: [],
  map: { elements: [], nets: [], canvas: { w: 0, h: 0, origin: [0, 0], rescale: 1 } },
};

/** A sessão viva do worker. `handle` nunca lança. */
export class SimHost {
  private live: Live | null = null;

  constructor(private readonly api: SimApi) {}

  /** O deck denso da sessão viva (`null` fora da grade densa) — diagnóstico. */
  get displayDeck(): string | null {
    return this.live?.deck ?? null;
  }

  /** Libera a sessão (o wasm guarda o circuito até `free`). */
  dispose(): void {
    this.live?.session.free();
    this.live = null;
  }

  /** Adota o fonte reescrito (ver `SimAdopt`): os valores escritos viram os
   *  originais (e ficam aplicados na sessão), figura e netlist do texto novo.
   *  TRANSACIONAL: calcula o estado novo à parte e só o troca no fim; se um
   *  `alter` falha, desfaz na sessão os já feitos e lança — `live` intacto. */
  private adoptSource(
    source: string,
    originals: Readonly<Record<string, number>>,
  ): { figure?: SimFigureResult; controls: SimControl[] } {
    const live = this.live!;
    const nextOriginals = new Map(live.originals);
    const nextApplied = new Map(live.applied);
    // valor que a sessão tem AGORA (p/ desfazer) e o que deve passar a ter
    const steps: { refdes: string; before: number; after: number }[] = [];
    for (const [refdes, value] of Object.entries(originals)) {
      const orig = live.originals.get(refdes);
      if (orig === undefined) continue;
      const now = live.applied.get(refdes) ?? orig;
      if (now !== value) steps.push({ refdes, before: now, after: value });
      nextApplied.delete(refdes);
      nextOriginals.set(refdes, value);
    }
    const done: typeof steps = [];
    try {
      for (const st of steps) {
        alterOne(live, st.refdes, st.after);
        done.push(st);
      }
    } catch (e) {
      for (const st of done.reverse()) {
        try {
          alterOne(live, st.refdes, st.before);
        } catch {
          // melhor esforço: o próximo pedido reaplica o conjunto completo
        }
      }
      throw e;
    }
    let pic = live.pic;
    let picSource = live.picSource;
    let deck = live.deck;
    let extractFailed = false;
    if (this.api.extractPic) {
      try {
        // extração INTEIRA do texto novo: os ids sN não mudam com um valor,
        // mas os spans de escrita de volta (`value`/`params`) e o `canvas`
        // (rótulo mais largo = outra página) do mapa são deste texto
        pic = this.api.extractPic(source);
        picSource = source;
        // grade fina: o deck denso passa a ser o do netlist NOVO (a sessão já
        // tem o valor novo pelo `alter` — equivale a abrir esse deck; o texto
        // é o que uma reabertura de recuo usaria)
        if (live.grid === "dense") deck = displayDeck(pic.netlist);
      } catch {
        // ficam o netlist/mapa anteriores — e a figura anterior: figura e
        // mapa (frame dos terminais) têm de ser do MESMO texto
        extractFailed = true;
      }
    }
    const controls = live.controls.map((c) =>
      Object.hasOwn(originals, c.refdes) ? { ...c, value: originals[c.refdes] } : c,
    );
    const figure = extractFailed ? undefined : renderFigure(this.api, source);
    Object.assign(live, {
      source,
      pic,
      picSource,
      controls,
      originals: nextOriginals,
      applied: nextApplied,
      deck,
    });
    return { figure, controls };
  }

  async handle(req: SimRequest): Promise<SimResponse> {
    const res = await this.handleRun(req);
    // sem sessão viva, a extração (se houver, no erro) é a do próprio pedido
    const live = this.live;
    if (!live) return { ...res, picSource: req.source };
    return {
      ...res,
      liveSource: live.source,
      picSource: live.picSource,
      displayGrid: live.grid,
    };
  }

  /** Abre a sessão do pedido. Modo normal: `fromPic` (a grade do deck). Grade
   *  fina: extrai (`extractPic`), refina o netlist (`displayDeck`) e abre SÓ o
   *  deck denso (`fromDeck`) — nenhum run extra do deck fiel na abertura;
   *  nada a refinar = `fromPic` (`deck`); o denso que não abre = `fromPic`
   *  (`fallback`). Sessão aberta que não chega a virar `Live` (os controles
   *  lançaram) é liberada. Lança o erro da abertura. */
  private openLive(req: SimRequest): Live {
    const make = (
      session: SimSession,
      pic: PicExtraction,
      grid: SimDisplayGrid,
      deck: string | null,
    ): Live => {
      try {
        const controls = sessionControls(session, pic);
        return {
          source: req.source,
          opts: optsKey(req.opts),
          session,
          pic,
          picSource: req.source,
          controls,
          originals: new Map(controls.map((c) => [c.refdes, c.value])),
          applied: new Map(),
          fine: req.fine === true,
          grid,
          deck,
        };
      } catch (e) {
        session.free();
        throw e;
      }
    };
    const faithful = (grid: SimDisplayGrid): Live => {
      const session = this.api.openSession(req.source, req.opts);
      // `fromPic` sempre traz a extração; o fallback só satisfaz o tipo
      return make(session, session.pic ?? EMPTY_PIC, grid, null);
    };
    const { extractPic, openDeck } = this.api;
    if (req.fine !== true || !openDeck || !extractPic) return faithful("deck");
    const snap = req.opts?.snap;
    const pic = extractPic(req.source, snap === undefined ? undefined : { snap });
    const deck = displayDeck(pic.netlist);
    if (deck === pic.netlist) return faithful("deck"); // já denso, ou cartões ilegíveis
    let session: SimSession;
    try {
      session = openDeck(deck, simOptions(req.opts));
    } catch {
      return faithful("fallback");
    }
    return make(session, pic, "dense", deck);
  }

  /** O deck denso falhou ao rodar: troca pela sessão FIEL do mesmo fonte
   *  (`fallback` até a próxima reabertura — toggle, cartão, Simular; nenhuma
   *  nova tentativa a cada slider), com o conjunto `alters` reaplicado. Se
   *  nem a fiel abre, lança o erro ORIGINAL do run denso (com o da fiel
   *  anexado). */
  private fallBack(live: Live, req: SimRequest, denseError: unknown): void {
    let session: SimSession;
    try {
      session = this.api.openSession(live.source, req.opts);
    } catch (e) {
      const orig = toSimFailure(denseError);
      throw Object.assign(new Error(`${orig.message} (deck grid: ${toSimFailure(e).message})`), {
        kind: orig.kind,
        diagnostics: orig.diagnostics,
      });
    }
    live.session.free();
    Object.assign(live, { session, applied: new Map(), grid: "fallback", deck: null });
    applyAlters(live, req.alters ?? {});
  }

  private async handleRun(req: SimRequest): Promise<SimResponse> {
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

    let extra: { figure?: SimFigureResult; controls?: SimControl[] } = {};
    const chain = req.adopt ?? [];
    const live0 = this.live;
    const start = live0 ? chain.findIndex((st) => st.from === live0.source) : -1;
    if (
      live0 &&
      start >= 0 &&
      chain.at(-1)!.to === req.source &&
      live0.source !== req.source &&
      live0.opts === optsKey(req.opts) &&
      live0.fine === (req.fine === true)
    ) {
      // os passos dali em diante, na ordem (o mais novo vence por refdes)
      const originals = Object.assign({}, ...chain.slice(start).map((st) => st.originals));
      const tAdopt = performance.now();
      try {
        extra = this.adoptSource(req.source, originals);
      } catch (e) {
        timing.alter = performance.now() - tAdopt;
        return {
          type: "error",
          id: req.id,
          fresh: false,
          error: { ...toSimFailure(e), pic: live0.pic },
          ms: performance.now() - t0,
          timing,
        };
      }
      timing.alter = performance.now() - tAdopt;
    }
    let fresh =
      !this.live ||
      this.live.source !== req.source ||
      this.live.opts !== optsKey(req.opts) ||
      this.live.fine !== (req.fine === true);
    if (fresh) {
      this.dispose();
      const figure = renderFigure(this.api, req.source);
      const tOpen = performance.now();
      try {
        this.live = this.openLive(req);
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
      timing.open = performance.now() - tOpen;
      extra = { figure, controls: this.live.controls };
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
      timing.alter += performance.now() - tAlter;
      return fail(e);
    }
    timing.alter += performance.now() - tAlter;

    const tRun = performance.now();
    try {
      let raw: ReturnType<SimSession["runTyped"]>;
      try {
        raw = live.session.runTyped();
      } catch (e) {
        if (live.grid !== "dense") throw e;
        // a grade densa não sobrevive (passo fino num caso de canto): o run
        // é o do deck FIEL, e a resposta diz `fallback` — o gráfico nunca
        // mostra a grade do deck calado com o modo ligado
        this.fallBack(live, req, e);
        fresh = true;
        extra = { ...extra, controls: live.controls };
        raw = live.session.runTyped();
      }
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

/** `alter` pelo parâmetro do controle (`acmag` sob `.ac`, senão o
 *  principal); elemento sem controle usa o principal. */
function alterOne(live: Live, refdes: string, value: number): void {
  const param = live.controls.find((c) => c.refdes === refdes)?.param;
  if (param) live.session.alter(refdes, param, value);
  else live.session.alter(refdes, value);
}

/** Leva a sessão de `applied` a `want`: desfaz quem saiu, aplica quem mudou. */
function applyAlters(live: Live, want: Alters): void {
  for (const refdes of [...live.applied.keys()]) {
    if (Object.hasOwn(want, refdes)) continue;
    const orig = live.originals.get(refdes);
    if (orig !== undefined) alterOne(live, refdes, orig);
    live.applied.delete(refdes);
  }
  for (const [refdes, value] of Object.entries(want)) {
    if (live.applied.get(refdes) === value) continue;
    alterOne(live, refdes, value);
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
