import { useCallback, useEffect, useRef, useState } from "react";
import { SimCancelled, SimClient, SimSuperseded, type WorkerFactory } from "./simClient";
import type {
  SimAdopt,
  SimDisplayGrid,
  SimFailure,
  SimFigureResult,
  SimResponse,
  SimTiming,
} from "./simProtocol";
import type { Alters, SimControl } from "./simValues";
import type { OverlayCanvas, PicRun } from "./dune";

export type SimStatus = "idle" | "running" | "done" | "error" | "cancelled";

export interface SimulationState {
  status: SimStatus;
  /** Fonte da execução corrente/última (a figura e a sessão são dele). */
  source: string | null;
  /** `performance.now()` do início (cronômetro do spinner). */
  startedAt: number | null;
  ms: number | null;
  run: PicRun | null;
  failure: SimFailure | null;
  /** Figura da execução desenhada pelo rpic do dune (vem do worker). */
  figure: SimFigureResult | null;
  /** O texto de onde a `figure` mostrada foi desenhada. */
  figureSource: string | null;
  /** O texto de onde saiu a extração mostrada (`run.pic`, senão
   *  `failure.pic`). Só com `picSource === figureSource` o `map.canvas`
   *  posiciona os terminais sobre a figura (ver `pinCanvas`). */
  picSource: string | null;
  /** Elementos com valor ajustável por slider (da sessão aberta). */
  controls: SimControl[];
  /** Alterações pedidas (refdes → valor); a UI as mostra na hora, o
   *  resultado chega com o re-run. */
  alters: Alters;
  /** O resultado mostrado veio de um re-run de slider (não de Simular)? */
  rerun: boolean;
  /** Tempos do worker da última resposta. */
  timing: SimTiming | null;
  /** Ida e volta do último pedido (postMessage → resposta), ms. */
  roundTrip: number | null;
  /** `performance.now()` do envio do pedido cujo resultado está na tela. */
  sentAt: number | null;
  /** Conta as execuções NOVAS (Simular), não os re-runs: estado de vista que
   *  zera a cada execução (plot escolhido, probes, cursor) sobrevive ao slider. */
  epoch: number;
  /** Modo "grade fina" (grade de exibição, issue #33): vai em todo pedido,
   *  os re-runs de slider inclusive. É modo de VISUALIZAÇÃO — o fonte e o
   *  netlist mostrado não mudam; o worker roda o deck refinado. */
  fine: boolean;
  /** A grade do `run` na tela (`null` = sem run): o rótulo do gráfico diz
   *  isto, não o estado do botão — a resposta ao toggle pode estar a caminho. */
  grid: { mode: SimDisplayGrid; deckPoints: number[] | null } | null;
}

const IDLE: SimulationState = {
  status: "idle",
  source: null,
  startedAt: null,
  ms: null,
  run: null,
  failure: null,
  figure: null,
  figureSource: null,
  picSource: null,
  controls: [],
  alters: {},
  rerun: false,
  timing: null,
  roundTrip: null,
  sentAt: null,
  epoch: 0,
  fine: false,
  grid: null,
};

/** Intervalo mínimo entre re-runs durante o arrasto (ms): no máximo ~25/s;
 *  o valor final sempre sai (borda de saída). */
export const RERUN_THROTTLE_MS = 40;

/** Simulação no worker terminável. O wasm do dune só é carregado no 1º `start`;
 *  a sessão do circuito fica viva no worker para os re-runs de slider. */
