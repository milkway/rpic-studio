import { useCallback, useEffect, useRef, useState } from "react";
import { SimCancelled, SimClient, SimSuperseded, type WorkerFactory } from "./simClient";
import type { SimFailure, SimFigureResult, SimResponse, SimTiming } from "./simProtocol";
import type { Alters, SimControl } from "./simValues";
import type { PicRun } from "./dune";

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
}

const IDLE: SimulationState = {
  status: "idle",
  source: null,
  startedAt: null,
  ms: null,
  run: null,
  failure: null,
  figure: null,
  controls: [],
  alters: {},
  rerun: false,
  timing: null,
  roundTrip: null,
  sentAt: null,
  epoch: 0,
};

/** Intervalo mínimo entre re-runs durante o arrasto (ms): no máximo ~25/s;
 *  o valor final sempre sai (borda de saída). */
export const RERUN_THROTTLE_MS = 40;

/** Simulação no worker terminável. O wasm do dune só é carregado no 1º `start`;
 *  a sessão do circuito fica viva no worker para os re-runs de slider. */
export function useSimulation(factory?: WorkerFactory) {
  const clientRef = useRef<SimClient | null>(null);
  const [state, setState] = useState<SimulationState>(IDLE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<number | null>(null);
  const lastSent = useRef(0);
  const sentKey = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  const client = useCallback(() => (clientRef.current ??= new SimClient(factory)), [factory]);

  /** Aplica uma resposta do worker ao estado (execução nova OU re-run). */
  const apply = useCallback((res: SimResponse, rerun: boolean, sentAt: number) => {
    const roundTrip = performance.now() - sentAt;
    setState((s) => ({
      ...s,
      status: res.type === "ok" ? "done" : "error",
      startedAt: null,
      ms: res.ms,
      // re-run de slider que falha (ex.: `alter` recusado) mantém o último
      // resultado bom na tela — o erro aparece junto, sem apagar o gráfico
      // no meio do arrasto. Execução nova que falha limpa.
      run: res.type === "ok" ? res.run : rerun ? s.run : null,
      failure: res.type === "ok" ? null : res.error,
      // num re-run a figura/controles da sessão seguem; se o worker reabriu
      // a sessão (ex.: depois de Cancelar), vêm de novo
      figure: res.fresh && res.figure !== undefined ? res.figure : s.figure,
      controls: res.fresh && res.controls ? res.controls : s.controls,
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
      sentKey.current = JSON.stringify(alters);
      const sentAt = performance.now();
      client()
        .run({ source, alters })
        .then(
          (res) => apply(res, false, sentAt),
          (e: unknown) => onReject(e),
        );
    },
    [client, apply, onReject],
  );

  const dispatch = useCallback(() => {
    timer.current = null;
    const { source, alters } = stateRef.current;
    if (source === null) return;
    const key = JSON.stringify(alters);
    if (key === sentKey.current) return;
    sentKey.current = key;
    lastSent.current = performance.now();
    const sentAt = performance.now();
    client()
      .rerun({ source, alters })
      .then(
        (res) => apply(res, true, sentAt),
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

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    sentKey.current = null;
    clientRef.current?.cancel();
  }, []);

  return { ...state, start, cancel, setAlters };
}
