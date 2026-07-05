import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@rpic/design-system";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { type ObjectGeometry } from "@/lib/rpic";
import {
  FILL_COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  STROKE_COLORS,
  type Side,
  type VEdge,
  type VEndpoint,
  type VGraph,
  type VLine,
  type VNode,
} from "@/lib/visualGraph";

export type Tool = "select" | "line" | "arrow" | "arc" | "spline";

interface Props {
  graph: VGraph;
  onChange: (g: VGraph) => void;
  /** O `preview-stage` (SVG injetado) e o container rolável do preview. */
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  /** Recalcula posições ao mudar o zoom (arraste usa Δtela/zoom). */
  zoom: number;
  /** Ferramenta ativa: select ou desenhar linha/seta livre. */
  tool: Tool;
  /** Volta p/ "select" após desenhar. */
  onToolDone: () => void;
  /** Geometria por objeto (v0.7.0), alinhada a `s{i}` — nó i → objects[i]. */
  objects?: ObjectGeometry[];
  /** Pular o cursor do editor para a linha do objeto (duplo-clique). */
  onJumpToLine?: (line: number, col?: number) => void;
}

type Sel = { kind: "node" | "edge" | "line"; id: string } | null;
interface Box {
  id: string;
  left: number;
  top: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}
interface Pt {
  x: number;
  y: number;
}

