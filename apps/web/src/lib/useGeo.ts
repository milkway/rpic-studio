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
  /** `geoKey` do pedido que produziu `result` / `failure`. */
  resultKey: string | null;
  failureKey: string | null;
}

export interface GeoHookOptions {
  frame: GeoFrame | "";
  circuits: boolean;
  texlabels: boolean;
  /** tamanho dos rótulos no mapa (`layers: { textScale }`); padrão 1 */
  textScale?: number;
  /** só compila com a aba visível (e cria o worker só então) */
  enabled: boolean;
  /** testes: worker falso */
  workerFactory?: GeoWorkerFactory;
}

/** Identidade de um pedido: fonte + frame + opções. */
export function geoKey(
  source: string,
  frame: GeoFrame | "",
  circuits: boolean,
  texlabels: boolean,
  textScale = 1,
): string {
  return JSON.stringify([source, frame, circuits, texlabels, textScale]);
}

/** Mesmo debounce do `useRpic`. */
const DEBOUNCE_MS = 200;

/** Georreferencia `source` ao vivo num worker com o build geo do rpic. */
export function useGeo(source: string, opts: GeoHookOptions): GeoState {
  const { frame, circuits, texlabels, textScale = 1, enabled, workerFactory } = opts;
  const debounced = useDebouncedValue(source, DEBOUNCE_MS);
  const clientRef = useRef<GeoClient | null>(null);
  /** chave da última resposta recebida — esconder/mostrar a aba não recompila */
  const answeredRef = useRef<string | null>(null);
  const [state, setState] = useState<GeoState>({
    loading: true,
    result: null,
    failure: null,
    source: null,
    resultKey: null,
    failureKey: null,
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
    const key = geoKey(debounced, frame, circuits, texlabels, textScale);
    if (answeredRef.current === key) return; // nada mudou desde a última resposta
    clientRef.current ??= new GeoClient(workerFactory ?? defaultGeoWorkerFactory);
    let live = true;
    void clientRef.current
      .run(debounced, { ...(frame ? { frame } : {}), circuits, texlabels, textScale })
      .then((res) => {
        if (!live || !res) return; // um pedido mais novo assumiu
        // falha fora do protocolo (worker não carregou): deixa re-tentar
        answeredRef.current = res.type === "error" && res.error.kind === "other" ? null : key;
        if (res.type === "ok") {
          setState({
            loading: false,
            result: res,
            failure: null,
            source: debounced,
            resultKey: key,
            failureKey: null,
          });
        } else {
          setState((s) => ({ ...s, loading: false, failure: res.error, failureKey: key }));
        }
      });
    return () => {
      live = false;
    };
  }, [debounced, frame, circuits, texlabels, textScale, enabled, workerFactory]);

  return state;
}
