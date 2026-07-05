import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Diamond, Egg, Square, Trash2 } from "lucide-react";
import { cn } from "@rpic/design-system";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_SIZE,
  FILL_COLORS,
  STROKE_COLORS,
  type Shape,
  type VEdge,
  type VGraph,
  type VNode,
} from "@/lib/visualGraph";

interface Props {
  /** Grafo inicial (lido do source ao entrar no modo). */
  initialGraph: VGraph;
  /** Chamado a cada edição commitada (o pai gera o pic). */
  onChange: (g: VGraph) => void;
}

type Sel = { kind: "node" | "edge"; id: string } | null;

const SHAPES: { shape: Shape; icon: typeof Square; testid: string }[] = [
  { shape: "box", icon: Square, testid: "visual-add-box" },
  { shape: "circle", icon: Circle, testid: "visual-add-circle" },
  { shape: "ellipse", icon: Egg, testid: "visual-add-ellipse" },
  { shape: "diamond", icon: Diamond, testid: "visual-add-diamond" },
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n-${Math.round(Math.random() * 1e9)}`;
}

/** Ponto de conexão de um lado do bounding box (px, y p/ baixo). */
function sidePoint(n: VNode, side: "n" | "s" | "e" | "w"): { x: number; y: number } {
  switch (side) {
    case "n":
      return { x: n.x, y: n.y - n.h / 2 };
    case "s":
      return { x: n.x, y: n.y + n.h / 2 };
    case "e":
      return { x: n.x + n.w / 2, y: n.y };
    case "w":
      return { x: n.x - n.w / 2, y: n.y };
  }
}

/** Lados de saída/entrada pelo eixo dominante (espelha visualGraph.pickSides). */
function sidesFor(a: VNode, b: VNode): ["n" | "s" | "e" | "w", "n" | "s" | "e" | "w"] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["e", "w"] : ["w", "e"];
  return dy >= 0 ? ["s", "n"] : ["n", "s"];
}

function nodeAt(nodes: VNode[], x: number, y: number): VNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (Math.abs(x - n.x) <= n.w / 2 && Math.abs(y - n.y) <= n.h / 2) return n;
  }
  return null;
}

// Cores da tela via tokens (adaptam ao tema claro/escuro). Os preenchimentos
// escolhidos (FILL_COLORS) são todos claros → texto escuro; sem preenchimento
// segue o texto do tema.
const NODE_FILL = "var(--color-surface)";
const NODE_STROKE = "var(--color-border-strong)";
const EDGE_STROKE = "var(--color-text-muted)";

/** Cor de texto legível sobre o nó. */
function labelColor(n: VNode): string {
  return n.fill ? "#1e293b" : "var(--color-text)";
}

/** Editor visual: tela SVG que produz um grafo → o pai gera pic. */
export function VisualCanvas({ initialGraph, onChange }: Props) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<VGraph>(initialGraph);
  const [sel, setSel] = useState<Sel>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Interações (refs p/ evitar closures obsoletas em pointermove).
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const connect = useRef<{ fromId: string; x: number; y: number } | null>(null);
  const [connecting, setConnecting] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );

  const commit = useCallback(
    (g: VGraph) => {
      setGraph(g);
      onChange(g);
    },
    [onChange],
  );

  const byId = (id: string) => graph.nodes.find((n) => n.id === id);

  function svgPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function addShape(shape: Shape) {
    const r = svgRef.current?.getBoundingClientRect();
    const width = r?.width ?? 640;
    const size = DEFAULT_SIZE[shape];
    // Grade solta a partir do topo-esquerda: novos nós não se empilham.
    const stepX = 160;
    const stepY = 118;
    const cols = Math.max(1, Math.floor((width - 80) / stepX));
    const i = graph.nodes.length;
    const node: VNode = {
      id: newId(),
      shape,
      label: shape === "diamond" ? "?" : t("visual.newNode"),
      x: 80 + (i % cols) * stepX,
      y: 70 + Math.floor(i / cols) * stepY,
      w: size.w,
      h: size.h,
    };
    commit({ ...graph, nodes: [...graph.nodes, node] });
    setSel({ kind: "node", id: node.id });
  }

  function updateNode(id: string, patch: Partial<VNode>) {
    commit({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }

  function updateEdge(id: string, patch: Partial<VEdge>) {
    commit({ ...graph, edges: graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }

  function deleteSel() {
    if (!sel) return;
    if (sel.kind === "node") {
      commit({
        nodes: graph.nodes.filter((n) => n.id !== sel.id),
        edges: graph.edges.filter((e) => e.from !== sel.id && e.to !== sel.id),
      });
    } else {
      commit({ ...graph, edges: graph.edges.filter((e) => e.id !== sel.id) });
    }
    setSel(null);
  }

  // Apagar com Delete/Backspace (quando o foco não está num input).
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

  // ── ponteiro: arrastar nó / conectar ──
  function onNodePointerDown(e: React.PointerEvent, n: VNode) {
    e.stopPropagation();
    setSel({ kind: "node", id: n.id });
    const p = svgPoint(e);
    drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onHandlePointerDown(e: React.PointerEvent, n: VNode) {
    e.stopPropagation();
    const p = svgPoint(e);
    connect.current = { fromId: n.id, x: p.x, y: p.y };
    const start = sidePoint(n, "e");
    setConnecting({ x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    const p = svgPoint(e);
    if (drag.current) {
      const d = drag.current;
      d.moved = true;
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) => (n.id === d.id ? { ...n, x: p.x - d.dx, y: p.y - d.dy } : n)),
      }));
    } else if (connect.current) {
      const from = byId(connect.current.fromId);
      if (from) {
        const start = sidePoint(from, "e");
        setConnecting({ x1: start.x, y1: start.y, x2: p.x, y2: p.y });
      }
    }
  }

  function onSvgPointerUp(e: React.PointerEvent) {
    if (drag.current) {
      if (drag.current.moved) onChange(graph); // commit da posição final
      drag.current = null;
    } else if (connect.current) {
      const p = svgPoint(e);
      const target = nodeAt(graph.nodes, p.x, p.y);
      const fromId = connect.current.fromId;
      if (target && target.id !== fromId) {
        const edge: VEdge = { id: newId(), from: fromId, to: target.id, arrow: true };
        commit({ ...graph, edges: [...graph.edges, edge] });
        setSel({ kind: "edge", id: edge.id });
      }
      connect.current = null;
      setConnecting(null);
    }
  }

  const selNode = sel?.kind === "node" ? byId(sel.id) : undefined;
  const selEdge = sel?.kind === "edge" ? graph.edges.find((e) => e.id === sel.id) : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-(--color-ink)" data-testid="visual-canvas">
      {/* Paleta */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-(--color-ink-border) px-3 py-1.5">
        <span className="mr-1 font-mono text-[10px] tracking-widest text-(--color-ink-muted) uppercase">
          {t("visual.add")}
        </span>
        {SHAPES.map(({ shape, icon: Icon, testid }) => (
          <Button
            key={shape}
            variant="ink-ghost"
            size="sm"
            data-testid={testid}
            onClick={() => addShape(shape)}
          >
            <Icon size={14} /> {t(`visual.shape.${shape}`)}
          </Button>
        ))}
        <span className="ml-auto hidden font-mono text-[10px] text-(--color-ink-muted) sm:block">
          {t("visual.hint.connect")}
        </span>
      </div>

      {/* Tela */}
      <div className="relative min-h-0 flex-1">
        <svg
          ref={svgRef}
          className="h-full w-full touch-none"
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerDown={() => setSel(null)}
          data-testid="visual-svg"
        >
          <defs>
            <marker
              id="vc-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={EDGE_STROKE} />
            </marker>
          </defs>

          {/* Arestas */}
          {graph.edges.map((edge) => {
            const a = byId(edge.from);
            const b = byId(edge.to);
            if (!a || !b) return null;
            const [sa, sb] = sidesFor(a, b);
            const p1 = sidePoint(a, sa);
            const p2 = sidePoint(b, sb);
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const selected = sel?.kind === "edge" && sel.id === edge.id;
            return (
              <g
                key={edge.id}
                className="cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel({ kind: "edge", id: edge.id });
                }}
                data-testid="visual-edge"
              >
                {/* alvo de clique mais grosso, invisível */}
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={12} />
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={selected ? "var(--color-accent)" : EDGE_STROKE}
                  strokeWidth={selected ? 2.5 : 1.6}
                  markerEnd={edge.arrow ? "url(#vc-arrow)" : undefined}
                />
                {edge.label && (
                  <text
                    x={mid.x}
                    y={mid.y - 6}
                    textAnchor="middle"
                    fontSize={12}
                    fill="var(--color-text-body)"
                    className="select-none"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Linha temporária de conexão */}
          {connecting && (
            <line
              x1={connecting.x1}
              y1={connecting.y1}
              x2={connecting.x2}
              y2={connecting.y2}
              stroke="var(--color-accent)"
              strokeWidth={1.6}
              strokeDasharray="4 4"
            />
          )}

          {/* Nós */}
          {graph.nodes.map((n) => {
            const selected = sel?.kind === "node" && sel.id === n.id;
            const fill = n.fill ?? NODE_FILL;
            const stroke = selected ? "var(--color-accent)" : (n.stroke ?? NODE_STROKE);
            const sw = selected ? 2.5 : 1.5;
            const cx = n.x;
            const cy = n.y;
            return (
              <g
                key={n.id}
                className="group cursor-move"
                onPointerDown={(e) => onNodePointerDown(e, n)}
                data-testid="visual-node"
              >
                {n.shape === "box" && (
                  <rect
                    x={cx - n.w / 2}
                    y={cy - n.h / 2}
                    width={n.w}
                    height={n.h}
                    rx={3}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={sw}
                  />
                )}
                {n.shape === "circle" && (
                  <circle cx={cx} cy={cy} r={Math.min(n.w, n.h) / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
                )}
                {n.shape === "ellipse" && (
                  <ellipse cx={cx} cy={cy} rx={n.w / 2} ry={n.h / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
                )}
                {n.shape === "diamond" && (
                  <polygon
                    points={`${cx},${cy - n.h / 2} ${cx + n.w / 2},${cy} ${cx},${cy + n.h / 2} ${cx - n.w / 2},${cy}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={sw}
                  />
                )}
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={13}
                  fill={labelColor(n)}
                  className="pointer-events-none select-none"
                >
                  {n.label}
                </text>
                {/* Alça de conexão (dot visível + área de clique maior) */}
                <g
                  className="cursor-crosshair opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
                  style={{ opacity: selected ? 1 : undefined }}
                  onPointerDown={(e) => onHandlePointerDown(e, n)}
                  data-testid="visual-connect-handle"
                >
                  <circle cx={cx + n.w / 2} cy={cy - n.h / 2} r={11} fill="transparent" />
                  <circle
                    cx={cx + n.w / 2}
                    cy={cy - n.h / 2}
                    r={5}
                    fill="var(--color-accent)"
                    stroke="var(--color-surface)"
                    strokeWidth={1.5}
                  />
                </g>
              </g>
            );
          })}
        </svg>

        {/* Estado vazio */}
        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm text-(--color-ink-muted)">{t("visual.empty")}</p>
            <p className="text-xs text-(--color-ink-muted)/70">{t("visual.emptyHint")}</p>
          </div>
        )}

        {/* Inspetor */}
        {(selNode || selEdge) && (
          <div
            className="absolute top-3 right-3 w-56 rounded-(--radius-md) border border-(--color-ink-border) bg-(--color-ink-raised) p-3 shadow-lg"
            data-testid="visual-inspector"
          >
            <label className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-ink-muted) uppercase">
              {t("visual.inspector.label")}
            </label>
            <input
              value={selNode?.label ?? selEdge?.label ?? ""}
              onChange={(e) =>
                selNode
                  ? updateNode(selNode.id, { label: e.target.value })
                  : updateEdge(selEdge!.id, { label: e.target.value })
              }
              data-testid="visual-label-input"
              className="mb-3 w-full rounded-(--radius-sm) border border-(--color-ink-border) bg-(--color-ink) px-2 py-1 text-sm text-(--color-ink-text) outline-none focus:border-(--color-accent)"
            />

            {selNode && (
              <>
                <Swatches
                  title={t("visual.inspector.fill")}
                  colors={FILL_COLORS}
                  value={selNode.fill}
                  onPick={(c) => updateNode(selNode.id, { fill: c })}
                  noneLabel={t("visual.none")}
                />
                <Swatches
                  title={t("visual.inspector.stroke")}
                  colors={STROKE_COLORS}
                  value={selNode.stroke}
                  onPick={(c) => updateNode(selNode.id, { stroke: c })}
                  noneLabel={t("visual.none")}
                />
              </>
            )}

            {selEdge && (
              <button
                onClick={() => updateEdge(selEdge.id, { arrow: !selEdge.arrow })}
                className="mb-3 w-full rounded-(--radius-sm) border border-(--color-ink-border) px-2 py-1 text-xs text-(--color-ink-text) hover:bg-(--color-ink)"
              >
                {selEdge.arrow ? t("visual.edge.arrow") : t("visual.edge.line")}
              </button>
            )}

            <Button
              variant="ink-ghost"
              size="sm"
              onClick={deleteSel}
              data-testid="visual-delete"
              className="w-full justify-center text-(--color-accent)"
            >
              <Trash2 size={13} /> {t("visual.delete")}
            </Button>
          </div>
        )}
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
      <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-ink-muted) uppercase">
        {title}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPick(undefined)}
          title={noneLabel}
          className={cn(
            "h-5 w-5 rounded-full border border-(--color-ink-border) text-[9px] leading-none text-(--color-ink-muted)",
            !value && "ring-2 ring-(--color-accent)",
          )}
        >
          ⌀
        </button>
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            title={c}
            style={{ background: c }}
            className={cn(
              "h-5 w-5 rounded-full border border-(--color-ink-border)",
              value === c && "ring-2 ring-(--color-accent)",
            )}
          />
        ))}
      </div>
    </div>
  );
}
