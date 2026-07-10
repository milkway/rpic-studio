import { useCallback, useEffect, useRef, useState } from "react";
import { compile, ensureRpic, type Anim, type CompileError, type Diagnostic, type Interaction, type ObjectGeometry } from "./rpic";
import { detectTexLabels } from "./detect";
import { solvePicMapping, type PicMapping } from "./picCoords";
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
  /** `animate scroll` no fonte — o preview troca autoplay por scrub (0.8.x). */
  scroll: boolean;
  /** Alvos da diretiva `draggable` (0.10.0) — o preview liga o GSAP Draggable. */
  interactions: Interaction[];
  /** Mapeamento SVG→pic da ÚLTIMA compilação boa, resolvido SOB DEMANDA (faz um
   *  shadow compile com sondas na 1ª chamada por versão; depois é cache). */
  getPicMapping: () => PicMapping | null;
}

export interface RpicOptions {
  circuits: boolean;
  texlabels: boolean;
}

const INITIAL: Omit<RpicState, "getPicMapping"> = {
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
  scroll: false,
  interactions: [],
};

/** Atraso extra antes de EXIBIR um erro ("lazy red"): sucesso aparece na hora,
 *  mas vermelho no meio da digitação só se o erro persistir. */
const ERROR_GRACE_MS = 600;

/** Compila `source` ao vivo (debounce), preservando o último SVG bom em erro. */
export function useRpic(source: string, { circuits, texlabels }: RpicOptions): RpicState {
  const debounced = useDebouncedValue(source, 200);
  const [state, setState] = useState<Omit<RpicState, "getPicMapping">>(INITIAL);
  const versionRef = useRef(0);
  const errorTimerRef = useRef<number | null>(null);
  // Última compilação BOA (fonte + opções + objetos) — insumo do mapeamento
  // SVG→pic. Resolvido sob demanda (custa um compile extra) e cacheado por versão.
  const lastGoodRef = useRef<{
    source: string;
    circuits: boolean;
    texlabels: boolean;
    objects: ObjectGeometry[];
    version: number;
  } | null>(null);
  const picMapRef = useRef<{ version: number; map: PicMapping | null } | null>(null);
  const getPicMapping = useCallback((): PicMapping | null => {
    const good = lastGoodRef.current;
    if (!good) return null;
    if (picMapRef.current?.version !== good.version) {
      picMapRef.current = {
        version: good.version,
        map: solvePicMapping(good.source, { circuits: good.circuits, texlabels: good.texlabels }, good.objects),
      };
    }
    return picMapRef.current.map;
  }, []);
  // Documento inicial já tem TeX? Então carrega o build math direto (sem reload).
  // Capturado no 1º render: `ensureRpic` é idempotente, só a 1ª chamada fixa o build.
  const initialTexRef = useRef(detectTexLabels(source));

  useEffect(() => {
    let cancelled = false;
    ensureRpic(initialTexRef.current)
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
      lastGoodRef.current = {
        source: debounced,
        circuits,
        texlabels,
        objects: bundle.objects ?? [],
        version: versionRef.current,
      };
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
        scroll: bundle.scroll ?? false,
        interactions: bundle.interactions ?? [],
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

  return { ...state, getPicMapping };
}
