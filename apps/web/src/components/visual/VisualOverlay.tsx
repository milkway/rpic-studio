import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@rpic/design-system";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { FILL_COLORS, STROKE_COLORS, type VEdge, type VGraph, type VNode } from "@/lib/visualGraph";

interface Props {
  graph: VGraph;
  onChange: (g: VGraph) => void;
  /** O `preview-stage` (SVG injetado) e o container rolável do preview. */
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  /** Recalcula as posições ao mudar o zoom. */
  zoom: number;
}

type Sel = { kind: "node" | "edge"; id: string } | null;
interface Box {
  id: string;
  left: number;
  top: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n-${Math.round(Math.random() * 1e9)}`;
}

/**
 * Camada de edição SOBRE o render real do rpic. Cada nó do grafo corresponde,
 * em ordem, a um `<g id="s{i}">` no SVG (statements do pic gerado por
 * `graphToPic`); lemos a posição real via `getBoundingClientRect` — sem
 * matemática de transform. Como graph px == unidades de usuário do SVG (ambos
 * 96/polegada), arrastar é só `Δgraph = Δtela / zoom`.
 */
export function VisualOverlay({ graph, onChange, stageRef, canvasRef, zoom }: Props) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(
    null,
  );
  const connect = useRef<{ fromId: string } | null>(null);
  const [connecting, setConnecting] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );

  // Auto-seleciona o nó recém-adicionado (abre o inspetor p/ rotular/estilizar).
  // No 1º nó o overlay MONTA junto (sem crescimento a detectar), então tratamos
  // o mount separadamente; adições seguintes vêm pelo crescimento da contagem.
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

  // Posição de tela de cada nó, lida do `#s{i}` renderizado.
  const computeBoxes = useCallback((): Box[] => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return [];
    const cr = canvas.getBoundingClientRect();
    const next: Box[] = [];
    graph.nodes.forEach((n, i) => {
      const el = stage.querySelector(`#s${i}`);
      if (!el) return;
      const r = (el as SVGGraphicsElement).getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return; // ignora rect transitório/degenerado
      const left = r.left - cr.left;
      const top = r.top - cr.top;
      next.push({ id: n.id, left, top, w: r.width, h: r.height, cx: left + r.width / 2, cy: top + r.height / 2 });
    });
    return next;
  }, [graph.nodes, stageRef, canvasRef]);

  // Loop rAF que MANTÉM as alças coladas ao SVG. Só chama setState quando as
  // posições realmente mudam (na maioria dos frames não muda → sem re-render),
  // então é barato e imune a corridas de timing entre injeção do SVG, crossFade
  // e reflow do centramento — que quebravam medições pontuais. Pausa durante
  // arraste/conexão (esses aplicam translate ao vivo).
  const boxesRef = useRef<Box[]>([]);
  useEffect(() => {
    let raf = 0;
    const same = (a: Box[], b: Box[]) =>
      a.length === b.length &&
      a.every((x, i) => {
        const y = b[i];
        return (
          y &&
          x.id === y.id &&
          Math.abs(x.left - y.left) < 0.5 &&
          Math.abs(x.top - y.top) < 0.5 &&
          Math.abs(x.w - y.w) < 0.5 &&
          Math.abs(x.h - y.h) < 0.5
        );
      });
    const loop = () => {
      if (!drag.current && !connect.current) {
        const next = computeBoxes();
        if (!same(next, boxesRef.current)) {
          boxesRef.current = next;
          setBoxes(next);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [computeBoxes]);

  const boxOf = (id: string) => boxes.find((b) => b.id === id);
  const nodeEl = (id: string): SVGGraphicsElement | null => {
    const i = graph.nodes.findIndex((n) => n.id === id);
    return i < 0 ? null : (stageRef.current?.querySelector(`#s${i}`) ?? null);
  };

  function updateNode(id: string, patch: Partial<VNode>) {
    onChange({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }
  function updateEdge(id: string, patch: Partial<VEdge>) {
    onChange({ ...graph, edges: graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }
  function deleteSel() {
    if (!sel) return;
    if (sel.kind === "node") {
      onChange({
        nodes: graph.nodes.filter((n) => n.id !== sel.id),
        edges: graph.edges.filter((e) => e.from !== sel.id && e.to !== sel.id),
      });
    } else {
      onChange({ ...graph, edges: graph.edges.filter((e) => e.id !== sel.id) });
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

  // ── arrastar nó (feedback ao vivo: translada a alça e o próprio grupo SVG) ──
  function onNodeDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setSel({ kind: "node", id });
    const n = graph.nodes.find((x) => x.id === id)!;
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onNodeMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dxs = e.clientX - d.sx;
    const dys = e.clientY - d.sy;
    if (Math.abs(dxs) + Math.abs(dys) > 2) d.moved = true;
    // move a alça (px de tela) e translada o grupo SVG (unidades = Δtela/zoom)
    (e.currentTarget as HTMLElement).style.transform = `translate(${dxs}px,${dys}px)`;
    nodeEl(d.id)?.setAttribute("transform", `translate(${dxs / zoom},${dys / zoom})`);
  }
  function onNodeUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture?.(e.pointerId);
    target.style.transform = "";
    nodeEl(d.id)?.removeAttribute("transform");
    if (d.moved) {
      updateNode(d.id, { x: d.ox + (e.clientX - d.sx) / zoom, y: d.oy + (e.clientY - d.sy) / zoom });
    }
  }

  // ── conectar (arrasta da alça até outro nó) ──
  function onHandleDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    connect.current = { fromId: id };
    const b = boxOf(id);
    if (b) setConnecting({ x1: b.cx, y1: b.cy, x2: b.cx, y2: b.cy });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!connect.current) return;
    const cr = canvasRef.current!.getBoundingClientRect();
    setConnecting((c) => (c ? { ...c, x2: e.clientX - cr.left, y2: e.clientY - cr.top } : c));
  }
  function onHandleUp(e: React.PointerEvent) {
    const c = connect.current;
    connect.current = null;
    setConnecting(null);
    if (!c) return;
    const cr = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - cr.left;
    const py = e.clientY - cr.top;
    const target = boxes.find(
      (b) => px >= b.left && px <= b.left + b.w && py >= b.top && py <= b.top + b.h,
    );
    if (target && target.id !== c.fromId) {
      const edge: VEdge = { id: newId(), from: c.fromId, to: target.id, arrow: true };
      onChange({ ...graph, edges: [...graph.edges, edge] });
      setSel({ kind: "edge", id: edge.id });
    }
  }

  const selNode = sel?.kind === "node" ? graph.nodes.find((n) => n.id === sel.id) : undefined;
  const selEdge = sel?.kind === "edge" ? graph.edges.find((e) => e.id === sel.id) : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="visual-overlay">
      {/* alças dos nós */}
      {boxes.map((b) => {
        const selected = sel?.kind === "node" && sel.id === b.id;
        return (
          <div
            key={b.id}
            className={cn(
              "group pointer-events-auto absolute cursor-move rounded-sm",
              selected ? "outline outline-2 outline-(--color-accent)" : "hover:outline hover:outline-1 hover:outline-(--color-accent)/60",
            )}
            style={{ left: b.left, top: b.top, width: b.w, height: b.h }}
            onPointerDown={(e) => onNodeDown(e, b.id)}
            onPointerMove={onNodeMove}
            onPointerUp={onNodeUp}
            data-testid="visual-handle"
          >
            <div
              className={cn(
                "absolute -top-1.5 -right-1.5 h-3.5 w-3.5 cursor-crosshair rounded-full border-2 border-(--color-surface) bg-(--color-accent)",
                selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
              onPointerDown={(e) => onHandleDown(e, b.id)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              data-testid="visual-connect-handle"
            />
          </div>
        );
      })}

      {/* marcadores de aresta (ponto médio entre os dois nós) */}
      {graph.edges.map((edge) => {
        const a = boxOf(edge.from);
        const b = boxOf(edge.to);
        if (!a || !b) return null;
        const x = (a.cx + b.cx) / 2;
        const y = (a.cy + b.cy) / 2;
        const selected = sel?.kind === "edge" && sel.id === edge.id;
        return (
          <div
            key={edge.id}
            className={cn(
              "pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2",
              selected
                ? "border-(--color-accent) bg-(--color-accent)"
                : "border-(--color-accent)/70 bg-(--color-surface)",
            )}
            style={{ left: x, top: y }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSel({ kind: "edge", id: edge.id });
            }}
            data-testid="visual-edge-marker"
          />
        );
      })}

      {/* linha temporária de conexão */}
      {connecting && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <line
            x1={connecting.x1}
            y1={connecting.y1}
            x2={connecting.x2}
            y2={connecting.y2}
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        </svg>
      )}

      {/* inspetor */}
      {(selNode || selEdge) && (
        <div
          className="pointer-events-auto absolute top-2 right-2 w-52 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 shadow-lg"
          data-testid="visual-inspector"
        >
          <label className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
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
            className="mb-3 w-full rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-2 py-1 text-sm text-(--color-text) outline-none focus:border-(--color-accent)"
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
              className="mb-3 w-full rounded-(--radius-sm) border border-(--color-border) px-2 py-1 text-xs text-(--color-text) hover:bg-(--color-surface-muted)"
            >
              {selEdge.arrow ? t("visual.edge.arrow") : t("visual.edge.line")}
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteSel}
            data-testid="visual-delete"
            className="w-full justify-center text-(--color-danger)"
          >
            <Trash2 size={13} /> {t("visual.delete")}
          </Button>
        </div>
      )}
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
      <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
        {title}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onPick(undefined)}
          title={noneLabel}
          className={cn(
            "h-5 w-5 rounded-full border border-(--color-border) text-[9px] leading-none text-(--color-text-muted)",
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
              "h-5 w-5 rounded-full border border-(--color-border)",
              value === c && "ring-2 ring-(--color-accent)",
            )}
          />
        ))}
      </div>
    </div>
  );
}
