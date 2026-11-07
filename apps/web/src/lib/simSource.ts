// Escrita de volta no fonte pic (issue #22): soltar o slider de um elemento
// reescreve o argumento de VALOR da chamada dele (`R1: resistor(A, B, 1k)` →
// `… 2.2k)`, `V1: vsource(…, DC 10 AC 1)` → `… AC 1.5`), preservando o resto.
// Puro — sem DOM, sem wasm.
//
// Posições: a cena do rpic ≥ 0.16 traz, por bloco rotulado de macro, os
// argumentos da chamada como escritos (`call.raw_args[i] = {text, line, col,
// end_line, end_col}`), já re-baseados para o fonte do usuário pelo
// `compileWithPrelude` (lib/dunePrelude.ts) — o mesmo compile da atribuição de
// objetos, sem compile extra. QUAL argumento é o valor vem da tabela
// `VALUE_ARG` abaixo, lida das assinaturas das macros do prelude do dune-sim.
//
// TODO(dune): a tabela é provisória. Quando o `OverlayMap` do dune trouxer os
// spans do argumento de valor por elemento (milkway/dune, issue "OverlayMap:
// element value-argument spans…"), `elements[].value.span`/`params[]` do mapa
// passam a ser a fonte autoritativa e `VALUE_ARG` some.
import { formatSpice, parseSpiceNumber, SPICE_NUMBER, suffixOf } from "./simValues";

/** Um argumento de chamada como escrito, no referencial do usuário (linhas
 *  1-based; colunas 1-based em CODEPOINTS, fim exclusivo — como o rpic). */
export interface CallArg {
  text: string;
  line: number;
  col: number;
  end_line: number;
  end_col: number;
}

/** Uma chamada ROTULADA de macro no fonte do usuário (`R1: resistor(…)`). */
export interface ElementCall {
  /** O rótulo do bloco = o refdes (`R1`). */
  label: string;
  /** A macro chamada (`resistor`). */
  macro: string;
  args: CallArg[];
}

/** Chamadas de um fonte: as posições só valem para AQUELE texto. */
export interface SourceCalls {
  source: string;
  calls: ElementCall[];
}

/** Uma troca de texto no fonte (offsets UTF-16, como o CodeMirror). */
export interface SourceEdit {
  from: number;
  to: number;
  insert: string;
}

/** Como o valor é escrito no argumento:
 *  - `number`: o argumento inteiro é o número (`1k`, `"4.7u"`);
 *  - `source`: fonte independente — `DC x`, `AC x` ou o número nu inicial
 *    (= DC); só o sub-trecho do parâmetro alterado muda (`SIN(…)` fica);
 *  - `gain`: `Vname ganho` (cccs/ccvs) — o último número. */
type ValueKind = "number" | "source" | "gain";

/** Macro do prelude do dune → índice (0-based) do argumento de valor.
 *  Assinaturas (prelude `spice.pic` do dune-sim 0.3.0): dois-terminais
 *  `m(P, N, valor[, display])`; `vcvs/vccs(P, N, Cp, Cn, ganho[, display])`;
 *  `cccs/ccvs(P, N, "Vname ganho")`; `coupling(L1, L2, k)`. Diodos,
 *  transistores, chaves e linhas levam MODELO (texto), não número: fora. */
export const VALUE_ARG: Readonly<Record<string, { index: number; kind: ValueKind }>> = {
  resistor: { index: 2, kind: "number" },
  capacitor: { index: 2, kind: "number" },
  inductor: { index: 2, kind: "number" },
  vsource: { index: 2, kind: "source" },
  acsource: { index: 2, kind: "source" },
  battery: { index: 2, kind: "source" },
  isource: { index: 2, kind: "source" },
  vcvs: { index: 4, kind: "number" },
  vccs: { index: 4, kind: "number" },
  cccs: { index: 2, kind: "gain" },
  ccvs: { index: 2, kind: "gain" },
  coupling: { index: 2, kind: "number" },
};

