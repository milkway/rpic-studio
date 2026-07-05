import { useEffect, useRef, useState, type RefObject } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@rpic/design-system";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import {
  FILL_COLORS,
  STROKE_COLORS,
  type Side,
  type VEdge,
  type VGraph,
  type VNode,
} from "@/lib/visualGraph";

interface Props {
  graph: VGraph;
  onChange: (g: VGraph) => void;
  /** O `preview-stage` (SVG injetado) e o container rolável do preview. */
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  /** Recalcula as posições ao mudar o zoom (arraste usa Δtela/zoom). */
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

// Âncoras de CONEXÃO visíveis (perímetro). O centro fica livre p/ mover/selec.
const BOX_SIDES: Side[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const DIAMOND_SIDES: Side[] = ["n", "s", "e", "w"];

function sidesFor(shape: VNode["shape"]): Side[] {
  return shape === "diamond" ? DIAMOND_SIDES : BOX_SIDES;
}

/** Posição de uma âncora dentro do box (0..w, 0..h). */
function anchorXY(side: Side, w: number, h: number): { x: number; y: number } {
  const x = side.includes("w") ? 0 : side.includes("e") ? w : w / 2;
  const y = side.includes("n") ? 0 : side.includes("s") ? h : h / 2;
  return { x, y };
}

/** Âncora do box mais próxima de um ponto de tela (para o destino da conexão). */
function nearestSide(box: Box, px: number, py: number): Side {
  const nx = (px - box.cx) / (box.w / 2 || 1);
  const ny = (py - box.cy) / (box.h / 2 || 1);
  const h = Math.abs(nx) > 0.45;
  const v = Math.abs(ny) > 0.45;
  const ew = nx < 0 ? "w" : "e";
  const ns = ny < 0 ? "n" : "s";
  if (h && v) return (ns + ew) as Side;
  if (h) return ew as Side;
  if (v) return ns as Side;
  return "c";
}

function readTranslate(el: Element | null): { x: number; y: number } {
  const t = el?.getAttribute("transform");
  const m = t && /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(t);
  return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n-${Math.round(Math.random() * 1e9)}`;
}

/**
 * Camada de edição SOBRE o render real do rpic. Cada nó corresponde, em ordem,
 * a um `<g id="s{i}">` no SVG (statements do pic gerado); a posição é lida via
 * `getBoundingClientRect` num loop rAF que só faz setState quando muda — imune a
 * corridas de timing. graph px == unidade de usuário do SVG (96/pol) → arrastar
 * é `Δtela/zoom`. As âncoras (compass points) só aparecem ao passar o mouse no
 * nó; conectar sai de uma âncora específica (a seta gerada usa aquele lado).
 */
export function VisualOverlay({ graph, onChange, stageRef, canvasRef, zoom }: Props) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const drag = useRef<{
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    bx: number;
    by: number;
    moved: boolean;
  } | null>(null);
  const connect = useRef<{ fromId: string; fromSide: Side } | null>(null);
  const [connecting, setConnecting] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );

  // Auto-seleciona o nó recém-criado (abre o inspetor). No 1º nó o overlay monta
  // junto (sem crescimento a detectar), então tratamos o mount à parte.
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

  const nodeEl = (id: string): SVGGraphicsElement | null => {
    const i = graph.nodes.findIndex((n) => n.id === id);
    return i < 0 ? null : (stageRef.current?.querySelector(`#s${i}`) ?? null);
  };

  // Loop rAF que MANTÉM as alças coladas ao SVG (só setState quando muda).
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
      if (!drag.current && !connect.current) {
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

  const boxOf = (id: string) => boxes.find((b) => b.id === id);

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

  // ── arrastar nó ── (mantém o translate no SVG até o recompile → sem fantasma)
  function onNodeDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setSel({ kind: "node", id });
    const n = graph.nodes.find((x) => x.id === id)!;
    const base = readTranslate(nodeEl(id));
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, bx: base.x, by: base.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onNodeMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dxs = e.clientX - d.sx;
    const dys = e.clientY - d.sy;
    if (Math.abs(dxs) + Math.abs(dys) > 2) d.moved = true;
    (e.currentTarget as HTMLElement).style.transform = `translate(${dxs}px,${dys}px)`;
    nodeEl(d.id)?.setAttribute("transform", `translate(${d.bx + dxs / zoom},${d.by + dys / zoom})`);
  }
  function onNodeUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const el = e.currentTarget as HTMLElement;
    el.releasePointerCapture?.(e.pointerId);
    el.style.transform = ""; // a alça volta a seguir o box (loop); o <g> fica
    if (d.moved) {
      updateNode(d.id, { x: d.ox + (e.clientX - d.sx) / zoom, y: d.oy + (e.clientY - d.sy) / zoom });
    }
  }

