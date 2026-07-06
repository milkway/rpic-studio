// "Padrões do diagrama": variáveis do ambiente pic que mudam a geometria
// (scale, boxwid, linethick…). Em vez de um painel oculto, escrevemos um
// bloco REAL no código do usuário — visível, editável, compartilhável e que
// ensina a linguagem. O bloco é delimitado por marcadores e reescrito de forma
// idempotente (mexer nos controles não empilha blocos).

export interface PicVar {
  key: string;
  /** Valor padrão do rpic (não escrito quando o usuário mantém). */
  default: number;
  min: number;
  max: number;
  step: number;
  group: "global" | "dims" | "stroke" | "arrows";
}

// Valores-padrão conferidos contra o compilador (rpic 0.6.0).
export const PIC_VARS: PicVar[] = [
  { key: "scale", default: 1, min: 0.25, max: 4, step: 0.05, group: "global" },
  { key: "boxwid", default: 0.75, min: 0.2, max: 2.5, step: 0.05, group: "dims" },
  { key: "boxht", default: 0.5, min: 0.2, max: 2, step: 0.05, group: "dims" },
  { key: "circlerad", default: 0.25, min: 0.05, max: 1.5, step: 0.05, group: "dims" },
  { key: "ellipsewid", default: 0.75, min: 0.2, max: 2.5, step: 0.05, group: "dims" },
  { key: "ellipseht", default: 0.5, min: 0.2, max: 2, step: 0.05, group: "dims" },
  { key: "arcrad", default: 0.25, min: 0.05, max: 1.5, step: 0.05, group: "dims" },
  { key: "linewid", default: 0.5, min: 0.1, max: 2, step: 0.05, group: "dims" },
  { key: "linethick", default: 0.8, min: 0.3, max: 6, step: 0.1, group: "stroke" },
  { key: "fillval", default: 0.5, min: 0, max: 1, step: 0.05, group: "stroke" },
  { key: "arrowwid", default: 0.05, min: 0.02, max: 0.3, step: 0.01, group: "arrows" },
  { key: "arrowht", default: 0.1, min: 0.04, max: 0.4, step: 0.01, group: "arrows" },
];

const BEGIN = "# ── padrões (rpic studio) ──";
const END = "# ────────────────────────────";
const BLOCK_RE = new RegExp(
  `\\n?${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}\\n?`,
  "m",
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** Lê os valores atuais do bloco gerenciado (ou {} se não houver). */
export function readDefaults(source: string): Record<string, number> {
  const block = BLOCK_RE.exec(source)?.[0] ?? "";
  const out: Record<string, number> = {};
  for (const v of PIC_VARS) {
    const m = new RegExp(`^\\s*${v.key}\\s*=\\s*(-?[0-9.]+)`, "m").exec(block);
    if (m) out[v.key] = Number(m[1]);
  }
  return out;
}

/** Reescreve o bloco de padrões: só grava o que difere do default. */
export function applyDefaults(source: string, values: Record<string, number>): string {
  const lines = PIC_VARS.filter((v) => {
    const val = values[v.key];
    return val !== undefined && Math.abs(val - v.default) > 1e-9;
  }).map((v) => `${v.key} = ${num(values[v.key])}`);

  // Remove o bloco antigo (se houver).
  const cleaned = source.replace(BLOCK_RE, "\n");
  if (lines.length === 0) return cleaned.replace(/\n{3,}/g, "\n\n");

  const block = `${BEGIN}\n${lines.join("\n")}\n${END}`;

  // Insere logo após a linha `.PS` (ou no topo, se não houver diretiva).
  const psMatch = /^[^\n]*\.PS[^\n]*\n/m.exec(cleaned);
  if (psMatch) {
    const at = psMatch.index + psMatch[0].length;
    return cleaned.slice(0, at) + block + "\n" + cleaned.slice(at);
  }
  return `${block}\n${cleaned.replace(/^\n+/, "")}`;
}
