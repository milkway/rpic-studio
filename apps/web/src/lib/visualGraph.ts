// Modelo do EDITOR VISUAL (grafo de nós/arestas) e sua serialização para pic.
//
// O rpic é um compilador de mão única (texto pic → SVG, sem source-map), então
// o modo visual tem o PRÓPRIO modelo — este grafo — e GERA pic. Mas como o pic
// gerado tem um formato REGULAR (`N1: box "…" at (x,y)`, `arrow from N1.e to
// N2.w`), o grafo é reconstruído LENDO O PRÓPRIO CÓDIGO (`parsePic`) — sem blob
// embutido. Assim o código fica limpo e sobrevive a draft/save/share/reload
// naturalmente (a conta só guarda `source`).
//
// Coordenadas do modelo: PIXELS de tela (origem no topo-esquerda, y p/ BAIXO,
// x/y = CENTRO do nó). A conversão para polegadas pic (y p/ CIMA) acontece só na
// geração; o parse faz a inversa (e arredonda p/ px inteiro, evitando drift).

export type Shape = "box" | "circle" | "ellipse" | "diamond";

/** Âncoras pic (compass points + centro) — lados de saída/entrada das arestas. */
export type Side = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "c";

export interface VNode {
  id: string;
  shape: Shape;
  label: string;
  /** centro em px (tela, y p/ baixo) */
  x: number;
  y: number;
  /** dimensões em px */
  w: number;
  h: number;
  /** nomes de cor pic ("lightyellow", "gray"…); ausente = padrão */
  fill?: string;
  stroke?: string;
}

export interface VEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** true = seta (arrow); false = linha simples (line) */
  arrow: boolean;
  /** Âncoras explícitas escolhidas ao conectar; ausente = automático (eixo). */
  fromSide?: Side;
  toSide?: Side;
}

/** Ponta de um conector LIVRE: ou ancorada a um nó (node+side), ou um ponto
 *  solto em px de tela (x,y). */
export interface VEndpoint {
  node?: string;
  side?: Side;
  x?: number;
  y?: number;
}

/** Conector livre (linha/seta ponto-a-ponto), endpoints livres ou ancorados —
 *  diferente de VEdge, que liga sempre dois nós. */
export interface VLine {
  id: string;
  arrow: boolean;
  a: VEndpoint;
  b: VEndpoint;
  label?: string;
}

/** Página do desenho (px, centro). Fixa o viewBox p/ mover um objeto não
 *  deslocar a figura toda (o rpic normaliza o viewBox ao bbox do conteúdo). */
export interface Page {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface VGraph {
  nodes: VNode[];
  edges: VEdge[];
  /** Conectores livres (linha/seta ponto-a-ponto). */
  lines?: VLine[];
  /** Moldura da página (fixa a extensão); ausente = auto pelo conteúdo. */
  page?: Page;
}

export const EMPTY_GRAPH: VGraph = { nodes: [], edges: [] };

/** Margem (px) entre os nós e a borda da página. */
const PAGE_MARGIN = 48;

/** Página que ENVOLVE os nós (+margem), unida à anterior — só cresce, nunca
 *  encolhe, então arrastar/adicionar um objeto não recentraliza os demais. */
export function growPage(nodes: VNode[], prev?: Page): Page | undefined {
  if (nodes.length === 0) return prev;
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const n of nodes) {
    l = Math.min(l, n.x - n.w / 2);
    t = Math.min(t, n.y - n.h / 2);
    r = Math.max(r, n.x + n.w / 2);
    b = Math.max(b, n.y + n.h / 2);
  }
  l -= PAGE_MARGIN;
  t -= PAGE_MARGIN;
  r += PAGE_MARGIN;
  b += PAGE_MARGIN;
  if (prev) {
    l = Math.min(l, prev.cx - prev.w / 2);
    t = Math.min(t, prev.cy - prev.h / 2);
    r = Math.max(r, prev.cx + prev.w / 2);
    b = Math.max(b, prev.cy + prev.h / 2);
  }
  return { cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t };
}

/** px por polegada — casa com o CSS e com os tamanhos padrão do pic. */
export const PX_PER_INCH = 96;

