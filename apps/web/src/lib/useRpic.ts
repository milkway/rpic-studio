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

export interface RpicOptions {
  circuits: boolean;
  texlabels: boolean;
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

/** Atraso extra antes de EXIBIR um erro ("lazy red"): sucesso aparece na hora,
 *  mas vermelho no meio da digitação só se o erro persistir. */
const ERROR_GRACE_MS = 600;

/** Compila `source` ao vivo (debounce), preservando o último SVG bom em erro. */
export function useRpic(source: string, { circuits, texlabels }: RpicOptions): RpicState {
  const debounced = useDebouncedValue(source, 200);
  const [state, setState] = useState<RpicState>(INITIAL);
  const versionRef = useRef(0);
  const errorTimerRef = useRef<number | null>(null);

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
      const bundle = compile(debounced, { circuits, texlabels });
      const compileMs = performance.now() - t0;
      versionRef.current += 1;
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
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
      // não pisca vermelho a cada tecla: o erro só aparece se persistir
      errorTimerRef.current = window.setTimeout(() => {
        setState((s) => ({ ...s, error: message }));
      }, ERROR_GRACE_MS);
    }
    return () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [debounced, circuits, texlabels, state.loading]);

  return state;
}