// Âncoras de conexão por forma (o centro fica livre p/ mover/selecionar).
const BOX_SIDES: Side[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const DIAMOND_SIDES: Side[] = ["n", "s", "e", "w"];
const SHOW_DIST = 30; // px: distância p/ revelar a âncora mais próxima

function sidesFor(shape: VNode["shape"]): Side[] {
  return shape === "diamond" ? DIAMOND_SIDES : BOX_SIDES;
}

/** Posição de uma âncora dentro do box (0..w, 0..h). */
function anchorXY(side: Side, w: number, h: number): Pt {
  const x = side.includes("w") ? 0 : side.includes("e") ? w : w / 2;
  const y = side.includes("n") ? 0 : side.includes("s") ? h : h / 2;
  return { x, y };
}
function anchorWorld(b: Box, side: Side): Pt {
  const a = anchorXY(side, b.w, b.h);
  return { x: b.left + a.x, y: b.top + a.y };
}

/** Lados automáticos (eixo dominante) entre dois boxes (coords de tela). */
function autoSides(a: Box, b: Box): [Side, Side] {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["e", "w"] : ["w", "e"];
  return dy >= 0 ? ["s", "n"] : ["n", "s"];
}

/** Âncora (do conjunto da forma) mais próxima de um ponto de tela + a distância. */
function nearestAnchor(b: Box, shape: VNode["shape"], px: number, py: number): { side: Side; dist: number } {
  let best: Side = "n";
  let bd = Infinity;
  for (const s of sidesFor(shape)) {
    const w = anchorWorld(b, s);
    const d = Math.hypot(w.x - px, w.y - py);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return { side: best, dist: bd };
}

function readTranslate(el: Element | null): Pt {
  const t = el?.getAttribute("transform");
  const m = t && /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(t);
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
}

/**
 * Camada de edição SOBRE o render real do rpic. Cada nó corresponde, em ordem,
 * a um `<g id="s{i}">` no SVG; a posição é lida via `getBoundingClientRect` num
 * loop rAF (só setState quando muda). graph px == unidade do SVG (96/pol) →
 * arrastar é `Δtela/zoom`; no drop mantém o `translate` do `<g>` até o recompile
 * (sem fantasma). Só a âncora mais próxima do cursor aparece; arestas
 * selecionam clicando na linha e reancoram arrastando as pontas.
 */
export function VisualOverlay({ graph, onChange, stageRef, canvasRef, zoom, tool, onToolDone, objects, onJumpToLine }: Props) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [hover, setHover] = useState<{ id: string; side: Side } | null>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; bx: number; by: number; moved: boolean } | null>(null);
  const connect = useRef<{ fromId: string; fromSide: Side } | null>(null);
  const edgeDrag = useRef<{ edgeId: string; end: "from" | "to"; nodeId: string } | null>(null);
  const [rubber, setRubber] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const lines = graph.lines ?? [];

  // Auto-seleciona o nó recém-criado (abre o inspetor).
  const prevCount = useRef(graph.nodes.length);
  useEffect(() => {
    if (graph.nodes.length === 1) setSel({ kind: "node", id: graph.nodes[0].id });
  }, []); // só no mount
  useEffect(() => {
    if (graph.nodes.length > prevCount.current) {
      const last = graph.nodes[graph.nodes.length - 1];
      if (last) setSel({ kind: "node", id: last.id });
    }
    prevCount.current = graph.nodes.length;
  }, [graph.nodes]);

  const nodeElOf = (id: string): SVGGraphicsElement | null => {
    const i = graph.nodes.findIndex((n) => n.id === id);
    return i < 0 ? null : (stageRef.current?.querySelector(`#s${i}`) ?? null);
  };
  const boxOf = (id: string) => boxes.find((b) => b.id === id);

  // Loop rAF que mantém as alças coladas ao SVG (só setState quando muda).
  const boxesRef = useRef<Box[]>([]);
  useEffect(() => {
    let raf = 0;
    const same = (a: Box[], b: Box[]) =>
      a.length === b.length &&
      a.every((x, i) => {
        const y = b[i];
        return y && x.id === y.id && Math.abs(x.left - y.left) < 0.5 && Math.abs(x.top - y.top) < 0.5 && Math.abs(x.w - y.w) < 0.5 && Math.abs(x.h - y.h) < 0.5;
      });
    const compute = (): Box[] => {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (!stage || !canvas) return boxesRef.current;
      const cr = canvas.getBoundingClientRect();
      const next: Box[] = [];
      graph.nodes.forEach((n, i) => {
        const el = stage.querySelector(`#s${i}`);
        if (!el) return;
        const r = (el as SVGGraphicsElement).getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const left = r.left - cr.left;
        const top = r.top - cr.top;
        next.push({ id: n.id, left, top, w: r.width, h: r.height, cx: left + r.width / 2, cy: top + r.height / 2 });
      });
      return next;
    };
    const loop = () => {
      if (!drag.current && !connect.current && !edgeDrag.current) {
        const next = compute();
        if (!same(next, boxesRef.current)) {
          boxesRef.current = next;
          setBoxes(next);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [graph.nodes, stageRef, canvasRef]);

  function updateNode(id: string, patch: Partial<VNode>) {
    onChange({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }
  function updateEdge(id: string, patch: Partial<VEdge>) {
    onChange({ ...graph, edges: graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }
  function updateLine(id: string, patch: Partial<VLine>) {
    onChange({ ...graph, lines: lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }
  /** Duplo-clique: pula o cursor do editor para a linha do objeto (v0.7.0:
   *  objects[i] é alinhado a `s{i}`; nó i → objects[i]). */
  function jumpToCode(id: string) {
    if (!onJumpToLine || !objects) return;
    const o = objects[graph.nodes.findIndex((n) => n.id === id)];
    if (o?.line) onJumpToLine(o.line, o.col ?? undefined);
  }
  function deleteSel() {
    if (!sel) return;
    if (sel.kind === "node") {
      onChange({ ...graph, nodes: graph.nodes.filter((n) => n.id !== sel.id), edges: graph.edges.filter((e) => e.from !== sel.id && e.to !== sel.id) });
    } else if (sel.kind === "edge") {
      onChange({ ...graph, edges: graph.edges.filter((e) => e.id !== sel.id) });
    } else {
      onChange({ ...graph, lines: lines.filter((l) => l.id !== sel.id) });
    }
    setSel(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        deleteSel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, graph]);

  const rel = (e: { clientX: number; clientY: number }): Pt => {
    const cr = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - cr.left, y: e.clientY - cr.top };
  };

  // Transform modelo(px)→tela: derivado de um nó (exato) ou da moldura da página
  // (último `<g id="s…">`), permitindo posicionar pontos LIVRES sem `#s{i}`.
  function transform(): { s: number; ox: number; oy: number } | null {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return null;
    // usa um nó dimensionado (texto tem w/h nominal ≠ renderizado)
    const n0 = graph.nodes.find((n) => n.shape !== "text");
    const b0 = n0 && boxOf(n0.id);
    if (n0 && b0) {
      const s = b0.w / n0.w;
      return { s, ox: b0.cx - s * n0.x, oy: b0.cy - s * n0.y };
    }
    // sem nós dimensionados: deriva do <svg> (viewBox ≈ canvas + pad) e da página.
    const svg = stage.querySelector("svg");
    const vb = svg?.getAttribute("viewBox")?.split(/\s+/).map(Number);
    if (svg && vb && vb.length === 4 && graph.page) {
      const r = svg.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      const s = r.width / vb[2]; // px de tela por unidade SVG (= px do modelo)
      const pad = (vb[2] - graph.page.w) / 2; // ~1.6px em cada lado do canvas
      return {
        s,
        ox: r.left - cr.left + s * (pad - (graph.page.cx - graph.page.w / 2)),
        oy: r.top - cr.top + s * (pad - (graph.page.cy - graph.page.h / 2)),
      };
    }
    return null;
  }
  function toScreen(mx: number, my: number, tf = transform()): Pt | null {
    return tf ? { x: tf.s * mx + tf.ox, y: tf.s * my + tf.oy } : null;
  }
  function toModel(sx: number, sy: number, tf = transform()): Pt | null {
    return tf ? { x: (sx - tf.ox) / tf.s, y: (sy - tf.oy) / tf.s } : null;
  }
  /** Posição de tela de uma ponta de conector (ancorada ou livre). */
  function endpointScreen(ep: VEndpoint, tf = transform()): Pt | null {
    if (ep.node && ep.side) {
      const b = boxOf(ep.node);
      return b ? anchorWorld(b, ep.side) : null;
    }
    return toScreen(ep.x ?? 0, ep.y ?? 0, tf);
  }
  /** Ponto de tela → ponta: snap à âncora de um nó se perto, senão livre. */
  function snapEndpoint(p: Pt): VEndpoint {
    const box = boxes.find((b) => p.x >= b.left - 12 && p.x <= b.left + b.w + 12 && p.y >= b.top - 12 && p.y <= b.top + b.h + 12);
    if (box) {
      const shape = graph.nodes.find((n) => n.id === box.id)!.shape;
      return { node: box.id, side: nearestAnchor(box, shape, p.x, p.y).side };
    }
    const m = toModel(p.x, p.y);
    return m ? { x: Math.round(m.x), y: Math.round(m.y) } : { x: 0, y: 0 };
  }

  // ── mover nó (mantém o translate no SVG até o recompile → sem fantasma) ──
  function onNodeDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setSel({ kind: "node", id });
    const n = graph.nodes.find((x) => x.id === id)!;
    const base = readTranslate(nodeElOf(id));
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, bx: base.x, by: base.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onNodeMove(e: React.PointerEvent, b: Box, shape: VNode["shape"]) {
    const d = drag.current;
    if (d) {
      const dxs = e.clientX - d.sx;
      const dys = e.clientY - d.sy;
      if (Math.abs(dxs) + Math.abs(dys) > 2) d.moved = true;
      (e.currentTarget as HTMLElement).style.transform = `translate(${dxs}px,${dys}px)`;
      nodeElOf(d.id)?.setAttribute("transform", `translate(${d.bx + dxs / zoom},${d.by + dys / zoom})`);
      return;
    }
    // hover: revela só a âncora mais próxima, e só quando o cursor chega perto
    const p = rel(e);
    const near = nearestAnchor(b, shape, p.x, p.y);
    setHover(near.dist <= SHOW_DIST ? { id: b.id, side: near.side } : null);
  }
  function onNodeUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const el = e.currentTarget as HTMLElement;
    el.releasePointerCapture?.(e.pointerId);
    el.style.transform = "";
    if (d.moved) updateNode(d.id, { x: d.ox + (e.clientX - d.sx) / zoom, y: d.oy + (e.clientY - d.sy) / zoom });
  }

  // ── conectar a partir de uma âncora ── (listeners de window: imunes ao
  // remount da âncora durante o arraste, ao contrário de setPointerCapture)
  function onAnchorDown(e: React.PointerEvent, id: string, side: Side) {
    e.preventDefault();
    e.stopPropagation();
    connect.current = { fromId: id, fromSide: side };
    const b = boxOf(id);
    if (b) {
      const w = anchorWorld(b, side);
      setRubber({ x1: w.x, y1: w.y, x2: w.x, y2: w.y });
    }
    const move = (ev: PointerEvent) => {
      const p = rel(ev);
      setRubber((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const c = connect.current;
      connect.current = null;
      setRubber(null);
      setHover(null);
      if (!c) return;
      const p = rel(ev);
      const target = boxes.find((bx) => p.x >= bx.left && p.x <= bx.left + bx.w && p.y >= bx.top && p.y <= bx.top + bx.h);
      if (target && target.id !== c.fromId) {
        const shape = graph.nodes.find((n) => n.id === target.id)!.shape;
        let na = nearestAnchor(target, shape, p.x, p.y);
        if (na.dist > Math.min(target.w, target.h) / 2) {
          const src = boxOf(c.fromId);
          if (src) na = nearestAnchor(target, shape, src.cx, src.cy);
        }
        // id determinístico = o mesmo que `parsePic` atribui (`from-to-index`),
        // p/ a seleção sobreviver ao round-trip pelo código.
        const edge: VEdge = {
          id: `${c.fromId}-${target.id}-${graph.edges.length}`,
          from: c.fromId,
          to: target.id,
          arrow: true,
          fromSide: c.fromSide,
          toSide: na.side,
        };
        onChange({ ...graph, edges: [...graph.edges, edge] });
        setSel({ kind: "edge", id: edge.id });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── reancorar a ponta de uma aresta selecionada ── (idem, via window)
  function onEndpointDown(e: React.PointerEvent, edgeId: string, end: "from" | "to", nodeId: string) {
    e.preventDefault();
    e.stopPropagation();
    edgeDrag.current = { edgeId, end, nodeId };
    setRubber({ x1: rel(e).x, y1: rel(e).y, x2: rel(e).x, y2: rel(e).y });
    const move = (ev: PointerEvent) => {
      const p = rel(ev);
      setRubber((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = edgeDrag.current;
      edgeDrag.current = null;
      setRubber(null);
      if (!d) return;
      const b = boxOf(d.nodeId);
      if (!b) return;
      const shape = graph.nodes.find((n) => n.id === d.nodeId)!.shape;
      const p = rel(ev);
      const s = nearestAnchor(b, shape, p.x, p.y).side;
      updateEdge(d.edgeId, d.end === "from" ? { fromSide: s } : { toSide: s });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── desenhar linha/seta LIVRE (ferramenta ativa) ── (via window)
  function onDrawDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const p0 = rel(e);
    const start = snapEndpoint(p0);
    const s0 = endpointScreen(start) ?? p0;
    setRubber({ x1: s0.x, y1: s0.y, x2: p0.x, y2: p0.y });
    const move = (ev: PointerEvent) => {
      const p = rel(ev);
      setRubber((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRubber(null);
      const p1 = rel(ev);
      const end = snapEndpoint(p1);
      const s1 = endpointScreen(end) ?? p1;
      if (Math.hypot(s1.x - s0.x, s1.y - s0.y) < 6) {
        onToolDone();
        return; // clique sem arrasto → cancela
      }
      const ln: VLine = { id: `L${lines.length}`, arrow: tool === "arrow", a: start, b: end };
      if (tool === "arc") ln.kind = "arc";
      if (tool === "spline") {
        ln.kind = "spline";
        // Nasce com 1 ponto de controle (offset perpendicular ao meio) p/ já ter
        // curvatura visível; o usuário arrasta esse ponto (alça "linemid") depois.
        const mx = (s0.x + s1.x) / 2;
        const my = (s0.y + s1.y) / 2;
        const dx = s1.x - s0.x;
        const dy = s1.y - s0.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const offset = Math.max(24, len * 0.25);
        const mid = toModel(mx + nx * offset, my + ny * offset);
        if (mid) ln.pts = [{ x: Math.round(mid.x), y: Math.round(mid.y) }];
      }
      onChange({ ...graph, lines: [...lines, ln] });
      setSel({ kind: "line", id: ln.id });
      onToolDone();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── mover/reancorar a ponta de um conector livre selecionado ──
  function onLineEndDown(e: React.PointerEvent, lineId: string, end: "a" | "b") {
    e.preventDefault();
    e.stopPropagation();
    const p0 = rel(e);
    setRubber({ x1: p0.x, y1: p0.y, x2: p0.x, y2: p0.y });
    const move = (ev: PointerEvent) => {
      const p = rel(ev);
      setRubber((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRubber(null);
      const ep = snapEndpoint(rel(ev));
      updateLine(lineId, end === "a" ? { a: ep } : { b: ep });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── arrastar o ponto de controle de um spline selecionado (curva) ──
  function onLineMidDown(e: React.PointerEvent, lineId: string, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    const p0 = rel(e);
    setRubber({ x1: p0.x, y1: p0.y, x2: p0.x, y2: p0.y });
    const move = (ev: PointerEvent) => {
      const p = rel(ev);
      setRubber((c) => (c ? { ...c, x2: p.x, y2: p.y } : c));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRubber(null);
      const ep = snapEndpoint(rel(ev));
      const ln = lines.find((l) => l.id === lineId);
      if (!ln) return;
      const pts = [...(ln.pts ?? [])];
      pts[idx] = ep;
      updateLine(lineId, { pts });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Pontos das arestas (âncoras efetivas).
  function endpoints(e: VEdge): { p1: Pt; p2: Pt; a: Box; b: Box } | null {
    const a = boxOf(e.from);
    const b = boxOf(e.to);
    if (!a || !b) return null;
    const [fs, ts] = e.fromSide && e.toSide ? [e.fromSide, e.toSide] : autoSides(a, b);
    return { p1: anchorWorld(a, fs), p2: anchorWorld(b, ts), a, b };
  }

  const selNode = sel?.kind === "node" ? graph.nodes.find((n) => n.id === sel.id) : undefined;
  const selEdge = sel?.kind === "edge" ? graph.edges.find((e) => e.id === sel.id) : undefined;
  const selEnds = selEdge ? endpoints(selEdge) : null;
  const selLine = sel?.kind === "line" ? lines.find((l) => l.id === sel.id) : undefined;
  const selConn = selEdge ?? selLine;
  const updConn = (patch: Partial<VLine>) =>
    selEdge ? updateEdge(selEdge.id, patch) : selLine ? updateLine(selLine.id, patch) : undefined;
  type Heads = "none" | "end" | "start" | "both";
  const headsVal: Heads = selConn ? (selConn.arrow && selConn.back ? "both" : selConn.arrow ? "end" : selConn.back ? "start" : "none") : "none";
  const setHeads = (v: Heads) =>
    updConn({ arrow: v === "end" || v === "both", back: v === "start" || v === "both" });
  const DASH_OPTS = [
    { v: undefined, el: "──" },
    { v: "dashed" as const, el: "╌╌" },
    { v: "dotted" as const, el: "┈┈" },
  ];
  const THICK_OPTS = [
    { v: undefined, el: <div className="h-px w-5 bg-current" /> },
    { v: 1.5, el: <div className="h-0.5 w-5 bg-current" /> },
    { v: 3, el: <div className="h-1 w-5 rounded-full bg-current" /> },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="visual-overlay">
      {/* Arestas: linha invisível clicável (selecionar) + realce da selecionada */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {graph.edges.map((edge) => {
          const ep = endpoints(edge);
          if (!ep) return null;
          const selected = sel?.kind === "edge" && sel.id === edge.id;
          return (
            <g key={edge.id}>
              <line
                x1={ep.p1.x}
                y1={ep.p1.y}
                x2={ep.p2.x}
                y2={ep.p2.y}
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel({ kind: "edge", id: edge.id });
                }}
                data-testid="visual-edge-hit"
              />
              {selected && <line x1={ep.p1.x} y1={ep.p1.y} x2={ep.p2.x} y2={ep.p2.y} stroke="var(--color-accent)" strokeWidth={2} />}
            </g>
          );
        })}
        {/* Conectores livres (linha/seta/arco/spline) — o desenho curvo real fica
            a cargo do preview do rpic; aqui é só o traço reto p/ hit-test/seleção
            (spline passa pelos pontos intermediários, dando uma prévia poligonal). */}
        {lines.map((ln) => {
          const p1 = endpointScreen(ln.a);
          const p2 = endpointScreen(ln.b);
          if (!p1 || !p2) return null;
          const mids = (ln.pts ?? []).map((pt) => endpointScreen(pt)).filter((pt): pt is Pt => !!pt);
          const pointsAttr = [p1, ...mids, p2].map((pt) => `${pt.x},${pt.y}`).join(" ");
          const selected = sel?.kind === "line" && sel.id === ln.id;
          return (
            <g key={ln.id}>
              <polyline
                points={pointsAttr}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel({ kind: "line", id: ln.id });
                }}
                data-testid="visual-line-hit"
              />
              {selected && (
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  strokeDasharray={ln.kind ? "4 3" : undefined}
                />
              )}
            </g>
          );
        })}
        {rubber && <line x1={rubber.x1} y1={rubber.y1} x2={rubber.x2} y2={rubber.y2} stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="4 4" />}
      </svg>

      {/* Nós: box de mover + a âncora mais próxima do cursor */}
      {boxes.map((b) => {
        const node = graph.nodes.find((n) => n.id === b.id);
        if (!node) return null;
        const selected = sel?.kind === "node" && sel.id === b.id;
        const showSide = hover?.id === b.id ? hover.side : null;
        return (
          <div
            key={b.id}
            className={cn(
              "pointer-events-auto absolute cursor-move rounded-sm transition-[outline] duration-100",
              selected ? "outline outline-2 outline-(--color-accent)" : "outline outline-1 outline-transparent hover:outline-(--color-accent)/40",
            )}
            style={{ left: b.left, top: b.top, width: b.w, height: b.h }}
            onPointerDown={(e) => onNodeDown(e, b.id)}
            onPointerMove={(e) => onNodeMove(e, b, node.shape)}
            onPointerUp={onNodeUp}
            onPointerLeave={() => !drag.current && !connect.current && setHover((h) => (h?.id === b.id ? null : h))}
            onDoubleClick={() => jumpToCode(b.id)}
            title={onJumpToLine ? "2× → código" : undefined}
            data-testid="visual-handle"
          >
            {showSide && (() => {
              const a = anchorXY(showSide, b.w, b.h);
              return (
                <div
                  title={`.${showSide}`}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-(--color-surface) bg-(--color-accent) shadow"
                  style={{ left: a.x, top: a.y }}
                  onPointerDown={(e) => onAnchorDown(e, b.id, showSide)}
                  data-testid={`visual-anchor-${showSide}`}
                />
              );
            })()}
          </div>
        );
      })}

      {/* Pontas da aresta selecionada — arraste p/ reancorar */}
      {selEdge &&
        selEnds &&
        (["from", "to"] as const).map((end) => {
          const p = end === "from" ? selEnds.p1 : selEnds.p2;
          const nodeId = end === "from" ? selEdge.from : selEdge.to;
          return (
            <div
              key={end}
              className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-(--color-accent) bg-(--color-surface)"
              style={{ left: p.x, top: p.y }}
              onPointerDown={(e) => onEndpointDown(e, selEdge.id, end, nodeId)}
              data-testid={`visual-endpoint-${end}`}
            />
          );
        })}

      {/* Pontas do conector livre selecionado — arraste p/ mover/reancorar */}
      {selLine &&
        (["a", "b"] as const).map((end) => {
          const p = endpointScreen(selLine[end]);
          if (!p) return null;
          return (
            <div
              key={end}
              className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-(--color-accent) bg-(--color-surface)"
              style={{ left: p.x, top: p.y }}
              onPointerDown={(e) => onLineEndDown(e, selLine.id, end)}
              data-testid={`visual-lineend-${end}`}
            />
          );
        })}

      {/* Ponto(s) de controle do spline selecionado — arraste p/ mudar a curva */}
      {selLine?.kind === "spline" &&
        (selLine.pts ?? []).map((pt, idx) => {
          const p = endpointScreen(pt);
          if (!p) return null;
          return (
            <div
              key={idx}
              className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-(--color-accent) bg-(--color-accent-soft)"
              style={{ left: p.x, top: p.y }}
              onPointerDown={(e) => onLineMidDown(e, selLine.id, idx)}
              data-testid={`visual-linemid-${idx}`}
            />
          );
        })}

      {/* Camada de captura no modo desenho (linha/seta livre) */}
      {tool !== "select" && (
        <div
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
          onPointerDown={onDrawDown}
          data-testid="visual-draw-layer"
        />
      )}

      {/* Inspetor */}
      {(selNode || selEdge || selLine) && (
        <div
          className="pointer-events-auto absolute top-2 right-2 w-52 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 shadow-lg"
          data-testid="visual-inspector"
        >
          <label className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
            {t("visual.inspector.label")}
          </label>
          <textarea
            rows={selNode ? 2 : 1}
            value={selNode?.label ?? selEdge?.label ?? selLine?.label ?? ""}
            onChange={(e) =>
              selNode
                ? updateNode(selNode.id, { label: e.target.value })
                : selEdge
                  ? updateEdge(selEdge.id, { label: e.target.value })
                  : updateLine(selLine!.id, { label: e.target.value })
            }
            placeholder={selNode ? t("visual.inspector.multiline") : undefined}
            data-testid="visual-label-input"
            className="mb-2 w-full resize-none rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-2 py-1 text-sm text-(--color-text) outline-none focus:border-(--color-accent)"
          />
          {selNode && (
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-(--color-text-body)">
              <input
                type="checkbox"
                checked={!!selNode.math}
                onChange={(e) => updateNode(selNode.id, { math: e.target.checked || undefined })}
                data-testid="visual-math-toggle"
              />
              {t("visual.inspector.math")}
            </label>
          )}
          {selNode && (
            <div className="mb-3">
              <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
                {t("visual.inspector.font")}
              </span>
              <div className="mb-1 flex gap-1">
                <button
                  onClick={() => updateNode(selNode.id, { bold: !selNode.bold || undefined })}
                  data-testid="visual-bold"
                  className={cn(
                    "h-7 flex-1 rounded-(--radius-sm) border font-bold",
                    selNode.bold ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)",
                  )}
                >
                  B
                </button>
                <button
                  onClick={() => updateNode(selNode.id, { italic: !selNode.italic || undefined })}
                  data-testid="visual-italic"
                  className={cn(
                    "h-7 flex-1 rounded-(--radius-sm) border italic",
                    selNode.italic ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)",
                  )}
                >
                  I
                </button>
                <select
                  value={selNode.fontsize ?? ""}
                  onChange={(e) => updateNode(selNode.id, { fontsize: e.target.value ? Number(e.target.value) : undefined })}
                  data-testid="visual-fontsize"
                  className="h-7 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-1 text-xs text-(--color-text)"
                >
                  <option value="">pt</option>
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={selNode.font ?? ""}
                onChange={(e) => updateNode(selNode.id, { font: e.target.value || undefined })}
                data-testid="visual-font-family"
                className="w-full rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-2 py-1 text-xs text-(--color-text)"
                style={{ fontFamily: selNode.font || undefined }}
              >
                <option value="">{t("visual.inspector.fontDefault")}</option>
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selNode && (
            <Seg
              title={t("visual.inspector.rotate")}
              value={selNode.rotate ?? 0}
              onPick={(v) => updateNode(selNode.id, { rotate: v || undefined })}
              options={[
                { v: 0, el: "0°" },
                { v: 45, el: "45°" },
                { v: 90, el: "90°" },
                { v: -45, el: "−45°" },
              ]}
            />
          )}
          {selNode && (
            <>
              <Swatches title={t("visual.inspector.fill")} colors={FILL_COLORS} value={selNode.fill} onPick={(c) => updateNode(selNode.id, { fill: c })} noneLabel={t("visual.none")} />
              <Swatches title={t("visual.inspector.stroke")} colors={STROKE_COLORS} value={selNode.stroke} onPick={(c) => updateNode(selNode.id, { stroke: c })} noneLabel={t("visual.none")} />
              <Seg title={t("visual.inspector.hatch")} value={selNode.hatch} onPick={(v) => updateNode(selNode.id, { hatch: v })} options={[{ v: undefined, el: "∅" }, { v: "hatch" as const, el: "▧" }, { v: "crosshatch" as const, el: "▦" }]} />
              <Seg title={t("visual.inspector.line")} value={selNode.dash} onPick={(v) => updateNode(selNode.id, { dash: v })} options={DASH_OPTS} />
              <Seg title={t("visual.inspector.thick")} value={selNode.thick} onPick={(v) => updateNode(selNode.id, { thick: v })} options={THICK_OPTS} />
            </>
          )}
          {selConn && (
            <>
              <Seg title={t("visual.inspector.ends")} value={headsVal} onPick={setHeads} options={[{ v: "none" as const, el: "─" }, { v: "end" as const, el: "→", testid: "visual-heads-end" }, { v: "start" as const, el: "←" }, { v: "both" as const, el: "↔" }]} />
              {selLine?.kind === "arc" && (
                <Seg
                  title={t("visual.inspector.arcDir")}
                  value={!!selLine.cw}
                  onPick={(v) => updateLine(selLine.id, { cw: v || undefined })}
                  options={[{ v: false, el: "↺", testid: "visual-arc-ccw" }, { v: true, el: "↻", testid: "visual-arc-cw" }]}
                />
              )}
              <Seg title={t("visual.inspector.line")} value={selConn.dash} onPick={(v) => updConn({ dash: v })} options={DASH_OPTS} />
              <Seg title={t("visual.inspector.thick")} value={selConn.thick} onPick={(v) => updConn({ thick: v })} options={THICK_OPTS} />
            </>
          )}
          <Button variant="ghost" size="sm" onClick={deleteSel} data-testid="visual-delete" className="w-full justify-center text-(--color-danger)">
            <Trash2 size={13} /> {t("visual.delete")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Seg<T>({
  title,
  value,
  options,
  onPick,
}: {
  title: string;
  value: T;
  options: { v: T; el: ReactNode; testid?: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">{title}</span>
      <div className="flex gap-1">
        {options.map((o, i) => (
          <button
            key={i}
            onClick={() => onPick(o.v)}
            data-testid={o.testid}
            className={cn(
              "flex h-7 flex-1 items-center justify-center rounded-(--radius-sm) border text-sm leading-none",
              value === o.v
                ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)"
                : "border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {o.el}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({
  title,
  colors,
  value,
  onPick,
  noneLabel,
}: {
  title: string;
  colors: readonly string[];
  value?: string;
  onPick: (c: string | undefined) => void;
  noneLabel: string;
}) {
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPick(undefined)}
          title={noneLabel}
          className={cn("h-5 w-5 rounded-full border border-(--color-border) text-[9px] leading-none text-(--color-text-muted)", !value && "ring-2 ring-(--color-accent)")}
        >
          ⌀
        </button>
        {colors.map((c) => (
          <button key={c} onClick={() => onPick(c)} title={c} style={{ background: c }} className={cn("h-5 w-5 rounded-full border border-(--color-border)", value === c && "ring-2 ring-(--color-accent)")} />
        ))}
        {/* cor livre (rgb/hex — v0.7.0): emite `shaded "#rrggbb"` */}
        <label
          title="Cor livre"
          className={cn(
            "relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-(--color-border)",
            value?.startsWith("#") && "ring-2 ring-(--color-accent)",
          )}
          style={{ background: value?.startsWith("#") ? value : "conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)" }}
        >
          <input
            type="color"
            value={value?.startsWith("#") ? value : "#1b5e20"}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