/** Tamanhos padrão por forma, em px (box pic = .75×.5in; circle rad .25in). */
export const DEFAULT_SIZE: Record<Shape, { w: number; h: number }> = {
  box: { w: 0.75 * PX_PER_INCH, h: 0.5 * PX_PER_INCH },
  circle: { w: 0.6 * PX_PER_INCH, h: 0.6 * PX_PER_INCH },
  ellipse: { w: 0.9 * PX_PER_INCH, h: 0.55 * PX_PER_INCH },
  diamond: { w: 0.95 * PX_PER_INCH, h: 0.7 * PX_PER_INCH },
};

/** Cores curadas (nomes X11/CSS aceitos pelo rpic) para o painel de estilo. */
export const FILL_COLORS = [
  "white",
  "lightyellow",
  "lightblue",
  "lightgreen",
  "lightpink",
  "lavender",
  "wheat",
  "gainsboro",
] as const;
export const STROKE_COLORS = [
  "black",
  "gray",
  "steelblue",
  "seagreen",
  "firebrick",
  "goldenrod",
] as const;

// ─────────────────────────── geração de pic ───────────────────────────

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** Escapa aspas duplas do label (pic delimita strings com "). */
function esc(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Lado de saída/entrada de uma aresta pelo eixo dominante (coords de tela). */
export function pickSides(from: VNode, to: VNode): [Side, Side] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["e", "w"] : ["w", "e"];
  }
  // dy > 0 = alvo mais ABAIXO na tela = sul
  return dy >= 0 ? ["s", "n"] : ["n", "s"];
}

/** px (centro, y p/ baixo) → polegadas pic (centro, y p/ cima). */
function toInchX(px: number): number {
  return px / PX_PER_INCH;
}
function toInchY(px: number): number {
  return -px / PX_PER_INCH;
}

function styleSuffix(n: VNode): string {
  let s = "";
  if (n.fill) s += ` shaded "${n.fill}"`;
  if (n.stroke) s += ` outlined "${n.stroke}"`;
  return s;
}

function nodePic(n: VNode, name: string): string {
  // tudo em polegadas pic (centro cx,cy com y p/ cima; largura/altura ww,hh)
  const cx = toInchX(n.x);
  const cy = toInchY(n.y);
  const ww = n.w / PX_PER_INCH;
  const hh = n.h / PX_PER_INCH;
  const at = `at (${num(cx)},${num(cy)})`;
  const label = n.label ? ` "${esc(n.label)}"` : "";
  const style = styleSuffix(n);
  switch (n.shape) {
    case "circle":
      return `${name}: circle${label} diam ${num(Math.min(ww, hh))} ${at}${style}`;
    case "ellipse":
      return `${name}: ellipse${label} wid ${num(ww)} ht ${num(hh)} ${at}${style}`;
    case "diamond": {
      // Polígono fechado com pontas em (cx, cy±hh/2) e (cx±ww/2, cy): caem nos
      // compass points (.n/.e/.s/.w) do bounding box, então as arestas se
      // conectam neles. `close shaded/outlined` é extensão documentada do rpic
      // (docs/extensions.md). Label vai no centro do polígono.
      const dx = ww / 2;
      const dy = hh / 2;
      const p = (px: number, py: number) => `(${num(px)},${num(py)})`;
      return (
        `${name}: line from ${p(cx, cy + dy)} to ${p(cx + dx, cy)} ` +
        `to ${p(cx, cy - dy)} to ${p(cx - dx, cy)} close${style}${label}`
      );
    }
    case "box":
    default:
      return `${name}: box${label} wid ${num(ww)} ht ${num(hh)} ${at}${style}`;
  }
}

/** Posição px (tela) de uma ponta — ancorada usa o centro do nó (aprox. p/ label). */
function endpointPx(e: VEndpoint, byId: Map<string, VNode>): { x: number; y: number } {
  if (e.node) {
    const n = byId.get(e.node);
    if (n) return { x: n.x, y: n.y };
  }
  return { x: e.x ?? 0, y: e.y ?? 0 };
}
function endpointPic(e: VEndpoint, name: Map<string, string>): string {
  if (e.node && e.side) return `${name.get(e.node) ?? e.node}.${e.side}`;
  return `(${num(toInchX(e.x ?? 0))},${num(toInchY(e.y ?? 0))})`;
}
function linePic(ln: VLine, byId: Map<string, VNode>, name: Map<string, string>): string {
  const verb = ln.arrow ? "arrow" : "line";
  let s = `${verb} from ${endpointPic(ln.a, name)} to ${endpointPic(ln.b, name)}`;
  if (ln.label) {
    const a = endpointPx(ln.a, byId);
    const b = endpointPx(ln.b, byId);
    s += `\n"${esc(ln.label)}" at (${num(toInchX((a.x + b.x) / 2))},${num(toInchY((a.y + b.y) / 2))}) above`;
  }
  return s;
}

