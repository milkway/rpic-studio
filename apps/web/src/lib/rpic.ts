// Wrapper fino sobre o compilador rpic (WASM). Dois builds: lean (padrão,
// ~400 KB) e math (~3 MB, RaTeX embutido para texlabels). A escolha é fixada
// na primeira inicialização (limite do wasm-bindgen), então quem usa `$…$`
// ganha um flag persistente e o build math passa a carregar nas próximas
// visitas; na sessão corrente mostramos um aviso para recarregar.
import * as rpic from "@strategicprojects/rpic";
import type {
  Anim,
  Bundle,
  CompileError,
  CompileOptions,
  Diagnostic,
  ObjectGeometry,
} from "@strategicprojects/rpic";
import wasmUrl from "@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm?url";
import mathWasmUrl from "@strategicprojects/rpic/pkg/rpic_wasm_math_bg.wasm?url";

const MATH_KEY = "rpic:math.v1";

/** O usuário já usou math antes? (decide o build na próxima carga) */
export function mathPreferred(): boolean {
  try {
    return window.localStorage.getItem(MATH_KEY) === "1";
  } catch {
    return false;
  }
}

/** Marca que o app deve carregar o build math daqui em diante. */
export function rememberMathPreference(): void {
  try {
    window.localStorage.setItem(MATH_KEY, "1");
  } catch {
    // sem persistência — o aviso de reload continua aparecendo
  }
}

let initializedBuild: "lean" | "math" | null = null;
let readyPromise: Promise<void> | null = null;

/** Inicializa o WASM (idempotente; o primeiro chamador fixa o build).
 *  `mathHint` (ex.: o documento inicial já tem `$…$`) força o build math na
 *  primeira carga — abrir/recarregar/compartilhar um diagrama com TeX passa a
 *  renderizar sem pedir reload. Em falha (ex.: fetch do .wasm), NÃO cacheia a
 *  rejeição — uma nova chamada tenta de novo (o binding 0.6.2 também limpa seu
 *  slot interno, #216). */
export function ensureRpic(mathHint = false): Promise<void> {
  if (!readyPromise) {
    const math = mathPreferred() || mathHint;
    initializedBuild = math ? "math" : "lean";
    readyPromise = rpic.ready(math ? mathWasmUrl : wasmUrl, { math }).catch((e) => {
      readyPromise = null;
      initializedBuild = null;
      throw e;
    });
  }
  return readyPromise;
}

/** O build carregado tipografa `$…$` de verdade? */
export function mathActive(): boolean {
  return initializedBuild === "math";
}

/** Compila código pic. Requer `ensureRpic()` resolvido. Lança em erro de sintaxe. */
export function compile(src: string, opts?: CompileOptions): Bundle {
  return rpic.compile(src, opts);
}

/** Monta e toca a timeline GSAP do manifesto de animação no SVG dentro de `root`. */
export const animate = rpic.animate;

export type { Anim, Bundle, CompileError, CompileOptions, Diagnostic, ObjectGeometry };

/** Extrai posição "linha:coluna" de uma mensagem de erro do compilador
 *  (formato observado: `"2:1: expected an object, found …"`). */
export function errorPosition(message: string): { line: number; col: number } | null {
  const m = /^(\d+):(\d+):/.exec(message);
  if (m) return { line: Number(m[1]), col: Number(m[2]) };
  const l = /\bline\s+(\d+)/i.exec(message);
  return l ? { line: Number(l[1]), col: 1 } : null;
}
