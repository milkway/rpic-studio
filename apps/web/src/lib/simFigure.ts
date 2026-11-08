// Formas da figura simulada por nome: o `map` do extrator aponta os grupos
// `<g id="sN">` da figura compilada COM o prelude do dune — a que o worker
// desenha com `renderPic` (o preview do editor compila o fonte cru, outra
// numeração). Aqui só a resolução nome → ids, pura.
import type { OverlayCanvas, OverlayMap } from "./dune";

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
// (y para cima, o frame da cena do rpic). O frame do SVG do `renderPic` vem
// EXATO do `map.canvas` (dune-sim ≥ 0.3.4, milkway/dune#19):
//
//     sx = (x + origin[0]) · 96        sy = (h − (y + origin[1])) · 96
//
// com viewBox `0 0 w·96 h·96`; o `rescale` NÃO entra (os pinos já são
// pós-rescale).

/** Unidades SVG do rpic por polegada pic. */
export const SVG_PER_INCH = 96;

export interface PicPoint {
  x: number;
  y: number;
}

/** Chave de um terminal (mesmo ponto = mesma chave): `netPins` deduplica por ela. */
export function terminalKey(p: PicPoint): string {
  return `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
}

/** Terminais distintos de uma rede (`pins[].net`), em polegadas pic. */
export function netPins(map: OverlayMap, net: string): PicPoint[] {
  const key = net.toLowerCase();
  const seen = new Set<string>();
  const out: PicPoint[] = [];
  for (const el of map.elements) {
    for (const p of el.pins ?? []) {
      if (p.net.toLowerCase() !== key) continue;
      const k = terminalKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

/** Um terminal (polegadas pic, y para cima) nas unidades do viewBox do SVG
 *  do `renderPic`, pelo frame do `map.canvas`. */
export function pinToSvg(p: PicPoint, canvas: OverlayCanvas): [number, number] {
  const [ox, oy] = canvas.origin;
  return [(p.x + ox) * SVG_PER_INCH, (canvas.h - (p.y + oy)) * SVG_PER_INCH];
}

// ---- Foco entre redesenhos da figura ----

/** Chave estável de um alvo de teclado da figura: `el:<refdes>` p/ a caixa
 *  `.sim-hit-el` de um elemento, `net:<rede>` p/ o alvo de uma rede (clone
 *  `.sim-hit` ou terminal `.sim-hit-pin`). Outro nó → `null`. */
export function focusKeyOf(node: Element | null): string | null {
  if (!node) return null;
  const el = node.getAttribute("data-el");
  if (el !== null && node.classList.contains("sim-hit-el")) return `el:${el}`;
  const net = node.getAttribute("data-net");
  if (net !== null && node.classList.contains("sim-hit")) return `net:${net}`;
  return null;
}

/** Devolve o foco ao alvo de chave `key` (ver `focusKeyOf`) dentro de
 *  `container` — o nó equivalente depois que a figura foi redesenhada (o SVG
 *  novo substitui os alvos, e o foco do nó removido cai no `body`). Só alvos
 *  com `tabindex` (o de teclado da rede). `true` se focou. */
export function restoreFocus(container: ParentNode, key: string): boolean {
  for (const node of container.querySelectorAll<SVGElement>("[tabindex]")) {
    if (focusKeyOf(node) !== key) continue;
    node.focus({ preventScroll: true });
    return true;
  }
  return false;
}