function edgePic(e: VEdge, byId: Map<string, VNode>, name: Map<string, string>): string | null {
  const a = byId.get(e.from);
  const b = byId.get(e.to);
  if (!a || !b) return null;
  const [sa, sb] = e.fromSide && e.toSide ? [e.fromSide, e.toSide] : pickSides(a, b);
  const verb = e.arrow ? "arrow" : "line";
  let line = `${verb} from ${name.get(a.id)}.${sa} to ${name.get(b.id)}.${sb}`;
  if (e.label) {
    const mx = num(toInchX((a.x + b.x) / 2));
    const my = num(toInchY((a.y + b.y) / 2));
    line += `\n"${esc(e.label)}" at (${mx},${my}) above`;
  }
  return line;
}

/** Gera o código pic a partir do grafo (`.PS`/nós/arestas/`.PE`), sem blob. */
export function graphToPic(g: VGraph): string {
  const name = new Map<string, string>();
  g.nodes.forEach((n, i) => name.set(n.id, `N${i + 1}`));
  const byId = new Map(g.nodes.map((n) => [n.id, n]));

  const body: string[] = [];
  for (const n of g.nodes) body.push(nodePic(n, name.get(n.id)!));
  for (const e of g.edges) {
    const line = edgePic(e, byId, name);
    if (line) body.push(line);
  }
  for (const ln of g.lines ?? []) body.push(linePic(ln, byId, name));
  // Moldura da página POR ÚLTIMO (não desloca os índices `s{i}` dos objetos):
  // branca → invisível no papel; fixa o bbox (`invis` não contaria — o rpic só
  // soma ao bbox formas visíveis).
  if (g.page) {
    const { cx, cy, w, h } = g.page;
    body.push(
      `PAGE: box wid ${num(w / PX_PER_INCH)} ht ${num(h / PX_PER_INCH)} ` +
        `at (${num(toInchX(cx))},${num(toInchY(cy))}) outlined "#ffffff"`,
    );
  }
  return `.PS\n${body.join("\n")}\n.PE\n`;
}

// ─────────────────── ler o grafo de volta do pic gerado ───────────────────

const STR = `"((?:[^"\\\\]|\\\\.)*)"`; // string pic com aspas escapadas
const N = `([-\\d.]+)`; // número
const P = `\\(${N},${N}\\)`; // ponto (x,y)

