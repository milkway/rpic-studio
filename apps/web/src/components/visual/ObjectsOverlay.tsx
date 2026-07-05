import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@rpic/design-system";
import { useI18n } from "@/lib/i18n";
import { type ObjectGeometry } from "@/lib/rpic";

interface Props {
  /** Geometria por objeto (v0.7.0) — funciona p/ QUALQUER pic que compile,
   *  mesmo fora do formato do editor visual (onde `parsePic` devolve null). */
  objects: ObjectGeometry[];
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  onJumpToLine?: (line: number, col?: number) => void;
}

interface OBox {
  id: string;
  kind: string;
  line?: number;
  col?: number;
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * Overlay UNIVERSAL: sobre qualquer diagrama que compile, desenha uma caixa
 * selecionável por objeto (lida do `#s{i}` real via `getBoundingClientRect`,
 * como o overlay do grafo) e, no duplo-clique, pula pro trecho de código que
 * desenhou aquele objeto (`objects[i].line`). Só objetos do PRÓPRIO input
 * (`file` ausente — exclui macros de `copy`/circuits) são interativos.
 * É a base p/ editar visualmente pic "já pronto"; estilo-por-linha vem depois.
 */
export function ObjectsOverlay({ objects, stageRef, canvasRef, onJumpToLine }: Props) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<OBox[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const boxesRef = useRef<OBox[]>([]);

  useEffect(() => {
    let raf = 0;
    const same = (a: OBox[], b: OBox[]) =>
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
    const compute = (): OBox[] => {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (!stage || !canvas) return boxesRef.current;
      const cr = canvas.getBoundingClientRect();
      const next: OBox[] = [];
      objects.forEach((o) => {
        if (!o.bbox || o.file) return; // sem geometria, ou veio de copy/circuits
        const el = stage.querySelector(`#${o.id}`);
        if (!el) return;
        const r = (el as SVGGraphicsElement).getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        next.push({ id: o.id, kind: o.kind, line: o.line, col: o.col, left: r.left - cr.left, top: r.top - cr.top, w: r.width, h: r.height });
      });
      return next;
    };
    const loop = () => {
      const next = compute();
      if (!same(next, boxesRef.current)) {
        boxesRef.current = next;
        setBoxes(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [objects, stageRef, canvasRef]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="objects-overlay">
      {/* clicar no vazio deseleciona */}
      <div className="pointer-events-auto absolute inset-0" onPointerDown={() => setSel(null)} data-testid="objects-deselect" />
      {boxes.map((b) => {
        const selected = sel === b.id;
        const round = b.kind === "circle" || b.kind === "ellipse";
        return (
          <div
            key={b.id}
            className={cn(
              "pointer-events-auto absolute cursor-pointer transition-[outline] duration-100",
              round ? "rounded-full" : "rounded-sm",
              selected
                ? "outline outline-2 outline-(--color-accent)"
                : "outline outline-1 outline-transparent hover:outline-(--color-accent)/50",
            )}
            style={{ left: b.left, top: b.top, width: b.w, height: b.h }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSel(b.id);
            }}
            onDoubleClick={() => b.line && onJumpToLine?.(b.line, b.col ?? undefined)}
            title={b.line ? t("visual.objectsHint") : undefined}
            data-testid="objects-handle"
          >
            {selected && b.line && (
              <span className="pointer-events-none absolute -top-5 left-0 z-10 rounded-(--radius-sm) bg-(--color-accent) px-1.5 text-[10px] leading-4 whitespace-nowrap text-white">
                {t("visual.objectsLine", { line: String(b.line) })} · {b.kind}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
