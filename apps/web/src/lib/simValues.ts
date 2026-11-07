// Valores dos sliders do painel Simular: notação SPICE (a do netlist e dos
// rótulos da figura), escala log do slider e unidade por tipo de elemento.
// Puro — sem DOM, sem wasm.

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

/** Lê um número SPICE: `4.7k`, `10u`, `1meg`, `2.2e3`, `1kohm` (letras após o
 *  sufixo são ignoradas, como no SPICE). Inválido → `null`. */
export function parseSpiceNumber(text: string): number | null {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zµμ]*)\s*$/i.exec(
    text.replace("−", "-"),
  );
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const rest = m[2].toLowerCase();
  if (!rest) return base;
  for (const [sfx, scale] of SUFFIXES) if (rest.startsWith(sfx)) return base * scale;
  return base; // unidade sem prefixo ("5V", "1ohm")
}

/** Escrita SPICE com 3 algarismos: `2.2k`, `470n`, `1meg`, `0.5`. */
export function formatSpice(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  const table: [number, string][] = [
    [1e12, "t"],
    [1e9, "g"],
    [1e6, "meg"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "u"],
    [1e-9, "n"],
    [1e-12, "p"],
    [1e-15, "f"],
  ];
  if (a >= 1e15 || a < 1e-15) return v.toExponential(digits - 1);
  for (const [scale, sfx] of table) {
    if (a >= scale * (1 - 5e-13)) return `${Number((v / scale).toPrecision(digits))}${sfx}`;
  }
  return v.toExponential(digits - 1);
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

/** Valor da posição do slider (sinal do original; magnitude em log). */
export function valueAt(pos: number, original: number): number {
  return roundSig(original * 10 ** ((pos - POS_CENTER) / POS_PER_DECADE));
}

/** Posição do slider para um valor (fora da faixa → grudado na ponta). */
export function posOf(value: number, original: number): number {
  const ratio = value / original;
  if (!(ratio > 0)) return 0;
  const p = POS_CENTER + Math.log10(ratio) * POS_PER_DECADE;
  return Math.min(POS_MAX, Math.max(0, Math.round(p)));
}

/** Unidade do valor principal pelo tipo do elemento (1ª letra do refdes). */
export function unitOf(refdes: string): string {
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

/** Rótulo da figura com o valor novo: troca o 1º token numérico que vale o
 *  original (`DC 10 AC 1` → `DC 22 AC 1`). Sem token que case → `null`. */
export function relabel(text: string, original: number, value: number): string | null {
  const tokens = text.split(/(\s+|[(),=])/);
  for (let i = 0; i < tokens.length; i++) {
    const v = parseSpiceNumber(tokens[i]);
    if (v === null || tokens[i].trim() === "") continue;
    if (Math.abs(v - original) <= Math.abs(original) * 1e-9) {
      tokens[i] = formatSpice(value);
      return tokens.join("");
    }
  }
  return null;
}
