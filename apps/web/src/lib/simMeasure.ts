// Linhas do painel de medidas (`.measure`): o dune-sim ≥ 0.3.1 devolve as
// medidas AVALIADAS em cada run (`measurements`, linhas achatadas
// `{name, analysis, plot, value, details, error?}`), inclusive nos re-runs da
// sessão. A unidade não vem na linha — sai do cartão no netlist: o tipo da
// medida (WHEN/TRIG → tempo; FIND/MAX… → a do vetor) e a análise (escala).
import type { Measurement } from "./dune";
import { formatSI } from "./waveform";

/** Unidade da ESCALA por análise (`.dc` varre o que a fonte for: sem unidade). */
const SCALE_UNIT: Readonly<Record<string, string>> = { tran: "s", ac: "Hz", sp: "Hz", dc: "" };

/** Unidade de um vetor do cartão: `v(…)`/`vm(…)` = V, `i(…)` = A, `vdb` = dB. */
function vectorUnit(text: string): string {
  const m = /\b(vdb|vm|vp|vr|vi|v|i)\s*\(/i.exec(text);
  if (!m) return "";
  const k = m[1].toLowerCase();
  if (k === "i") return "A";
  if (k === "vdb") return "dB";
  if (k === "vp") return ""; // fase: radianos ou graus conforme a análise
  return "V";
}

interface CardInfo {
  /** Unidade do valor. */
  value: string;
  /** Unidade de `with` (o valor do vetor em MIN_AT/MAX_AT). */
  vector: string;
}

/** Cartões `.meas[ure] <análise> <nome> …` do netlist → unidades por nome
 *  (minúsculo, como o dune devolve). */
export function measureCards(netlist: string): Map<string, CardInfo> {
  const out = new Map<string, CardInfo>();
  for (const raw of netlist.split("\n")) {
    const m = /^\s*\.meas(?:ure)?\s+(\w+)\s+(\S+)\s+(.*)$/i.exec(raw);
    if (!m) continue;
    const scale = SCALE_UNIT[m[1].toLowerCase()] ?? "";
    const rest = m[3];
    const kind = (/^\s*(\w+)/.exec(rest)?.[1] ?? "").toUpperCase();
    const vector = vectorUnit(rest);
    const value =
      kind === "WHEN" || kind === "TRIG" || kind === "MIN_AT" || kind === "MAX_AT"
        ? scale
        : kind === "INTEG" || kind === "DERIV" || kind === "PARAM"
          ? ""
          : vector;
    out.set(m[2].toLowerCase(), { value, vector });
  }
  return out;
}

export interface MeasureRow {
  key: string;
  name: string;
  analysis: string;
  /** Valor formatado (prefixo SI); `—` numa falha. */
  value: string;
  /** Detalhes na ordem do ngspice: `trig 1 ms`, `at 2 ms`, `from 0 s`… */
  details: string[];
  /** A razão da falha (a linha fica, nunca some). */
  error: string | null;
}

const DETAIL_ORDER = ["trig", "targ", "at", "with", "from", "to"] as const;

/** As linhas do painel, na ordem do dune (plot, depois cartão). Nome
 *  repetido (o mesmo cartão em vários plots da análise) leva `#plot`. */
export function measureRows(measurements: readonly Measurement[], netlist: string): MeasureRow[] {
  const cards = measureCards(netlist);
  const count = new Map<string, number>();
  for (const m of measurements) count.set(m.name, (count.get(m.name) ?? 0) + 1);
  return measurements.map((m, i) => {
    const card = cards.get(m.name.toLowerCase());
    const scale = SCALE_UNIT[m.analysis] ?? "";
    const failed = typeof m.error === "string";
    const details: string[] = [];
    if (!failed) {
      for (const k of DETAIL_ORDER) {
        const v = m.details?.[k];
        if (v === undefined) continue;
        const unit = k === "with" ? (card?.vector ?? "") : scale;
        details.push(`${k} ${formatSI(v, unit)}`);
      }
    }
    return {
      key: `${i}:${m.name}`,
      name: (count.get(m.name) ?? 0) > 1 ? `${m.name}#${m.plot}` : m.name,
      analysis: m.analysis,
      value: failed ? "—" : formatSI(m.value, card?.value ?? ""),
      details,
      error: failed ? m.error! : null,
    };
  });
}
