import { useCallback, useEffect, useRef, useState } from "react";
import { SimCancelled, SimClient, type WorkerFactory } from "./simClient";
import type { SimFailure } from "./simProtocol";
import type { PicRun } from "./dune";

export type SimStatus = "idle" | "running" | "done" | "error" | "cancelled";

export interface SimulationState {
  status: SimStatus;
  /** Fonte da execução corrente/última (a figura do painel é desenhada dele). */
  source: string | null;
  /** `performance.now()` do início (cronômetro do spinner). */
  startedAt: number | null;
  ms: number | null;
  run: PicRun | null;
  failure: SimFailure | null;
  /** Prelude pic do dune (vem do worker junto da resposta). */
  prelude: string | null;
}

const IDLE: SimulationState = {
  status: "idle",
  source: null,
  startedAt: null,
  ms: null,
  run: null,
  failure: null,
  prelude: null,
};

/** Simulação no worker terminável. O wasm do dune só é carregado no 1º `start`. */
export function useSimulation(factory?: WorkerFactory) {
  const clientRef = useRef<SimClient | null>(null);
  const [state, setState] = useState<SimulationState>(IDLE);

  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  const start = useCallback(
    (source: string) => {
      clientRef.current ??= new SimClient(factory);
      const client = clientRef.current;
      setState((s) => ({ ...s, status: "running", source, startedAt: performance.now() }));
      client.run(source).then(
        (res) => {
          if (res.type === "ok") {
            setState({
              status: "done",
              source,
              startedAt: null,
              ms: res.ms,
              run: res.run,
              failure: null,
              prelude: res.prelude,
            });
          } else {
            setState({
              status: "error",
              source,
              startedAt: null,
              ms: res.ms,
              run: null,
              failure: res.error,
              prelude: res.prelude,
            });
          }
        },
        (e) => {
          if (e instanceof SimCancelled) {
            // um `run` novo também cancela o anterior — só marca se ninguém assumiu
            if (!client.busy) setState((s) => ({ ...s, status: "cancelled", startedAt: null }));
            return;
          }
          setState((s) => ({
            ...s,
            status: "error",
            startedAt: null,
            run: null,
            failure: {
              message: e instanceof Error ? e.message : String(e),
              kind: "load",
              diagnostics: [],
            },
          }));
        },
      );
    },
    [factory],
  );

  const cancel = useCallback(() => clientRef.current?.cancel(), []);

  return { ...state, start, cancel };
}
