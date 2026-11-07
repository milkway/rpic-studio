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

// ---- Alvos de probe nos TERMINAIS (issue #21) ----
//
// Figura ligada pino a pino (sem `line`) tem redes SEM formas próprias: o
// `map.elements[].pins` (dune-sim ≥ 0.3.3) dá cada terminal em polegadas pic
// (y para cima, o frame da cena do rpic). O SVG do rpic é esse frame × 96
// com y invertido e uma TRANSLAÇÃO (a origem da página) que o SVG não diz —
// ela sai dos próprios traços: os terminais caem nas pontas dos fios/terminais
// desenhados dos elementos, então a translação mais votada pelos pinos é a certa.

/** Unidades SVG do rpic por polegada pic. */
export const SVG_PER_INCH = 96;

export interface PicPoint {
  x: number;
  y: number;
}

/** Terminais distintos de uma rede (`pins[].net`), em polegadas pic. */
export function netPins(map: OverlayMap, net: string): PicPoint[] {
  const key = net.toLowerCase();
  const seen = new Set<string>();
  const out: PicPoint[] = [];
  for (const el of map.elements) {
    for (const p of el.pins ?? []) {
      if (p.net.toLowerCase() !== key) continue;
      const k = `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

/** Pontas dos traços desenhados de um SVG do rpic (unidades do viewBox):
 *  `line` (as duas), `polyline`/`polygon` (todos os vértices) e `path` (o 1º
 *  ponto e o último par). Clones de acerto (`.sim-hit`) ficam de fora. */
export function svgEndpoints(root: ParentNode): [number, number][] {
  const out: [number, number][] = [];
  const num = (el: Element, a: string) => Number(el.getAttribute(a));
  for (const el of root.querySelectorAll("line, polyline, polygon, path")) {
    if (el.closest(".sim-hit")) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "line") {
      out.push([num(el, "x1"), num(el, "y1")], [num(el, "x2"), num(el, "y2")]);
      continue;
    }
    const nums = (el.getAttribute(tag === "path" ? "d" : "points") ?? "")
      .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
      ?.map(Number);
    if (!nums || nums.length < 2) continue;
    if (tag === "path") {
      out.push([nums[0], nums[1]], [nums[nums.length - 2], nums[nums.length - 1]]);
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    }
  }
  return out.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

/** Translação do frame pic → SVG (`x·96 + tx`, `−y·96 + ty`) que põe o maior
 *  número de terminais DISTINTOS sobre pontas de traço desenhadas. `null` se
 *  nem metade dos terminais casa (figura que não sabemos posicionar: melhor
 *  sem alvo que alvo no lugar errado). */
export function pinFrame(
  endpoints: readonly [number, number][],
  pins: readonly PicPoint[],
): { tx: number; ty: number } | null {
  const distinct = [...new Map(pins.map((p) => [`${p.x},${p.y}`, p])).values()];
  if (distinct.length === 0 || endpoints.length === 0) return null;
  const q = (v: number) => Math.round(v * 20) / 20; // 0,05 unidade SVG
  const votes = new Map<string, { tx: number; ty: number; n: number }>();
  for (const p of distinct) {
    const mine = new Set<string>();
    for (const [ex, ey] of endpoints) {
      const tx = q(ex - p.x * SVG_PER_INCH);
      const ty = q(ey + p.y * SVG_PER_INCH);
      const k = `${tx},${ty}`;
      if (mine.has(k)) continue; // um voto por terminal
      mine.add(k);
      const v = votes.get(k);
      if (v) v.n++;
      else votes.set(k, { tx: ex - p.x * SVG_PER_INCH, ty: ey + p.y * SVG_PER_INCH, n: 1 });
    }
  }
  let best: { tx: number; ty: number; n: number } | null = null;
  for (const v of votes.values()) if (!best || v.n > best.n) best = v;
  if (!best || best.n < Math.ceil(distinct.length / 2)) return null;
  return { tx: best.tx, ty: best.ty };
}

/** Um terminal no SVG (unidades do viewBox) pela translação de `pinFrame`. */
export function pinToSvg(p: PicPoint, f: { tx: number; ty: number }): [number, number] {
  return [p.x * SVG_PER_INCH + f.tx, -p.y * SVG_PER_INCH + f.ty];
}
