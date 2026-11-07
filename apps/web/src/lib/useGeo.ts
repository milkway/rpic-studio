import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { defaultGeoWorkerFactory, GeoClient, type GeoWorkerFactory } from "./geoClient";
import type { GeoFailure, GeoFrame, GeoOk } from "./geoProtocol";

export interface GeoState {
  /** true até a 1ª resposta do worker (o build geo carregando). */
  loading: boolean;
  /** Último resultado BOM (mantido durante erros, como o SVG do preview). */
  result: GeoOk | null;
  /** Erro da compilação corrente, ou null. */
  failure: GeoFailure | null;
  /** Fonte do último resultado bom (para saber se ele está defasado). */
  source: string | null;
}

export interface GeoHookOptions {
  frame: GeoFrame | "";
  circuits: boolean;
  texlabels: boolean;
  /** só compila com a aba visível (e cria o worker só então) */
  enabled: boolean;
  /** testes: worker falso */
  workerFactory?: GeoWorkerFactory;
}

/** Mesmo debounce do `useRpic`. */
const DEBOUNCE_MS = 200;

/** Georreferencia `source` ao vivo num worker com o build geo do rpic. */
export function useGeo(source: string, opts: GeoHookOptions): GeoState {
  const { frame, circuits, texlabels, enabled, workerFactory } = opts;
  const debounced = useDebouncedValue(source, DEBOUNCE_MS);
  const clientRef = useRef<GeoClient | null>(null);
  const [state, setState] = useState<GeoState>({
    loading: true,
    result: null,
    failure: null,
    source: null,
  });

  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    clientRef.current ??= new GeoClient(workerFactory ?? defaultGeoWorkerFactory);
    let live = true;
    void clientRef.current
      .run(debounced, { ...(frame ? { frame } : {}), circuits, texlabels })
      .then((res) => {
        if (!live || !res) return; // um pedido mais novo assumiu
        if (res.type === "ok") {
          setState({ loading: false, result: res, failure: null, source: debounced });
        } else {
          setState((s) => ({ ...s, loading: false, failure: res.error }));
        }
      });
    return () => {
      live = false;
    };
  }, [debounced, frame, circuits, texlabels, enabled, workerFactory]);

  return state;
}