  // ── conectar a partir de uma âncora ──
  function onAnchorDown(e: React.PointerEvent, id: string, side: Side) {
    e.preventDefault();
    e.stopPropagation();
    connect.current = { fromId: id, fromSide: side };
    const b = boxOf(id);
    if (b) {
      const a = anchorXY(side, b.w, b.h);
      setConnecting({ x1: b.left + a.x, y1: b.top + a.y, x2: b.left + a.x, y2: b.top + a.y });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onAnchorMove(e: React.PointerEvent) {
    if (!connect.current) return;
    const cr = canvasRef.current!.getBoundingClientRect();
    setConnecting((c) => (c ? { ...c, x2: e.clientX - cr.left, y2: e.clientY - cr.top } : c));
  }
  function onAnchorUp(e: React.PointerEvent) {
    const c = connect.current;
    connect.current = null;
    setConnecting(null);
    if (!c) return;
    const cr = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - cr.left;
    const py = e.clientY - cr.top;
    const target = boxes.find((b) => px >= b.left && px <= b.left + b.w && py >= b.top && py <= b.top + b.h);
    if (target && target.id !== c.fromId) {
      // âncora de destino: a mais próxima do ponto de soltura; se caiu no centro,
      // usa o lado voltado para a origem (entrada natural no fluxograma).
      let toSide = nearestSide(target, px, py);
      if (toSide === "c") {
        const src = boxOf(c.fromId);
        if (src) toSide = nearestSide(target, src.cx, src.cy);
      }
      const edge: VEdge = { id: newId(), from: c.fromId, to: target.id, arrow: true, fromSide: c.fromSide, toSide };
      onChange({ ...graph, edges: [...graph.edges, edge] });
      setSel({ kind: "edge", id: edge.id });
    } else {
      setSel(null);
    }
  }

  const selNode = sel?.kind === "node" ? graph.nodes.find((n) => n.id === sel.id) : undefined;
  const selEdge = sel?.kind === "edge" ? graph.edges.find((e) => e.id === sel.id) : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="visual-overlay">
      {boxes.map((b) => {
        const node = graph.nodes.find((n) => n.id === b.id);
        if (!node) return null;
        const selected = sel?.kind === "node" && sel.id === b.id;
        return (
          <div
            key={b.id}
            className={cn(
              "group pointer-events-auto absolute cursor-move rounded-sm transition-[outline] duration-100",
              selected
                ? "outline outline-2 outline-(--color-accent)"
                : "outline outline-1 outline-transparent hover:outline-(--color-accent)/50",
            )}
            style={{ left: b.left, top: b.top, width: b.w, height: b.h }}
            onPointerDown={(e) => onNodeDown(e, b.id)}
            onPointerMove={onNodeMove}
            onPointerUp={onNodeUp}
            data-testid="visual-handle"
          >
            {/* Âncoras (compass points) — escondidas até o hover no nó */}
            {sidesFor(node.shape).map((side) => {
              const a = anchorXY(side, b.w, b.h);
              return (
                <div
                  key={side}
                  title={`.${side}`}
                  className={cn(
                    "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full",
                    "border border-(--color-surface) bg-(--color-accent) opacity-0 transition-opacity",
                    "group-hover:opacity-100 hover:!scale-125",
                    selected && "opacity-100",
                  )}
                  style={{ left: a.x, top: a.y }}
                  onPointerDown={(e) => onAnchorDown(e, b.id, side)}
                  onPointerMove={onAnchorMove}
                  onPointerUp={onAnchorUp}
                  data-testid={`visual-anchor-${side}`}
                />
              );
            })}
          </div>
        );
      })}

      {/* Marcadores de aresta (ponto médio entre os nós) */}
      {graph.edges.map((edge) => {
        const a = boxOf(edge.from);
        const b = boxOf(edge.to);
        if (!a || !b) return null;
        const selected = sel?.kind === "edge" && sel.id === edge.id;
        return (
          <div
            key={edge.id}
            className={cn(
              "pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2",
              selected ? "border-(--color-accent) bg-(--color-accent)" : "border-(--color-accent)/70 bg-(--color-surface)",
            )}
            style={{ left: (a.cx + b.cx) / 2, top: (a.cy + b.cy) / 2 }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSel({ kind: "edge", id: edge.id });
            }}
            data-testid="visual-edge-marker"
          />
        );
      })}

      {/* Linha temporária de conexão */}
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

      {/* Inspetor */}
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
              selNode ? updateNode(selNode.id, { label: e.target.value }) : updateEdge(selEdge!.id, { label: e.target.value })
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
            className={cn("h-5 w-5 rounded-full border border-(--color-border)", value === c && "ring-2 ring-(--color-accent)")}
          />
        ))}
      </div>
    </div>
  );
}
