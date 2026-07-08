// Edição de UM atributo de estilo numa STATEMENT específica do pic, localizada
// pela geometria do compilador (`objects[].line/col`). É o que permite estilizar
// visualmente pic "já pronto" (fora do formato do `parsePic`): em vez de
// reconstruir a cena, escrevemos o atributo na própria linha do objeto.
//
// LIMITE: assume que a statement cabe numa linha (o caso comum). Statements que
// se estendem por várias linhas físicas não são cobertas neste incremento.

export type AttrKind =
  | "fill"
  | "stroke"
  | "hatch"
  | "hatchAngle"
  | "hatchSep"
  | "hatchWid"
  | "hatchColor"
  | "dash"
  | "thick"
  | "bold"
  | "italic"
  | "font"
  | "fontsize"
  | "align"
  | "vpos"
  | "wid"
  | "ht"
  | "rad"
  | "diam"
  | "rotated"
  | "opacity";

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** Regex do atributo existente (p/ substituir/remover) e o texto novo a inserir
 *  (ou "" p/ remover). `value` = cor (nome/#hex), "hatch"|"crosshatch",
 *  "dashed"|"dotted", número (thick), ou undefined/null p/ remover. */
function attrSpec(kind: AttrKind, value: string | number | undefined): { re: RegExp; add: string } {
  switch (kind) {
    case "fill":
      return { re: /\s*\bshaded\s+"(?:[^"\\]|\\.)*"/g, add: value ? `shaded "${value}"` : "" };
    case "stroke":
      return { re: /\s*\boutlined\s+"(?:[^"\\]|\\.)*"/g, add: value ? `outlined "${value}"` : "" };
    case "hatch":
      return { re: /\s*\b(?:crosshatch|hatch)\b/g, add: value ? String(value) : "" };
    case "hatchAngle":
      return { re: /\s*\bhatchangle\s+-?[\d.]+/g, add: value != null && value !== "" ? `hatchangle ${fmtNum(Number(value))}` : "" };
    case "hatchSep":
      return { re: /\s*\bhatchsep\s+[\d.]+/g, add: value != null && value !== "" ? `hatchsep ${fmtNum(Number(value))}` : "" };
    case "hatchWid":
      // o rpic aceita `hatchwid` e `hatchwidth`; escrevemos a forma curta, mas a
      // regex remove ambas p/ não duplicar ao reescrever.
      return { re: /\s*\bhatch(?:wid|width)\s+[\d.]+/g, add: value != null && value !== "" ? `hatchwid ${fmtNum(Number(value))}` : "" };
    case "hatchColor":
      return { re: /\s*\bhatchcolor\s+"(?:[^"\\]|\\.)*"/g, add: value ? `hatchcolor "${value}"` : "" };
    case "dash":
      return { re: /\s*\b(?:dashed|dotted)\b/g, add: value ? String(value) : "" };
    case "thick":
      return { re: /\s*\bthick\s+[\d.]+/g, add: value != null && value !== "" ? `thick ${fmtNum(Number(value))}` : "" };
    case "bold":
      return { re: /\s*\bbold\b/g, add: value ? "bold" : "" };
    case "italic":
      return { re: /\s*\bitalic\b/g, add: value ? "italic" : "" };
    case "font":
      return { re: /\s*\bfont\s+"(?:[^"\\]|\\.)*"/g, add: value ? `font "${value}"` : "" };
    case "fontsize":
      return { re: /\s*\bfontsize\s+[\d.]+/g, add: value != null && value !== "" ? `fontsize ${fmtNum(Number(value))}` : "" };
    case "align":
      return { re: /\s*\b(?:ljust|rjust)\b/g, add: value ? String(value) : "" };
    case "vpos":
      return { re: /\s*\b(?:above|below)\b/g, add: value ? String(value) : "" };
    case "wid":
      return { re: /\s*\bwid\s+[\d.]+/g, add: value != null && value !== "" ? `wid ${fmtNum(Number(value))}` : "" };
    case "ht":
      return { re: /\s*\bht\s+[\d.]+/g, add: value != null && value !== "" ? `ht ${fmtNum(Number(value))}` : "" };
    case "rad":
      return { re: /\s*\brad\s+[\d.]+/g, add: value != null && value !== "" ? `rad ${fmtNum(Number(value))}` : "" };
    case "diam":
      return { re: /\s*\bdiam\s+[\d.]+/g, add: value != null && value !== "" ? `diam ${fmtNum(Number(value))}` : "" };
    case "rotated":
      return { re: /\s*\brotated\s+-?[\d.]+/g, add: value != null && value !== "" ? `rotated ${fmtNum(Number(value))}` : "" };
    case "opacity":
      return { re: /\s*\bopacity\s+[\d.]+/g, add: value != null && value !== "" ? `opacity ${fmtNum(Number(value))}` : "" };
  }
}

/** Fim (exclusivo) da statement que começa em `start` na linha: o próximo `;`
 *  OU `}` (fim de bloco `define`/`for`/`if`) fora de aspas, ou o fim da linha.
 *  Parar no `}` é o que permite escrever DENTRO do bloco de um macro/laço (o
 *  atributo entra antes do `}`, aplicando a todas as instâncias) em vez de
 *  depois dele (que seria erro de sintaxe). */
function statementEnd(text: string, start: number): number {
  let inQuote = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== "\\") inQuote = !inQuote;
    else if ((c === ";" || c === "}") && !inQuote) return i;
  }
  return text.length;
}

