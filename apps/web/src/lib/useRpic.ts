import { useEffect, useRef, useState } from "react";
import { compile, ensureRpic, type Anim, type CompileError, type Diagnostic, type ObjectGeometry } from "./rpic";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export interface RpicState {
  /** Último SVG compilado com sucesso (mantido durante erros). */
  svg: string;
  animations: Anim[];
  /** Linhas emitidas por `print`. */
  prints: string[];
  /** Avisos do compilador (aceito, mas suspeito — ex.: atributo ignorado). */
  warnings: Diagnostic[];
  /** Erro de compilação atual, ou null quando o código está válido. */
  error: string | null;
  /** Diagnóstico estruturado do erro (posição, kind, hint), quando disponível. */
  errorDiag: Diagnostic | null;
  /** true enquanto o WASM carrega (primeiro uso). */
  loading: boolean;
  /** Tempo da última compilação bem-sucedida, em ms. */
  compileMs: number | null;
  /** Contador incrementado a cada compilação boa (dispara efeitos no preview). */
  version: number;
  /** Geometria por objeto (v0.7.0): bbox + `line/col` no código, alinhado a `s{i}`. */
  objects: ObjectGeometry[];
}

export interface RpicOptions {
  circuits: boolean;
  texlabels: boolean;
}

const INITIAL: RpicState = {
  svg: "",
  animations: [],
  prints: [],
  warnings: [],
  error: null,
  errorDiag: null,
  loading: true,
  compileMs: null,
  version: 0,
  objects: [],
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
        warnings: bundle.warnings ?? [],
        error: null,
        errorDiag: null,
        compileMs,
        version: versionRef.current,
        objects: bundle.objects ?? [],
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const diag = (e as CompileError).errorInfo ?? null;
      // não pisca vermelho a cada tecla: o erro só aparece se persistir
      errorTimerRef.current = window.setTimeout(() => {
        setState((s) => ({ ...s, error: message, errorDiag: diag }));
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
