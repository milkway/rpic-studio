// Wrapper fino sobre o compilador rpic (WASM). O módulo é inicializado uma
// única vez; `?url` faz o Vite servir o .wasm como asset respeitando o base path.
import * as rpic from "@strategicprojects/rpic";
import type { Anim, Bundle, CompileOptions } from "@strategicprojects/rpic";
import wasmUrl from "@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm?url";

let readyPromise: Promise<void> | null = null;

/** Inicializa o WASM (idempotente). */
export function ensureRpic(): Promise<void> {
  if (!readyPromise) {
    readyPromise = rpic.ready(wasmUrl);
  }
  return readyPromise;
}

/** Compila código pic. Requer `ensureRpic()` resolvido. Lança em erro de sintaxe. */
export function compile(src: string, opts?: CompileOptions): Bundle {
  return rpic.compile(src, opts);
}

/** Monta e toca a timeline GSAP do manifesto de animação no SVG dentro de `root`. */
export const animate = rpic.animate;

export type { Anim, Bundle, CompileOptions };

/** Extrai posição "linha:coluna" de uma mensagem de erro do compilador
 *  (formato observado: `"2:1: expected an object, found …"`). */
export function errorPosition(message: string): { line: number; col: number } | null {
  const m = /^(\d+):(\d+):/.exec(message);
  if (m) return { line: Number(m[1]), col: Number(m[2]) };
  const l = /\bline\s+(\d+)/i.exec(message);
  return l ? { line: Number(l[1]), col: 1 } : null;
}