function unesc(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function px(inch: number): number {
  return Math.round(inch * PX_PER_INCH) + 0; // `+ 0` normaliza -0 → 0
}
function pyf(inch: number): number {
  return Math.round(-inch * PX_PER_INCH) + 0;
}
/** Extrai `shaded "…"` / `outlined "…"` de um trecho. */
function parseStyle(rest: string): { fill?: string; stroke?: string } {
  const fill = new RegExp(`shaded\\s+${STR}`).exec(rest)?.[1];
  const stroke = new RegExp(`outlined\\s+${STR}`).exec(rest)?.[1];
  return { fill: fill && unesc(fill), stroke: stroke && unesc(stroke) };
}

const RE_BOX = new RegExp(`^(\\w+):\\s*(box|ellipse)\\s+(?:${STR}\\s+)?wid\\s+${N}\\s+ht\\s+${N}\\s+at\\s+${P}(.*)$`);
const RE_CIRCLE = new RegExp(`^(\\w+):\\s*circle\\s+(?:${STR}\\s+)?diam\\s+${N}\\s+at\\s+${P}(.*)$`);
const RE_DIAMOND = new RegExp(`^(\\w+):\\s*line\\s+from\\s+${P}\\s+to\\s+${P}\\s+to\\s+${P}\\s+to\\s+${P}\\s+close(.*)$`);
const RE_CONN = /^(arrow|line)\s+from\s+(\S.*?)\s+to\s+(\S.*?)\s*$/;
const RE_EDGE_LABEL = new RegExp(`^${STR}\\s+at\\s+${P}\\s*(?:above|below)?\\s*$`);

/** Ponta de conector: `(x,y)` livre ou `Nome.side` ancorada. */
function parseEndpoint(s: string): VEndpoint | null {
  let m = /^\(([-\d.]+),([-\d.]+)\)$/.exec(s);
  if (m) return { x: px(+m[1]), y: pyf(+m[2]) };
  m = /^(\w+)\.(\w+)$/.exec(s);
  if (m) return { node: m[1], side: m[2] as Side };
  return null;
}

/**
 * Reconstrói o grafo lendo o pic gerado por `graphToPic`. Retorna null se o
 * código não casar com esse formato (pic escrito à mão) — aí não há edição
 * visual. Os ids dos nós são os próprios nomes pic (N1, N2…); a ordem dos nós
 * casa com os `<g id="s{i}">` do SVG (nós vêm primeiro).
 */
export function parsePic(source: string): VGraph | null {
  const nodes: VNode[] = [];
  const edges: VEdge[] = [];
  const lines: VLine[] = [];
  let page: Page | undefined;
  let last: { label?: string } | null = null;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line === ".PS" || line === ".PE") continue;
    let m: RegExpExecArray | null;
    if ((m = RE_BOX.exec(line))) {
      const [, id, shape, label, w, h, x, y, rest] = m;
      if (id === "PAGE") {
        page = { cx: px(+x), cy: pyf(+y), w: px(+w), h: px(+h) };
        last = null;
        continue;
      }
      nodes.push({
        id,
        shape: shape as Shape,
        label: label ? unesc(label) : "",
        x: px(+x),
        y: pyf(+y),
        w: px(+w),
        h: px(+h),
        ...parseStyle(rest),
      });
      last = null;
    } else if ((m = RE_CIRCLE.exec(line))) {
      const [, id, label, d, x, y, rest] = m;
      nodes.push({
        id,
        shape: "circle",
        label: label ? unesc(label) : "",
        x: px(+x),
        y: pyf(+y),
        w: px(+d),
        h: px(+d),
        ...parseStyle(rest),
      });
      last = null;
    } else if ((m = RE_DIAMOND.exec(line))) {
      const [, id, x1, y1, x2, y2, , , , , rest] = m;
      // pontos: (cx,cy+dy) (cx+dx,cy) (cx,cy-dy) (cx-dx,cy)
      const cx = +x1;
      const cy = +y2;
      const wInch = 2 * (+x2 - cx);
      const hInch = 2 * (+y1 - cy);
      const labelM = new RegExp(`${STR}\\s*$`).exec(
        rest.replace(new RegExp(`shaded\\s+${STR}`), "").replace(new RegExp(`outlined\\s+${STR}`), ""),
      );
      nodes.push({
        id,
        shape: "diamond",
        label: labelM ? unesc(labelM[1]) : "",
        x: px(cx),
        y: pyf(cy),
        w: px(wInch),
        h: px(hInch),
        ...parseStyle(rest),
      });
      last = null;
    } else if ((m = RE_CONN.exec(line))) {
      const [, verb, aS, bS] = m;
      const a = parseEndpoint(aS);
      const b = parseEndpoint(bS);
      if (a && b && a.node && a.side && b.node && b.side) {
        // ambos ancorados → aresta nó-a-nó (caminho existente)
        const edge: VEdge = { id: `${a.node}-${b.node}-${edges.length}`, from: a.node, to: b.node, arrow: verb === "arrow", fromSide: a.side, toSide: b.side };
        edges.push(edge);
        last = edge;
      } else if (a && b) {
        // alguma ponta livre → conector livre
        const ln: VLine = { id: `L${lines.length}`, arrow: verb === "arrow", a, b };
        lines.push(ln);
        last = ln;
      } else {
        last = null;
      }
    } else if (last && (m = RE_EDGE_LABEL.exec(line))) {
      last.label = unesc(m[1]);
    } else {
      last = null; // linha desconhecida — não interrompe, só não é conector+label
    }
  }
  if (nodes.length === 0 && lines.length === 0) return null;
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    lines,
    page,
  };
}
