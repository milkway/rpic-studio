// Escrita de volta no fonte pic (issue #22): soltar o slider de um elemento
// reescreve o parâmetro dele no argumento de VALOR da chamada (`R1:
// resistor(A, B, 1k)` → `… 2.2k)`, `V1: vsource(…, DC 10 AC 1)` → `… AC 1.5`),
// preservando o resto. Puro — sem DOM, sem wasm.
//
// Posições: AUTORITATIVAS, do `OverlayMap` do dune-sim ≥ 0.3.4 (milkway/dune
// #17): por elemento, `value = {span, text}` (o argumento de valor/modelo como
// escrito NO FONTE DO USUÁRIO — sem re-baseamento) e `params[] = {name, span,
// text}` (os parâmetros alteráveis grafados dentro dele, com os nomes do
// `Session.alter`: `dc`, `acmag`, `resistance`, `gain`…). `SourceRange` =
// 1-based, fim exclusivo, colunas em CODEPOINTS; `\` de continuação dá span
// multi-linha. `value === null` = sem span confiável (macro wrapper do
// usuário, bloco inline, `K`, fallback do desenho): não escreve, diz por quê.
import type { OverlayMap } from "./dune";
import { formatSpice, parseSpiceNumber, SPICE_NUMBER, suffixOf } from "./simValues";

/** Uma troca de texto no fonte (offsets UTF-16, como o CodeMirror). */
export interface SourceEdit {
  from: number;
  to: number;
  insert: string;
}

/** Um trecho do fonte do usuário como o `OverlayMap` o dá (`value`/`params[]`). */
interface SpannedText {
  span: { line: number; col: number; end_line: number; end_col: number };
  text: string;
}

/** Por que a escrita de volta não aconteceu. */
export type WriteBackFailure =
  | "no-element" // o refdes não está no mapa da execução
  | "no-span" // o mapa não dá posição confiável do valor (wrapper, bloco inline, `K`)
  | "no-param" // o parâmetro do slider não está grafado no valor (ex.: `dc` num `PULSE(…)`)
  | "not-literal" // o parâmetro não é um número literal (variável, expressão, `PULSE(…)`)
  | "stale" // as posições não batem com o texto (fonte mudou)
  | "unavailable"; // ainda sem mapa da execução p/ este texto

export type ValueEditResult =
  | { ok: true; edit: SourceEdit; written: string; map: OverlayMap }
  | { ok: false; reason: WriteBackFailure };

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
 *  unidade que não é sufixo de escala (`1kohm` → `2.2kohm`, `5V` → `4.7V`).
 *
 *  Regra (a cauda colada é lida pelo SPICE como SUFIXO se puder): a cauda só
 *  fica se o número escrito já leva sufixo próprio (`10mF` → `2.2mF`: o `F`
 *  vem depois do `m`, ignorado) OU se ela não começa por um sufixo (`5V`,
 *  `1ohm`, `1Ω`). Número escrito SEM sufixo + cauda que começa por sufixo
 *  (`F` = femto, `T`, `G`, `M` = mili, `H`…) a cauda CAI: `10mF` → `1`, nunca
 *  `1F` (= 1 femto). O ngspice ignora a unidade de qualquer forma. */