/**
 * Aplica `value` ao atributo `kind` na statement em (line, col) de `source`.
 * Se o atributo já existe naquela statement, SUBSTITUI; senão, ANEXA ao fim da
 * statement (antes do `;`/fim de linha). `value` vazio/undefined REMOVE.
 * `line`/`col` são 1-based (como `objects[].line/col`). Retorna o novo source
 * (ou o original inalterado se a posição for inválida).
 */
export function setObjectAttr(
  source: string,
  line: number,
  col: number | undefined,
  kind: AttrKind,
  value: string | number | undefined,
): string {
  const lines = source.split("\n");
  const li = line - 1;
  if (li < 0 || li >= lines.length) return source;
  const text = lines[li];
  const start = Math.max(0, (col ?? 1) - 1);
  const end = statementEnd(text, start);
  const { re, add } = attrSpec(kind, value);
  // opera SÓ dentro da statement (preserva o resto da linha, ex.: outra statement)
  let stmt = text.slice(start, end).replace(re, "");
  stmt = stmt.replace(/\s+$/, "");
  if (add) stmt += ` ${add}`;
  lines[li] = text.slice(0, start) + stmt + text.slice(end);
  return lines.join("\n");
}

export interface ObjectAttrs {
  fill?: string;
  stroke?: string;
  hatch?: "hatch" | "crosshatch";
  hatchAngle?: number;
  hatchSep?: number;
  hatchWid?: number;
  hatchColor?: string;
  dash?: "dashed" | "dotted";
  thick?: number;
  bold?: boolean;
  italic?: boolean;
  font?: string;
  fontsize?: number;
  align?: "ljust" | "rjust";
  vpos?: "above" | "below";
  wid?: number;
  ht?: number;
  rad?: number;
  diam?: number;
  rotated?: number;
  opacity?: number;
}

/** Lê os atributos GERENCIÁVEIS da statement em (line, col) — p/ o inspetor do
 *  overlay universal refletir o estado atual. Só reconhece as formas que o
 *  editor escreve (`shaded "…"`, `outlined "…"`, hatch/crosshatch, dash, thick). */
export function readObjectAttrs(source: string, line: number, col: number | undefined): ObjectAttrs {
  const lines = source.split("\n");
  const li = line - 1;
  if (li < 0 || li >= lines.length) return {};
  const text = lines[li];
  const start = Math.max(0, (col ?? 1) - 1);
  const stmt = text.slice(start, statementEnd(text, start));
  const out: ObjectAttrs = {};
  const fill = /\bshaded\s+"((?:[^"\\]|\\.)*)"/.exec(stmt);
  if (fill) out.fill = fill[1];
  const stroke = /\boutlined\s+"((?:[^"\\]|\\.)*)"/.exec(stmt);
  if (stroke) out.stroke = stroke[1];
  const hatch = /\b(crosshatch|hatch)\b/.exec(stmt);
  if (hatch) out.hatch = hatch[1] as "hatch" | "crosshatch";
  const dash = /\b(dashed|dotted)\b/.exec(stmt);
  if (dash) out.dash = dash[1] as "dashed" | "dotted";
  const thick = /\bthick\s+([\d.]+)/.exec(stmt);
  if (thick) out.thick = +thick[1];
  const hAngle = /\bhatchangle\s+(-?[\d.]+)/.exec(stmt);
  if (hAngle) out.hatchAngle = +hAngle[1];
  const hSep = /\bhatchsep\s+([\d.]+)/.exec(stmt);
  if (hSep) out.hatchSep = +hSep[1];
  const hWid = /\bhatch(?:wid|width)\s+([\d.]+)/.exec(stmt);
  if (hWid) out.hatchWid = +hWid[1];
  const hColor = /\bhatchcolor\s+"((?:[^"\\]|\\.)*)"/.exec(stmt);
  if (hColor) out.hatchColor = hColor[1];
  if (/\bbold\b/.test(stmt)) out.bold = true;
  if (/\bitalic\b/.test(stmt)) out.italic = true;
  const font = /\bfont\s+"((?:[^"\\]|\\.)*)"/.exec(stmt);
  if (font) out.font = font[1];
  const fsize = /\bfontsize\s+([\d.]+)/.exec(stmt);
  if (fsize) out.fontsize = +fsize[1];
  const align = /\b(ljust|rjust)\b/.exec(stmt);
  if (align) out.align = align[1] as "ljust" | "rjust";
  const vpos = /\b(above|below)\b/.exec(stmt);
  if (vpos) out.vpos = vpos[1] as "above" | "below";
  const wid = /\bwid\s+([\d.]+)/.exec(stmt);
  if (wid) out.wid = +wid[1];
  const ht = /\bht\s+([\d.]+)/.exec(stmt);
  if (ht) out.ht = +ht[1];
  const rad = /\brad\s+([\d.]+)/.exec(stmt);
  if (rad) out.rad = +rad[1];
  const diam = /\bdiam\s+([\d.]+)/.exec(stmt);
  if (diam) out.diam = +diam[1];
  const rotated = /\brotated\s+(-?[\d.]+)/.exec(stmt);
  if (rotated) out.rotated = +rotated[1];
  const opacity = /\bopacity\s+([\d.]+)/.exec(stmt);
  if (opacity) out.opacity = +opacity[1];
  return out;
}