/** Por que a escrita de volta não aconteceu. */
export type WriteBackFailure =
  | "no-call" // nenhuma chamada rotulada com esse refdes (ou duas)
  | "unknown-macro" // macro fora da tabela
  | "not-literal" // o valor não é um número literal (variável, expressão, PULSE…)
  | "stale"; // as posições não batem com o texto (fonte mudou)

export type ValueEditResult =
  | { ok: true; edit: SourceEdit; written: string; calls: ElementCall[] }
  | { ok: false; reason: WriteBackFailure; macro?: string };

/** Um token numérico SPICE com sufixo/cauda de unidade (`4.7k`, `10mF`). */
const NUM = String.raw`${SPICE_NUMBER}\p{L}*`;

/** Escrita SPICE que volta EXATAMENTE (ou quase) ao valor: 3 algarismos
 *  quando bastam (o slider anda em valores de 3 algarismos), mais se o campo
 *  recebeu um valor mais fino (`4.753k`). */
export function spiceLiteral(value: number): string {
  for (let d = 3; d <= 12; d++) {
    const s = formatSpice(value, d);
    const back = parseSpiceNumber(s);
    if (back !== null && Math.abs(back - value) <= Math.abs(value) * 1e-9) return s;
  }
  return formatSpice(value, 15);
}

/** Troca um token numérico SPICE pelo valor novo, guardando a cauda de
 *  unidade que não é sufixo de escala (`1kohm` → `2.2kohm`, `5V` → `4.7V`). */
function rewriteNumber(token: string, value: number): string {
  const m = new RegExp(`^(${SPICE_NUMBER})(\\p{L}*)$`, "iu").exec(token);
  const letters = m?.[2] ?? "";
  return spiceLiteral(value) + letters.slice(suffixOf(letters)?.len ?? 0);
}

/** Onde, DENTRO do texto do argumento, está o número a trocar
 *  (`[início, fim)` em unidades UTF-16 do texto). */
function locateNumber(
  text: string,
  kind: ValueKind,
  param: string,
): { start: number; end: number } | null {
  // aspas: o valor pode vir como string pic (`"1k"`) — opera dentro delas
  const quoted = /^"(.*)"$/s.exec(text);
  const inner = quoted ? quoted[1] : text;
  const base = quoted ? 1 : 0;
  const at = (start: number, len: number) => ({ start: base + start, end: base + start + len });
  if (kind === "number") {
    const m = new RegExp(`^\\s*(${NUM})\\s*$`, "iu").exec(inner);
    if (!m || parseSpiceNumber(m[1]) === null) return null;
    return at(inner.indexOf(m[1]), m[1].length);
  }
  if (kind === "gain") {
    const m = new RegExp(`(^|\\s)(${NUM})\\s*$`, "iu").exec(inner);
    if (!m || parseSpiceNumber(m[2]) === null) return null;
    return at(m.index + m[1].length, m[2].length);
  }
  // fonte: `DC x` / `AC x` (keyword + número); DC também como número nu inicial
  const key = param === "acmag" ? "ac" : param === "dc" ? "dc" : null;
  if (!key) return null;
  const kw = new RegExp(`(^|[\\s,])(${key})(\\s*=?\\s*)(${NUM})(?=$|[\\s,])`, "iu").exec(inner);
  if (kw && parseSpiceNumber(kw[4]) !== null) {
    return at(kw.index + kw[1].length + kw[2].length + kw[3].length, kw[4].length);
  }
  if (key === "dc") {
    const bare = new RegExp(`^(\\s*)(${NUM})(?=$|\\s)`, "iu").exec(inner);
    if (bare && parseSpiceNumber(bare[2]) !== null) return at(bare[1].length, bare[2].length);
  }
  return null;
}

/** Offset UTF-16 de (linha, coluna em codepoints), ambos 1-based. */
function offsetOf(source: string, line: number, col: number): number | null {
  let start = 0;
  for (let l = 1; l < line; l++) {
    const nl = source.indexOf("\n", start);
    if (nl < 0) return null;
    start = nl + 1;
  }
  let off = start;
  for (let c = 1; c < col; c++) {
    const cp = source.codePointAt(off);
    if (cp === undefined || cp === 10) return null;
    off += cp > 0xffff ? 2 : 1;
  }
  return off;
}