export function rewriteNumber(token: string, value: number): string {
  const m = new RegExp(`^(${SPICE_NUMBER})(\\p{L}*)$`, "iu").exec(token);
  const letters = m?.[2] ?? "";
  const tail = letters.slice(suffixOf(letters)?.len ?? 0);
  const written = spiceLiteral(value);
  const hasSuffix = suffixOf(/\p{L}*$/u.exec(written)![0]) !== null;
  return hasSuffix || suffixOf(tail) === null ? written + tail : written;
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

/** O trecho com as posições ajustadas após trocar `oldText` por `newText` em
 *  (linha, coluna) — a troca nunca cruza linhas. O trecho que CONTÉM a troca
 *  ganha o texto novo (o `text` verbatim anda junto com o span). */
function shiftSpanned<T extends SpannedText>(
  item: T,
  line: number,
  col: number,
  oldText: string,
  newText: string,
): T {
  const delta = cpLen(newText) - cpLen(oldText);
  const endCol = col + cpLen(oldText);
  const a = item.span;
  const span = { ...a };
  let text = item.text;
  const contains =
    (a.line < line || (a.line === line && a.col <= col)) &&
    (a.end_line > line || (a.end_line === line && a.end_col >= endCol));
  if (contains) {
    const chars = Array.from(text);
    // posição da troca dentro do texto (em codepoints), andando pelas linhas
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
    text = chars.slice(0, idx).join("") + newText + chars.slice(idx + cpLen(oldText)).join("");
  } else if (a.line === line && a.col >= endCol) {
    span.col += delta;
  }
  if (a.end_line === line && a.end_col >= endCol) span.end_col += delta;
  return { ...item, span, text };
}

/** O mapa com os spans de valor/parâmetros ajustados após uma troca em
 *  (linha, coluna) — vale para o texto novo até a próxima execução trazer o
 *  mapa fresco. Ids de forma, pinos e canvas ficam (a troca de um valor não
 *  os move; o mapa fresco da adoção os corrige se o rótulo mudar a página). */
export function shiftMap(
  map: OverlayMap,
  line: number,
  col: number,
  oldText: string,
  newText: string,
): OverlayMap {
  return {
    ...map,
    elements: map.elements.map((el) => ({
      ...el,
      value: el.value && shiftSpanned(el.value, line, col, oldText, newText),
      params: el.params.map((p) => shiftSpanned(p, line, col, oldText, newText)),
    })),
  };
}

/** Offsets UTF-16 `[from, to)` de um span, se o texto do fonte nele for
 *  exatamente `text`; senão `null` (posições velhas). */
function locate(source: string, item: SpannedText): { from: number; to: number } | null {
  const from = offsetOf(source, item.span.line, item.span.col);
  const to = offsetOf(source, item.span.end_line, item.span.end_col);
  if (from === null || to === null || source.slice(from, to) !== item.text) return null;
  return { from, to };
}

/** Um número SPICE literal com cauda de unidade (`4.7k`, `10mF`, `1kΩ`). */
const LITERAL = new RegExp(`^${SPICE_NUMBER}\\p{L}*$`, "iu");

/** A edição que escreve `value` no parâmetro `param` do elemento `refdes`,
 *  pelos spans do `map` da execução de `source`. Confere que o valor E o
 *  parâmetro batem com o texto antes de propor — senão `stale`, nunca uma
 *  troca no lugar errado. */
export function valueEdit(
  source: string,
  map: OverlayMap,
  refdes: string,
  param: string,
  value: number,
): ValueEditResult {
  const lower = refdes.toLowerCase();
  const el = map.elements.find((e) => e.refdes.toLowerCase() === lower);
  if (!el) return { ok: false, reason: "no-element" };
  if (!el.value) return { ok: false, reason: "no-span" };
  if (!locate(source, el.value)) return { ok: false, reason: "stale" };
  // repetido → o dune já dá a última grafia; aqui, a última também
  const spec = el.params.filter((p) => p.name.toLowerCase() === param.toLowerCase()).at(-1);
  // nada alterável grafado (variável, expressão): não é número; outros
  // grafados mas não este (`dc` num `PULSE(…)` puro): falta o parâmetro
  if (!spec) return { ok: false, reason: el.params.length ? "no-param" : "not-literal" };
  const at = locate(source, spec);
  if (!at) return { ok: false, reason: "stale" };
  if (!LITERAL.test(spec.text) || parseSpiceNumber(spec.text) === null) {
    return { ok: false, reason: "not-literal" };
  }
  const written = rewriteNumber(spec.text, value);
  const edit = { from: at.from, to: at.to, insert: written };
  return {
    ok: true,
    edit,
    written,
    map: shiftMap(map, spec.span.line, spec.span.col, spec.text, written),
  };
}

/** Aplica uma edição ao texto (o que o CodeMirror faz, para quem não tem um). */
export function applySourceEdit(source: string, edit: SourceEdit): string {
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
}

/** O deck tem análise AC? (sob `.ac`, o slider de fonte move `acmag`.) */
export function hasAcAnalysis(netlist: string): boolean {
  return /^[ \t]*\.ac\b/im.test(netlist);
}
