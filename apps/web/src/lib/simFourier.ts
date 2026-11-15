// Tabelas de Fourier (`.four`): o dune-sim ≥ 0.11 devolve as linhas AVALIADAS
// em cada run (`fourier`, uma por harmônico de cada vetor; semântica do
// `fourier` do ngspice-47), inclusive nos re-runs da sessão. Aqui elas viram
// um grupo por (cartão, vetor), com a THD e a unidade do vetor no cabeçalho.
import type { FourierRow } from "./dune";

export interface FourierHarmonic {
  harmonic: number;
  /** Hz. */
  frequency: number | null;
  /** Amplitude na unidade do vetor (a média, com sinal, no DC). */
  magnitude: number | null;
  /** Graus, referida a um seno. */
  phase: number | null;
  /** `magnitude` sobre a da fundamental. */
  norm: number | null;
}

export interface FourierGroup {
  key: string;
  /** Posição do cartão `.four` no deck (0 = o primeiro). */
  card: number;
  vector: string;
  /** Unidade da magnitude (`v(…)` = V, `i(…)` = A; expressão = sem unidade). */
  unit: string;
  /** Distorção harmônica total (%). */
  thd: number | null;
  /** A frequência fundamental (Hz), a do harmônico 1. */
  fundamental: number | null;
  /** Por que o vetor não tem tabela (a linha fica, nunca some). */
  error: string | null;
  harmonics: FourierHarmonic[];
}

function vectorUnit(vector: string): string {
  const m = /^(v|i)\s*\(/i.exec(vector.trim());
  if (!m) return "";
  return m[1].toLowerCase() === "i" ? "A" : "V";
}

/** Os grupos na ordem do dune (cartão, depois vetor, depois harmônico). */
export function fourierGroups(rows: readonly FourierRow[]): FourierGroup[] {
  const out: FourierGroup[] = [];
  const byKey = new Map<string, FourierGroup>();
  for (const r of rows) {
    const key = `${r.card}:${r.vector}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        card: r.card,
        vector: r.vector,
        unit: vectorUnit(r.vector),
        thd: null,
        fundamental: null,
        error: null,
        harmonics: [],
      };
      byKey.set(key, g);
      out.push(g);
    }
    if (typeof r.error === "string") g.error = r.error;
    if (r.harmonic === null) continue;
    if (r.thd !== null) g.thd = r.thd;
    if (r.harmonic === 1) g.fundamental = r.frequency;
    g.harmonics.push({
      harmonic: r.harmonic,
      frequency: r.frequency,
      magnitude: r.magnitude,
      phase: r.phase,
      norm: r.norm_magnitude,
    });
  }
  return out;
}

/** Número curto para razões e porcentagens (sem prefixo SI): 3 significativos. */
export function formatPlain(v: number | null, digits = 3): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  const text = a >= 1e6 || a < 1e-4 ? v.toExponential(digits - 1) : String(Number(v.toPrecision(digits)));
  return text.replace(/-/g, "−");
}
