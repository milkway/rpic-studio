// Valores dos sliders do painel Simular: notação SPICE (a do netlist e dos
// rótulos da figura), escala log do slider e unidade por tipo de elemento.
// Puro — sem DOM, sem wasm.
import { formatSI } from "./waveform";

/** Sufixos de escala do SPICE3 (INPevaluate): `M` é MILI, mega é `meg`. */
const SUFFIXES: [string, number][] = [
  ["meg", 1e6],
  ["mil", 25.4e-6],
  ["t", 1e12],
  ["g", 1e9],
  ["k", 1e3],
  ["m", 1e-3],
  ["u", 1e-6],
  ["µ", 1e-6],
  ["μ", 1e-6],
  ["n", 1e-9],
  ["p", 1e-12],
  ["f", 1e-15],
];

/** Lê um número SPICE: `4.7k`, `10u`, `1meg`, `2.2e3`, `1kohm`, `1kΩ` (letras
 *  após o sufixo — de qualquer alfabeto — são ignoradas, como no SPICE).
 *  Inválido → `null`. */
export function parseSpiceNumber(text: string): number | null {
  const m = new RegExp(`^\\s*(${SPICE_NUMBER})(\\p{L}*)\\s*$`, "iu").exec(text.replace("−", "-"));
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  // sem sufixo: unidade sem prefixo ("5V", "1ohm")
  return base * (suffixOf(m[2])?.scale ?? 1);
}

/** A gramática do número SPICE (mantissa + expoente, SEM sufixo) — a única do
 *  Studio: `parseSpiceNumber`, os rótulos (`relabel`) e a escrita de volta
 *  (`simSource.ts`) a compõem. Fonte de regex, para usar com as flags `iu`. */
export const SPICE_NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;

/** Prefixo SI (do `formatSI`) → sufixo SPICE: `M` do SPICE é MILI. */
const SPICE_OF_SI: Readonly<Record<string, string>> = { T: "t", G: "g", M: "meg", µ: "u" };

/** Escrita SPICE com 3 algarismos: `2.2k`, `470n`, `1meg`, `0.5`. Reusa o
 *  `formatSI` (mesma escolha de prefixo), sem espaço e com `µ→u`, `M→meg`. */
export function formatSpice(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return String(v);
  return formatSI(v, "", digits)
    .replace(" ", "")
    .replace("−", "-")
    .replace(/[TGMµ]$/, (p) => SPICE_OF_SI[p]);
}

/** Arredonda a `digits` algarismos significativos (valor "bonito"). */
export function roundSig(v: number, digits = 3): number {
  return v === 0 || !Number.isFinite(v) ? v : Number(v.toPrecision(digits));
}

// ---- escala log do slider: 100× ÷ … 100× em torno do valor original ----

/** Passos do slider por década: 12 (≈ série E12) — uma seta = um passo. */
export const POS_PER_DECADE = 12 * 20;
/** Décadas de cada lado do valor original (100× = 2). */
export const DECADES = 2;
export const POS_MAX = 2 * DECADES * POS_PER_DECADE;
export const POS_CENTER = DECADES * POS_PER_DECADE;
/** Uma seta: 1/12 de década (≈ 21 %). PageUp/PageDown: uma década. */
export const KEY_STEP = POS_PER_DECADE / 12;

/** Valor da posição do slider (sinal do original; magnitude em log). O
 *  CENTRO (e qualquer posição que arredonde ao mesmo valor) devolve o original
 *  EXATO: com 3 algarismos, `1234` voltaria como `1230` e o elemento ficaria
 *  "alterado" sem o usuário ter mudado nada. */
export function valueAt(pos: number, original: number): number {
  if (Math.abs(pos - POS_CENTER) < 0.5) return original;
  const v = roundSig(original * 10 ** ((pos - POS_CENTER) / POS_PER_DECADE));
  return v === roundSig(original) ? original : v;
}

/** Posição do slider para um valor (fora da faixa → grudado na ponta). */
export function posOf(value: number, original: number): number {
  const ratio = value / original;
  if (!(ratio > 0)) return 0;
  const p = POS_CENTER + Math.log10(ratio) * POS_PER_DECADE;
  return Math.min(POS_MAX, Math.max(0, Math.round(p)));
}