export function useSimulation(factory?: WorkerFactory, initialFine = false) {
  const clientRef = useRef<SimClient | null>(null);
  const [state, setState] = useState<SimulationState>(() => ({ ...IDLE, fine: initialFine }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<number | null>(null);
  const lastSent = useRef(0);
  const sentKey = useRef<string | null>(null);
  /** Cadeia de reescritas do fonte (escrita de volta) que o worker ainda não
   *  confirmou: vai em TODO pedido (a fila de um lugar pode descartar um) e
   *  encolhe quando a resposta diz em que fonte a sessão está (`liveSource`).
   *  Duas escritas rápidas = A→B, B→C: o worker em A ou em B segue a cadeia. */
  const pendingAdopt = useRef<SimAdopt[]>([]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  const client = useCallback(() => (clientRef.current ??= new SimClient(factory)), [factory]);

  /** Aplica uma resposta do worker ao estado (execução nova OU re-run).
   *  `source` = o do pedido: figura/controles de um fonte que já não é o da
   *  sessão (ex.: resposta a um pedido anterior à escrita de volta) não pisam
   *  nos do fonte corrente. */
  const apply = useCallback((res: SimResponse, rerun: boolean, sentAt: number, source: string) => {
    const roundTrip = performance.now() - sentAt;
    const takeFigure = (s: SimulationState) => res.figure !== undefined && source === s.source;
    // de onde veio a extração desta resposta (worker antigo/falso: o pedido)
    const picOf = res.picSource ?? res.liveSource ?? source;
    setState((s) => ({
      ...s,
      status: res.type === "ok" ? "done" : "error",
      startedAt: null,
      ms: res.ms,
      // re-run de slider que falha (ex.: `alter` recusado) mantém o último
      // resultado bom na tela — o erro aparece junto, sem apagar o gráfico
      // no meio do arrasto. Execução nova que falha limpa.
      run: res.type === "ok" ? res.run : rerun ? s.run : null,
      grid:
        res.type === "ok"
          ? { mode: res.displayGrid ?? "deck", deckPoints: res.deckPoints ?? null }
          : rerun
            ? s.grid
            : null,
      failure: res.type === "ok" ? null : res.error,
      // num re-run a figura/controles da sessão seguem; se o worker reabriu
      // a sessão (ex.: depois de Cancelar) ou adotou um fonte reescrito, vêm
      figure: takeFigure(s) ? res.figure! : s.figure,
      figureSource: takeFigure(s) ? source : s.figureSource,
      // a extração mostrada: a do run (o run antigo fica num re-run que falha)
      picSource: res.type === "ok" || !(rerun && s.run) ? picOf : s.picSource,
      controls: res.controls && source === s.source ? res.controls : s.controls,
      rerun,
      timing: res.timing,
      roundTrip,
      sentAt,
      epoch: rerun ? s.epoch : s.epoch + 1,
    }));
  }, []);

  const onReject = useCallback((e: unknown, rerun = false) => {
    if (e instanceof SimSuperseded) return;
    if (e instanceof SimCancelled) {
      // um `run` novo também cancela o anterior — só marca se ninguém assumiu
      if (!clientRef.current?.busy) {
        setState((s) => ({ ...s, status: "cancelled", startedAt: null }));
      }
      return;
    }
    // falha fora do protocolo (o worker morreu): o pedido não chegou ao fim,
    // então o MESMO conjunto de alterações tem de poder sair de novo — senão o
    // de-dup do `dispatch` engole a nova tentativa (como em `cancel`)
    sentKey.current = null;
    setState((s) => ({
      ...s,
      status: "error",
      startedAt: null,
      run: rerun ? s.run : null,
      failure: {
        message: e instanceof Error ? e.message : String(e),
        kind: "load",
        diagnostics: [],
      },
    }));
  }, []);

  /** Simular: abre a sessão (fonte novo) ou re-roda a mesma. Mesmo fonte
   *  mantém as alterações; fonte novo começa limpo. */
  const start = useCallback(
    (source: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      const prev = stateRef.current;
      const alters = prev.source === source ? prev.alters : {};
      const same = prev.source === source;
      setState((s) => ({
        ...s,
        status: "running",
        source,
        startedAt: performance.now(),
        alters,
        ...(same ? {} : { controls: [] }),
      }));
      const fine = prev.fine;
      sentKey.current = JSON.stringify([source, alters, fine]);
      pendingAdopt.current = [];
      const sentAt = performance.now();
      client()
        .run(fine ? { source, alters, fine } : { source, alters })
        .then(
          (res) => apply(res, false, sentAt, source),
          (e: unknown) => onReject(e),
        );
    },
    [client, apply, onReject],
  );

  const dispatch = useCallback(() => {
    timer.current = null;
    const { source, alters, fine } = stateRef.current;
    if (source === null) return;
    const key = JSON.stringify([source, alters, fine]);
    if (key === sentKey.current) return;
    sentKey.current = key;
    lastSent.current = performance.now();
    const sentAt = performance.now();
    const adopt = pendingAdopt.current;
    client()
      .rerun({
        source,
        alters,
        ...(adopt.length ? { adopt } : {}),
        ...(fine ? { fine } : {}),
      })
      .then(
        (res) => {
          // confirmação: a sessão do worker está em `liveSource` — os passos
          // até ele já valem lá (adotados ou reabertos); os seguintes seguem
          const chain = pendingAdopt.current;
          const upTo = chain.findIndex((st) => st.to === res.liveSource);
          if (upTo >= 0) pendingAdopt.current = chain.slice(upTo + 1);
          apply(res, true, sentAt, source);
        },
        (e: unknown) => onReject(e, true),
      );
  }, [client, apply, onReject]);

  /** Troca as alterações e re-roda a sessão. `commit` (soltar o slider,
   *  Enter, reset) sai na hora; o arrasto é limitado a 1 re-run a cada
   *  `RERUN_THROTTLE_MS` — o último valor sempre sai. */
  const setAlters = useCallback(
    (alters: Alters, commit = false) => {
      const s = stateRef.current;
      if (s.source === null) return;
      stateRef.current = { ...s, alters };
      setState((cur) => ({ ...cur, alters }));
      if (commit) {
        if (timer.current !== null) window.clearTimeout(timer.current);
        dispatch();
        return;
      }
      if (timer.current !== null) return;
      const wait = Math.max(0, RERUN_THROTTLE_MS - (performance.now() - lastSent.current));
      timer.current = window.setTimeout(dispatch, wait);
    },
    [dispatch],
  );

  /** A escrita de volta reescreveu o fonte: `source` é o texto novo e
   *  `originals` os valores agora escritos nele (refdes → valor). Esses
   *  elementos deixam de estar alterados (fonte e sessão concordam), os
   *  controles passam a tê-los como original e o worker adota o fonte novo
   *  SEM reabrir a sessão (plot, probes e cursor ficam). */
  const adopt = useCallback(
    (source: string, originals: Readonly<Record<string, number>>) => {
      const s = stateRef.current;
      if (s.source === null || s.source === source) return;
      const alters: Record<string, number> = { ...s.alters };
      for (const refdes of Object.keys(originals)) delete alters[refdes];
      const controls = s.controls.map((c) =>
        Object.hasOwn(originals, c.refdes) ? { ...c, value: originals[c.refdes] } : c,
      );
      // encadeia: a sessão do worker pode estar em qualquer ponto da cadeia
      pendingAdopt.current = [
        ...pendingAdopt.current,
        { from: s.source, to: source, originals: { ...originals } },
      ];
      stateRef.current = { ...s, source, alters, controls };
      setState((cur) => ({ ...cur, source, alters, controls }));
      if (timer.current !== null) window.clearTimeout(timer.current);
      dispatch();
    },
    [dispatch],
  );

  /** O editor de análise reescreveu um cartão (`.tran`/`.ac`/`.dc`) do
   *  fonte: o DECK mudou, então o worker REABRE a sessão no texto novo (fonte
   *  novo = sessão nova) — mas como re-run: o pedido leva o conjunto COMPLETO
   *  `alters` (os sliders seguem) e o `epoch` não conta (plot/probes/cursor
   *  ficam). A cadeia de adoções pendente morre: a reabertura já lê o texto
   *  com tudo o que foi escrito. Também re-roda uma execução que FALHOU (o
   *  cartão corrigido é o caso típico); sem nada na tela, só guarda o fonte. */
  const reopen = useCallback(
    (source: string) => {
      const s = stateRef.current;
      if (s.source === null || s.source === source) return;
      pendingAdopt.current = [];
      stateRef.current = { ...s, source };
      setState((cur) => ({ ...cur, source }));
      if (s.status === "idle" || (s.status === "cancelled" && s.run === null)) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      dispatch();
    },
    [dispatch],
  );

  /** Liga/desliga a "grade fina". Com uma sessão em uso (rodando ou com
   *  resultado na tela; não numa falha sem resultado), re-roda UMA vez como
   *  re-run: o worker REABRE a sessão no outro deck (o denso ou o fiel), com
   *  o conjunto `alters` — plot/probes/cursor ficam. Ocioso ou cancelado, só
   *  guarda o modo para o próximo Simular. */
  const setFine = useCallback(
    (fine: boolean) => {
      const s = stateRef.current;
      if (s.fine === fine) return;
      stateRef.current = { ...s, fine };
      setState((cur) => ({ ...cur, fine }));
      if (s.source === null || s.status === "idle" || s.status === "cancelled") return;
      // execução que FALHOU sem resultado na tela (ex.: erro de extração): não
      // há sessão útil a re-rodar — e um "re-rodou em" sobre um erro mentiria.
      // O próximo Simular já sai no modo novo.
      if (s.status === "error" && s.run === null) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      dispatch();
    },
    [dispatch],
  );

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    sentKey.current = null;
    clientRef.current?.cancel();
  }, []);

  return { ...state, start, cancel, setAlters, adopt, reopen, setFine };
}

/** O frame dos terminais (`map.canvas`) SÓ quando figura e extração mostradas
 *  vêm do mesmo texto: uma resposta de re-run anterior à escrita de volta traz
 *  o mapa de um texto e a figura fica a de outro — se o rótulo novo alargou a
 *  página, a origem mudou e os alvos cairiam fora do lugar. `null` = sem alvos
 *  de terminal até a resposta que os casa. */
export function pinCanvas(
  sim: Pick<SimulationState, "run" | "failure" | "figureSource" | "picSource">,
): OverlayCanvas | null {
  const pic = sim.run?.pic ?? sim.failure?.pic ?? null;
  if (!pic || sim.picSource === null || sim.picSource !== sim.figureSource) return null;
  return pic.map.canvas;
}
