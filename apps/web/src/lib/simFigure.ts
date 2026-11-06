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

// ---- Probe por clique: rede da figura ↔ traço `v(rede)` do gráfico ----

/** Traço `v(rede)` de uma rede no plot (o rawfile usa minúsculas). `null` =
 *  rede sem tensão própria no plot (terra `0`, ou plot sem a variável). */
export function netTraceName(traceNames: readonly string[], net: string): string | null {
  if (net === "0") return null;
  const want = `v(${net.toLowerCase()})`;
  return traceNames.find((n) => n.toLowerCase() === want) ?? null;
}

/** Traços visíveis → slot de cor (0…max−1), chave em minúsculas. `null` = o
 *  padrão: os `max` primeiros traços do plot, slot = posição. */
export type Probes = ReadonlyMap<string, number> | null;

/** Slots efetivos de um plot (materializa o padrão). */
export function probeSlots(probes: Probes, traceNames: readonly string[], max: number) {
  if (probes) return new Map(probes);
  return new Map(traceNames.slice(0, max).map((n, i) => [n.toLowerCase(), i] as const));
}

/** Liga/desliga um traço. Ao ligar, volta ao slot NATURAL (a posição no plot,
 *  a cor que teria no padrão) se estiver livre, senão pega o menor livre — a
 *  cor de quem já está no gráfico nunca muda (segue a entidade). Cheio → `full`. */
export function toggleProbe(
  probes: Probes,
  traceNames: readonly string[],
  name: string,
  max: number,
): { probes: Map<string, number>; full: boolean } {
  const next = probeSlots(probes, traceNames, max);
  const key = name.toLowerCase();
  if (next.delete(key)) return { probes: next, full: false };
  const used = new Set(next.values());
  const natural = traceNames.findIndex((n) => n.toLowerCase() === key);
  if (natural >= 0 && natural < max && !used.has(natural)) {
    next.set(key, natural);
    return { probes: next, full: false };
  }
  for (let slot = 0; slot < max; slot++) {
    if (!used.has(slot)) {
      next.set(key, slot);
      return { probes: next, full: false };
    }
  }
  return { probes: next, full: true };
}
