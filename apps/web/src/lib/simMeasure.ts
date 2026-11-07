// Linhas do painel de medidas (`.measure`): o dune-sim ≥ 0.3.1 devolve as
// medidas AVALIADAS em cada run (`measurements`, linhas achatadas
// `{name, analysis, plot, value, details, error?}`), inclusive nos re-runs da
// sessão. A unidade não vem na linha — sai do cartão no netlist: o tipo da
// medida (WHEN/TRIG → tempo; FIND/MAX… → a do vetor) e a análise (escala).
import type { Measurement } from "./dune";
import { formatSI } from "./waveform";

/** Unidade da ESCALA por análise (`.dc` varre o que a fonte for: sem unidade). */
const SCALE_UNIT: Readonly<Record<string, string>> = { tran: "s", ac: "Hz", sp: "Hz", dc: "" };

/** Unidade de uma expressão de medida SÓ se ela é um vetor simples —
 *  `v(…)`/`vm(…)`/`vr(…)`/`vi(…)` = V, `i(…)` = A, `vdb(…)` = dB, inteiro e
 *  seguido de espaço/fim/palavra-chave (`AT=`, `FROM=`…). Qualquer outra
 *  coisa (`par('…')`, `v(a)*2`, `vp(…)`) = SEM unidade: melhor nenhuma que
 *  uma errada. */
function plainVectorUnit(expr: string): string {
  const m = /^(vdb|vm|vp|vr|vi|v|i)\s*\([^()]*\)(?=\s|$)/i.exec(expr.trim());
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

/** Linhas lógicas do netlist: continuação SPICE (`+` no início) junta-se à
 *  anterior. */
function logicalLines(netlist: string): string[] {
  const out: string[] = [];
  for (const raw of netlist.split(/\r?\n/)) {
    const cont = /^\s*\+(.*)$/.exec(raw);
    if (cont && out.length) out[out.length - 1] += ` ${cont[1]}`;
    else out.push(raw);
  }
  return out;
}

/** Cartões `.meas[ure] <análise> <nome> <TIPO> <expr> …` do netlist →
 *  unidades por nome (minúsculo, como o dune devolve).
 *
 *  INFERÊNCIA PROVISÓRIA do lado do Studio: se o dune passar a expor o cartão
 *  já parseado (tipo + vetor de cada medida; ver milkway/dune#19), isto sai. */
export function measureCards(netlist: string): Map<string, CardInfo> {
  const out = new Map<string, CardInfo>();
  for (const line of logicalLines(netlist)) {
    const m = /^\s*\.meas(?:ure)?\s+(\w+)\s+(\S+)\s+(\w+)\s*(.*)$/i.exec(line);
    if (!m) continue;
    const scale = SCALE_UNIT[m[1].toLowerCase()] ?? "";
    const kind = m[3].toUpperCase();
    const vector = plainVectorUnit(m[4]);
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
