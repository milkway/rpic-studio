// Edição de UM atributo de estilo numa STATEMENT específica do pic, localizada
// pela geometria do compilador (`objects[].line/col`). É o que permite estilizar
// visualmente pic "já pronto" (fora do formato do `parsePic`): em vez de
// reconstruir a cena, escrevemos o atributo na própria linha do objeto.
//
// LIMITE: assume que a statement cabe numa linha (o caso comum). Statements que
// se estendem por várias linhas físicas não são cobertas neste incremento.

export type AttrKind = "fill" | "stroke" | "hatch" | "dash" | "thick";

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
    case "dash":
      return { re: /\s*\b(?:dashed|dotted)\b/g, add: value ? String(value) : "" };
    case "thick":
      return { re: /\s*\bthick\s+[\d.]+/g, add: value != null && value !== "" ? `thick ${fmtNum(Number(value))}` : "" };
  }
}

/** Fim (exclusivo) da statement que começa em `start` na linha: o próximo `;`
 *  fora de aspas, ou o fim da linha. */
function statementEnd(text: string, start: number): number {
  let inQuote = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== "\\") inQuote = !inQuote;
    else if (c === ";" && !inQuote) return i;
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
  dash?: "dashed" | "dotted";
  thick?: number;
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
  return out;
}