/** Comprimento em codepoints. */
const cpLen = (s: string) => Array.from(s).length;

/** Chamadas com as posições ajustadas após trocar `oldLen` codepoints por
 *  `newLen` em (linha, coluna) — a troca nunca cruza linhas. O argumento que
 *  contém a troca ganha o texto novo. */
export function shiftCalls(
  calls: ElementCall[],
  line: number,
  col: number,
  oldText: string,
  newText: string,
): ElementCall[] {
  const delta = cpLen(newText) - cpLen(oldText);
  const endCol = col + cpLen(oldText);
  return calls.map((call) => ({
    ...call,
    args: call.args.map((a) => {
      const next = { ...a };
      const contains =
        (a.line < line || (a.line === line && a.col <= col)) &&
        (a.end_line > line || (a.end_line === line && a.end_col >= endCol));
      if (contains) {
        const chars = Array.from(a.text);
        // posição da troca dentro do texto do argumento (em codepoints)
        let idx = 0;
        if (a.line === line) idx = col - a.col;
        else {
          let l = a.line;
          let c = a.col;
          for (; idx < chars.length; idx++) {
            if (l === line && c === col) break;
            if (chars[idx] === "\n") {
              l++;
              c = 1;
            } else c++;
          }
        }
        next.text =
          chars.slice(0, idx).join("") + newText + chars.slice(idx + cpLen(oldText)).join("");
      } else if (a.line === line && a.col >= endCol) {
        next.col += delta;
      }
      if (a.end_line === line && a.end_col >= endCol) next.end_col += delta;
      return next;
    }),
  }));
}

/** A edição que escreve `value` (do parâmetro `param`) no argumento de valor
 *  da chamada `refdes` de `source`. Confere que as posições batem com o texto
 *  antes de propor — senão `stale`, nunca uma troca no lugar errado. */
export function valueEdit(
  source: string,
  calls: ElementCall[],
  refdes: string,
  param: string,
  value: number,
): ValueEditResult {
  const lower = refdes.toLowerCase();
  const matching = calls.filter((c) => c.label.toLowerCase() === lower);
  if (matching.length !== 1) return { ok: false, reason: "no-call" };
  const call = matching[0];
  const spec = VALUE_ARG[call.macro];
  if (!spec) return { ok: false, reason: "unknown-macro", macro: call.macro };
  const arg = call.args[spec.index];
  if (!arg) return { ok: false, reason: "not-literal", macro: call.macro };
  const from = offsetOf(source, arg.line, arg.col);
  const to = offsetOf(source, arg.end_line, arg.end_col);
  if (from === null || to === null || source.slice(from, to) !== arg.text) {
    return { ok: false, reason: "stale", macro: call.macro };
  }
  const loc = locateNumber(arg.text, spec.kind, param);
  if (!loc) return { ok: false, reason: "not-literal", macro: call.macro };
  const oldNum = arg.text.slice(loc.start, loc.end);
  if (oldNum.includes("\n")) return { ok: false, reason: "not-literal", macro: call.macro };
  const written = rewriteNumber(oldNum, value);
  const edit = { from: from + loc.start, to: from + loc.end, insert: written };
  // linha/coluna (codepoints) do número, p/ ajustar as posições das chamadas
  const before = source.slice(0, edit.from);
  const line = before.split("\n").length;
  const col = cpLen(before.slice(before.lastIndexOf("\n") + 1)) + 1;
  return { ok: true, edit, written, calls: shiftCalls(calls, line, col, oldNum, written) };
}

/** Aplica uma edição ao texto (o que o CodeMirror faz, para quem não tem um). */
export function applySourceEdit(source: string, edit: SourceEdit): string {
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
}

/** O deck tem análise AC? (sob `.ac`, o slider de fonte move `acmag`.) */
export function hasAcAnalysis(netlist: string): boolean {
  return /^[ \t]*\.ac\b/im.test(netlist);
}