/** Unidade do valor principal pelo tipo do elemento (1ª letra do refdes). */
export function unitForRefdes(refdes: string): string {
  switch (refdes[0]?.toUpperCase()) {
    case "R":
    case "H": // transresistência
      return "Ω";
    case "C":
      return "F";
    case "L":
      return "H";
    case "V":
      return "V";
    case "I":
      return "A";
    case "G": // transcondutância
      return "S";
    default: // E/F: ganho adimensional
      return "";
  }
}

/** Um elemento ajustável da figura: o valor principal e o original (o do
 *  fonte). Vem do worker na abertura da sessão. */
export interface SimControl {
  refdes: string;
  /** Nome do parâmetro (ngspice): `resistance`, `capacitance`, `dc`, `gain`… */
  param: string;
  /** Valor do fonte (centro do slider). */
  value: number;
  unit: string;
}

/** Alterações correntes: refdes → valor (só os que diferem do original). */
export type Alters = Readonly<Record<string, number>>;

/** Liga/desliga uma alteração: voltar ao original REMOVE a entrada. */
export function withAlter(
  alters: Alters,
  control: SimControl,
  value: number | null,
): Record<string, number> {
  const next: Record<string, number> = { ...alters };
  if (value === null || value === control.value) delete next[control.refdes];
  else next[control.refdes] = value;
  return next;
}

/** Escala de um sufixo SPICE no início de `letters` (`k`, `meg`, `µ`…) e o
 *  comprimento dele; sem sufixo → `null`. */
export function suffixOf(letters: string): { scale: number; len: number } | null {
  const lower = letters.toLowerCase();
  for (const [sfx, scale] of SUFFIXES) if (lower.startsWith(sfx)) return { scale, len: sfx.length };
  return null;
}

/** Número de um rótulo: delimitado por espaço/pontuação, com sufixo SPICE e
 *  cauda de unidade em QUALQUER alfabeto (`1kΩ`, `4.7µF`) e a forma com
 *  espaço (`10 k`, `10 kΩ`). */
const LABEL_NUMBER = new RegExp(
  String.raw`(^|[\s(),=$\{\}\\])(${SPICE_NUMBER})( ?)(\p{L}*)(?=$|[\s(),=$\{\}\\/])`,
  "giu",
);

/** Rótulo da figura com o valor novo: troca o 1º número que vale o original
 *  (`DC 10 AC 1` → `DC 22 AC 1`, `1kΩ` → `2.2kΩ`, `10 k` → `22 k`),
 *  preservando a cauda de unidade e o espaço. Sem número que case → `null`. */
export function relabel(text: string, original: number, value: number): string | null {
  const close = (v: number) => Math.abs(v - original) <= Math.abs(original) * 1e-9;
  const [, newNum, newSfx] = /^(.*?)([a-z]*)$/.exec(formatSpice(value))!;
  for (const m of text.matchAll(LABEL_NUMBER)) {
    const [, lead, num, space, letters] = m;
    const base = Number(num);
    if (!Number.isFinite(base)) continue;
    const sfx = suffixOf(letters);
    // colado, o SPICE lê o sufixo (`1F` = femto); com espaço, `10 k` usa o
    // sufixo, mas `1 F`/`10 V`/`DC 10 AC` também casam só pelo número
    let usedSuffix: boolean;
    if (sfx && close(base * sfx.scale)) usedSuffix = true;
    else if ((!sfx || space) && close(base)) usedSuffix = false;
    else continue;
    const start = m.index + lead.length;
    let replacement: string;
    let end: number;
    if (usedSuffix) {
      // o µ do rótulo continua µ (o SPICE escreve `u`)
      const written = letters.slice(0, sfx!.len);
      const outSfx = newSfx === "u" && /^[µμ]/.test(written) ? written : newSfx;
      replacement = `${newNum}${space}${outSfx}`;
      end = start + num.length + space.length + sfx!.len;
    } else {
      replacement = `${newNum}${newSfx}`;
      end = start + num.length;
    }
    return text.slice(0, start) + replacement + text.slice(end);
  }
  return null;
}
