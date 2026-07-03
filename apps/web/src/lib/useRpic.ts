import { useEffect, useRef, useState } from "react";
import { compile, ensureRpic, type Anim } from "./rpic";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export interface RpicState {
  /** Último SVG compilado com sucesso (mantido durante erros). */
  svg: string;
  animations: Anim[];
  /** Linhas emitidas por `print`. */
  prints: string[];
  /** Erro de compilação atual, ou null quando o código está válido. */
  error: string | null;
  /** true enquanto o WASM carrega (primeiro uso). */
  loading: boolean;
  /** Tempo da última compilação bem-sucedida, em ms. */
  compileMs: number | null;
  /** Contador incrementado a cada compilação boa (dispara efeitos no preview). */
  version: number;
}

const INITIAL: RpicState = {
  svg: "",
  animations: [],
  prints: [],
  error: null,
  loading: true,
  compileMs: null,
  version: 0,
};

/** Compila `source` ao vivo (debounce), preservando o último SVG bom em erro. */
export function useRpic(source: string, circuits: boolean): RpicState {
  const debounced = useDebouncedValue(source, 200);
  const [state, setState] = useState<RpicState>(INITIAL);
  const versionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    ensureRpic()
      .then(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      })
      .catch((e) => {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: `Falha ao carregar o motor: ${e}` }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.loading) return;
    try {
      const t0 = performance.now();
      const bundle = compile(debounced, { circuits });
      const compileMs = performance.now() - t0;
      versionRef.current += 1;
      setState((s) => ({
        ...s,
        svg: bundle.svg,
        animations: bundle.animations,
        prints: bundle.diagnostics,
        error: null,
        compileMs,
        version: versionRef.current,
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, error: message }));
    }
  }, [debounced, circuits, state.loading]);

  return state;
}
