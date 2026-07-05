import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@rpic/design-system";
import { useI18n } from "@/lib/i18n";
import { type ObjectGeometry } from "@/lib/rpic";
import { FILL_COLORS, STROKE_COLORS } from "@/lib/visualGraph";
import { readObjectAttrs, setObjectAttr, type AttrKind } from "@/lib/objectEdit";
import { Seg, Swatches } from "./inspectorControls";

interface Props {
  /** Geometria por objeto (v0.7.0) — funciona p/ QUALQUER pic que compile,
   *  mesmo fora do formato do editor visual (onde `parsePic` devolve null). */
  objects: ObjectGeometry[];
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  onJumpToLine?: (line: number, col?: number) => void;
  /** Código-fonte atual + escrita — habilita estilizar por-linha (setObjectAttr). */
  source?: string;
  onSourceChange?: (s: string) => void;
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
export function ObjectsOverlay({ objects, stageRef, canvasRef, onJumpToLine, source, onSourceChange }: Props) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<OBox[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const boxesRef = useRef<OBox[]>([]);
  const selBox = boxes.find((b) => b.id === sel);
  // Estiliza a statement do objeto selecionado escrevendo o atributo na sua linha.
  const canStyle = !!(onSourceChange && source && selBox?.line);
  const attrs = canStyle ? readObjectAttrs(source!, selBox!.line!, selBox!.col) : {};
  const setAttr = (kind: AttrKind, value: string | number | undefined) => {
    if (!canStyle) return;
    onSourceChange!(setObjectAttr(source!, selBox!.line!, selBox!.col, kind, value));
  };

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

      {/* Inspetor de ESTILO por-linha: escreve o atributo na statement do objeto
          (funciona sobre qualquer pic; não move/redimensiona — posição pode ser
          relativa). */}
      {selBox && canStyle && (
        <div
          className="pointer-events-auto absolute top-2 right-2 w-52 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 shadow-lg"
          data-testid="objects-inspector"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
              {selBox.kind}
            </span>
            <button
              className="font-mono text-[10px] text-(--color-accent) hover:underline"
              onClick={() => selBox.line && onJumpToLine?.(selBox.line, selBox.col ?? undefined)}
              data-testid="objects-goto"
            >
              {t("visual.objectsLine", { line: String(selBox.line) })} ↦
            </button>
          </div>
          <Swatches title={t("visual.inspector.fill")} colors={FILL_COLORS} value={attrs.fill} onPick={(c) => setAttr("fill", c)} noneLabel={t("visual.none")} />
          <Swatches title={t("visual.inspector.stroke")} colors={STROKE_COLORS} value={attrs.stroke} onPick={(c) => setAttr("stroke", c)} noneLabel={t("visual.none")} />
          <Seg title={t("visual.inspector.hatch")} value={attrs.hatch} onPick={(v) => setAttr("hatch", v)} options={[{ v: undefined, el: "∅" }, { v: "hatch" as const, el: "▧" }, { v: "crosshatch" as const, el: "▦" }]} />
          <Seg
            title={t("visual.inspector.line")}
            value={attrs.dash}
            onPick={(v) => setAttr("dash", v)}
            options={[
              { v: undefined, el: "──" },
              { v: "dashed" as const, el: "╌╌" },
              { v: "dotted" as const, el: "┈┈" },
            ]}
          />
          <Seg
            title={t("visual.inspector.thick")}
            value={attrs.thick}
            onPick={(v) => setAttr("thick", v)}
            options={[
              { v: undefined, el: <div className="h-px w-5 bg-current" /> },
              { v: 1.5, el: <div className="h-0.5 w-5 bg-current" /> },
              { v: 3, el: <div className="h-1 w-5 rounded-full bg-current" /> },
            ]}
          />
        </div>
      )}
    </div>
  );
}
