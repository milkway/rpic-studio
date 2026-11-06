// Dados → gráfico, sem dependência de chart (o repo não tem nenhuma): séries
// a partir de um plot do rawfile, decimação min/max, ticks e prefixos SI.
import type { Plot } from "./dune";

export type Value = number | null;

export interface Trace {
  name: string;
  unit: string;
  values: Value[];
}

export interface Series {
  scale: Trace & { log: boolean };
  traces: Trace[];
  complex: boolean;
}

/** Unidade SI pelo `type` da variável do rawfile. */
export function unitOf(type: string): string {
  switch (type.toLowerCase()) {
    case "time":
      return "s";
    case "frequency":
      return "Hz";
    case "voltage":
      return "V";
    case "current":
      return "A";
    default:
      return "";
  }
}

/** O plot tem eixo de varredura (tran/dc/ac/noise)? `.op`/`.tf`/`.pz`/… não. */
export function hasScale(plot: Plot): boolean {
  if (plot.npoints <= 1 || plot.variables.length < 2) return false;
  return !/operating point|transfer function|sensitivity|pole-zero/i.test(plot.plotname);
}

export function isComplex(plot: Plot): boolean {
  return /complex/i.test(plot.flags);
}

/** Coluna como reais: complexo → |valor| (a escala de freq. → parte real). */
export function columnValues(plot: Plot, index: number, part: "abs" | "re" = "abs"): Value[] {
  const col = plot.columns[index] as unknown[];
  if (!isComplex(plot)) return col as Value[];
  return (col as [Value, Value][]).map((pair) => {
    if (!pair) return null;
    const [re, im] = pair;
    if (re === null || im === null) return null;
    return part === "re" ? re : Math.hypot(re, im);
  });
}

export function plotSeries(plot: Plot): Series {
  const [sv, ...rest] = plot.variables;
  const scaleValues = columnValues(plot, 0, "re");
  const finite = scaleValues.filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  // log só p/ frequência cobrindo mais de uma década (AC/noise)
  const log = sv.type.toLowerCase() === "frequency" && lo > 0 && hi / lo > 10;
  return {
    scale: { name: sv.name, unit: unitOf(sv.type), values: scaleValues, log },
    traces: rest.map((v, i) => ({
      name: v.name,
      unit: unitOf(v.type),
      values: columnValues(plot, i + 1),
    })),
    complex: isComplex(plot),
  };
}

/** Decimação min/max: ~2 pontos por balde, na ordem do índice, preservando
 *  picos (um passo fino de tran não some). `null` quebra o traço → segmentos. */
export function decimateMinMax(xs: Value[], ys: Value[], buckets = 200): [number, number][][] {
  const n = Math.min(xs.length, ys.length);
  // runs contíguos de pontos válidos
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const ok =
      i < n &&
      xs[i] !== null &&
      ys[i] !== null &&
      Number.isFinite(xs[i]!) &&
      Number.isFinite(ys[i]!);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  return runs.map(([a, b]) => {
    const len = b - a;
    const nb = Math.max(1, Math.round((buckets * len) / Math.max(n, 1)));
    if (len <= nb * 2) {
      const seg: [number, number][] = [];
      for (let i = a; i < b; i++) seg.push([xs[i]!, ys[i]!]);
      return seg;
    }
    const seg: [number, number][] = [];
    for (let k = 0; k < nb; k++) {
      const s = a + Math.floor((k * len) / nb);
      const e = a + Math.floor(((k + 1) * len) / nb);
      let iMin = s;
      let iMax = s;
      for (let i = s; i < e; i++) {
        if (ys[i]! < ys[iMin]!) iMin = i;
        if (ys[i]! > ys[iMax]!) iMax = i;
      }
      const first = Math.min(iMin, iMax);
      const second = Math.max(iMin, iMax);
      seg.push([xs[first]!, ys[first]!]);
      if (second !== first) seg.push([xs[second]!, ys[second]!]);
    }
    // o último ponto real fecha o traço (o fim da janela não "encolhe")
    const last = seg[seg.length - 1];
    if (last[0] !== xs[b - 1]) seg.push([xs[b - 1]!, ys[b - 1]!]);
    return seg;
  });
}

/** Ticks "redondos" (1/2/5 × 10^k) cobrindo [min, max]. */
export function linearTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / Math.max(count, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  const k0 = Math.ceil(min / step - 1e-9);
  const k1 = Math.floor(max / step + 1e-9);
  // k·step (não acumulado) e arredondado à precisão do passo: sem 0.30000000004
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let k = k0; k <= k1; k++) out.push(Number((k * step).toFixed(Math.min(digits, 20))) || 0);
  return out;
}

/** Ticks de década (10^k) dentro de [min, max] (min > 0). */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > 0)) return [];
  const out: number[] = [];
  for (let k = Math.ceil(Math.log10(min) - 1e-9); k <= Math.floor(Math.log10(max) + 1e-9); k++) {
    out.push(10 ** k);
  }
  return out;
}

/** Domínio do eixo y com folga, sem colapsar quando o sinal é constante. */
export function paddedDomain(lo: number, hi: number): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    const d = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    return [lo - d, hi + d];
  }
  const pad = (hi - lo) * 0.05;
  return [lo - pad, hi + pad];
}

const PREFIXES: [number, string][] = [
  [1e12, "T"],
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
  [1e-15, "f"],
];

/** `0.00123, "s"` → `1.23 ms`. Até `digits` algarismos significativos. */
export function formatSI(v: number | null, unit = "", digits = 3): string {
  if (v === null || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return `${v > 0 ? "" : "−"}∞${unit ? ` ${unit}` : ""}`;
  const sep = unit ? " " : "";
  if (v === 0) return `0${sep}${unit}`;
  const a = Math.abs(v);
  if (a >= 1e15 || a < 1e-15) return `${v.toExponential(digits - 1)}${sep}${unit}`;
  let [scale, prefix] = PREFIXES[PREFIXES.length - 1];
  for (const p of PREFIXES) {
    if (a >= p[0] * (1 - 5e-13)) {
      [scale, prefix] = p;
      break;
    }
  }
  const num = Number((v / scale).toPrecision(digits));
  const text = String(num).replace("-", "−");
  return `${text}${unit || prefix ? " " : ""}${prefix}${unit}`;
}

/** Índice do ponto de `xs` mais próximo de `x` (xs monotônico crescente). */
export function nearestIndex(xs: Value[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const v = xs[mid];
    if (v === null || v < x) lo = mid;
    else hi = mid;
  }
  const dl = Math.abs((xs[lo] ?? Infinity) - x);
  const dh = Math.abs((xs[hi] ?? Infinity) - x);
  return dh < dl ? hi : lo;
}
