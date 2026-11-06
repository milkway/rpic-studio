// Figura do painel Simular: o SVG que o usuário vê precisa vir EXATAMENTE do
// texto que o dune compilou (`prelude() + "\n" + fonte`, com a biblioteca de
// circuitos) — só assim os ids `<g id="sN">` batem com o `map` do extrator
// (`elements[].shapes`, `nets[].shapes`). O preview do editor NÃO serve: ele
// compila o fonte cru, sem o prelude. O painel compila a PRÓPRIA figura.
import type { OverlayMap } from "./dune";

/** Linhas `.algo` (cartões SPICE passados adiante: `.tran`, `.ac`, `.model`…)
 *  exceto `.PS`/`.PE`. O rpic do Studio (0.11) não aceita linhas-ponto (o
 *  rpic-core ≥ 0.13, que o dune usa, as repassa sem gerar forma). Trocamos por
 *  linha VAZIA — a contagem de linhas e a numeração das formas não mudam.
 *  Remover quando o Studio subir para o rpic ≥ 0.13. */
const DOT_LINE = /^[ \t]*\.(?!PS\b|PE\b)[^\n]*/gm;

export function stripDotLines(source: string): string {
  return source.replace(DOT_LINE, "");
}

/** Texto que o painel compila no rpic para desenhar a figura da simulação. */
export function composeSimFigure(preludeText: string, source: string): string {
  return `${preludeText}\n${stripDotLines(source)}`;
}

/** Ids `sN` de um elemento (refdes, sem caixa). */
export function elementShapes(map: OverlayMap, refdes: string): number[] {
  const el = map.elements.find((e) => e.refdes.toLowerCase() === refdes.toLowerCase());
  if (!el) return [];
  const out: number[] = [];
  for (let i = el.shapes.start; i < el.shapes.end; i++) out.push(i);
  return out;
}

/** Ids `sN` de uma rede nomeada (fios, pontos, terra). */
export function netShapes(map: OverlayMap, name: string): number[] {
  const net = map.nets.find((n) => n.name.toLowerCase() === name.toLowerCase());
  return net ? [...net.shapes] : [];
}

/** Formas de um vetor do rawfile: `v(vout)`/`v(a,b)` → rede(s);
 *  `i(v1)`/`v1#branch` → elemento. Nome desconhecido → []. */
export function traceShapes(map: OverlayMap, name: string): number[] {
  const n = name.trim();
  const v = /^v\(([^)]*)\)$/i.exec(n);
  if (v) return v[1].split(",").flatMap((p) => netShapes(map, p.trim()));
  const i = /^i\(([^)]*)\)$/i.exec(n);
  if (i) return elementShapes(map, i[1].trim());
  const br = /^(.+)#branch$/i.exec(n);
  if (br) return elementShapes(map, br[1]);
  // tabelas de .op podem trazer o nome cru da rede
  return netShapes(map, n);
}

/** Formas de uma linha do netlist: o primeiro token é o refdes do cartão. */
export function netlistLineShapes(map: OverlayMap, line: string): number[] {
  const t = line.trim();
  if (!t || t.startsWith("*") || t.startsWith(".")) return [];
  return elementShapes(map, t.split(/\s+/)[0]);
}
