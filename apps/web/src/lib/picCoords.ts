// Mapeamento SVG ↔ coordenadas pic. O SVG do rpic NÃO carrega a origem do
// espaço pic (ela depende dos bounds do desenho + pad + margens, internos ao
// compilador), então resolvemos por MEDIÇÃO: um "shadow compile" do mesmo
// fonte com dois dots-sonda em (0,0) e (1,1). As sondas podem AMPLIAR os
// bounds (mudando a translação do render), por isso ancoramos num objeto real
// presente nos DOIS compiles e transferimos a diferença. A escala sai das duas
// sondas dentro do MESMO compile (pad/margens se cancelam) — o que também
// absorve `scale = 2.54` e afins de graça.
import { compile, type ObjectGeometry } from "./rpic";

export interface PicMapping {
  /** Posição, em unidades do viewBox do SVG REAL, do ponto pic (0,0). */
  x0: number;
  y0: number;
  /** Pixels de viewBox por 1 unidade pic (y cresce PARA CIMA no pic). */
  ux: number;
  uy: number;
}

interface CompileOpts {
  circuits: boolean;
  texlabels: boolean;
}

/** Insere as sondas DENTRO do diagrama (antes do último `.PE`, se houver). */
function withProbes(source: string): string {
  const probes = ["dot at (0,0)", "dot at (1,1)"];
  const lines = source.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*\.PE\b/.test(lines[i])) {
      return [...lines.slice(0, i), ...probes, ...lines.slice(i)].join("\n");
    }
  }
  return [...lines, ...probes].join("\n");
}

const center = (b: { x: number; y: number; w: number; h: number }) => ({
  x: b.x + b.w / 2,
  y: b.y + b.h / 2,
});

/**
 * Resolve o mapeamento p/ o render REAL cujo `objects[]` é `real`.
 * Retorna null quando não dá (doc vazio, fonte que não compila com as sondas…)
 * — o chamador simplesmente não mostra coordenadas.
 */
export function solvePicMapping(
  source: string,
  opts: CompileOpts,
  real: ObjectGeometry[],
): PicMapping | null {
  const anchor = real.find((o) => o.bbox && !o.file);
  if (!anchor) return null;
  let shadow;
  try {
    shadow = compile(withProbes(source), opts);
  } catch {
    return null;
  }
  const objs = shadow.objects ?? [];
  // as sondas são as DUAS últimas statements do diagrama → últimos objetos
  const p0 = objs[objs.length - 2]?.bbox; // dot (0,0)
  const p1 = objs[objs.length - 1]?.bbox; // dot (1,1)
  const sAnchor = objs.find((o) => o.id === anchor.id)?.bbox;
  if (!p0 || !p1 || !sAnchor || !anchor.bbox) return null;
  // translação shadow → real, medida no objeto-âncora comum
  const tx = anchor.bbox.x - sAnchor.x;
  const ty = anchor.bbox.y - sAnchor.y;
  const c0 = center(p0);
  const c1 = center(p1);
  const ux = c1.x - c0.x;
  const uy = c0.y - c1.y; // eixo y do pic aponta p/ CIMA
  if (!isFinite(ux) || !isFinite(uy) || Math.abs(ux) < 1e-6 || Math.abs(uy) < 1e-6) return null;
  return { x0: c0.x + tx, y0: c0.y + ty, ux, uy };
}

/** Ponto em unidades do viewBox do SVG real → coordenadas pic. */
export function svgToPic(m: PicMapping, x: number, y: number): { x: number; y: number } {
  return { x: (x - m.x0) / m.ux, y: (m.y0 - y) / m.uy };
}

/** Formata como o usuário escreveria no código: `(1.25, 0.5)`. */
export function formatPicPoint(p: { x: number; y: number }): string {
  const f = (n: number) => String(Number(n.toFixed(2)));
  return `(${f(p.x)}, ${f(p.y)})`;
}
