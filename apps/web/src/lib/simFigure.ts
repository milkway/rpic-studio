// Formas da figura simulada por nome: o `map` do extrator aponta os grupos
// `<g id="sN">` da figura compilada COM o prelude do dune — a que o worker
// desenha com `renderPic` (o preview do editor compila o fonte cru, outra
// numeração). Aqui só a resolução nome → ids, pura.
import type { OverlayMap } from "./dune";

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
