import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@rpic/design-system";
import { useI18n } from "@/lib/i18n";
import { type ObjectGeometry } from "@/lib/rpic";
import { FILL_COLORS, FONT_SIZES, STROKE_COLORS } from "@/lib/palette";
import { readObjectAttrs, setObjectAttr, type AttrKind } from "@/lib/objectEdit";
import { Seg, Swatches } from "./inspectorControls";
import { ObjectFontPicker } from "./ObjectFontPicker";

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
  // Um objeto só é estilizável COM SEGURANÇA se a sua (line,col) for ÚNICA e a
  // linha NÃO fizer parte de um bloco `{…}`. Macros (`define`) e laços (`for`)
  // expandem UMA statement em VÁRIOS objetos — todos apontando pra mesma posição,
  // dentro do bloco; escrever o atributo ali corromperia o código (ex.: anexar
  // `hatch` depois do `}` do define → erro de sintaxe). Nesse caso só deixa
  // SELECIONAR + pular pro código (editar de fato fica no editor).
  const editable = (() => {
    if (!source || !selBox?.line) return false;
    const key = `${selBox.line}:${selBox.col ?? ""}`;
    let count = 0;
    for (const o of objects) if (!o.file && o.bbox && `${o.line}:${o.col ?? ""}` === key) count++;
    if (count !== 1) return false;
    const lineText = source.split("\n")[selBox.line - 1] ?? "";
    return !/[{}]/.test(lineText);
  })();
  const canStyle = !!(onSourceChange && source && selBox?.line && editable);
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
      {selBox && selBox.line && (
        <div
          className="pointer-events-auto absolute top-2 right-2 w-52 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 shadow-lg"
          data-testid="objects-inspector"
        >
          <div className={cn("flex items-baseline justify-between", canStyle && "mb-2")}>
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
          {/* Objeto de macro/loop: não dá pra estilizar sem corromper — orienta. */}
          {!canStyle && (
            <p className="mt-1 text-xs text-(--color-text-body)" data-testid="objects-macro-note">
              {t("visual.inspector.macroNote")}
            </p>
          )}
          {canStyle && (
          <>
          <Swatches title={t("visual.inspector.fill")} colors={FILL_COLORS} value={attrs.fill} onPick={(c) => setAttr("fill", c)} noneLabel={t("visual.none")} />
          <Swatches title={t("visual.inspector.stroke")} colors={STROKE_COLORS} value={attrs.stroke} onPick={(c) => setAttr("stroke", c)} noneLabel={t("visual.none")} />
          <Seg title={t("visual.inspector.hatch")} value={attrs.hatch} onPick={(v) => setAttr("hatch", v)} options={[{ v: undefined, el: "∅" }, { v: "hatch" as const, el: "▧" }, { v: "crosshatch" as const, el: "▦" }]} />
          {attrs.hatch && (
            <>
              <Seg
                title={t("visual.inspector.hatchAngle")}
                value={attrs.hatchAngle}
                onPick={(v) => setAttr("hatchAngle", v)}
                options={[
                  { v: 0, el: "0°" },
                  { v: undefined, el: "45°" },
                  { v: 90, el: "90°" },
                  { v: 135, el: "135°" },
                ]}
              />
              <Seg
                title={t("visual.inspector.hatchSep")}
                value={attrs.hatchSep}
                onPick={(v) => setAttr("hatchSep", v)}
                options={[
                  { v: 0.04, el: "≣" },
                  { v: undefined, el: "≡" },
                  { v: 0.15, el: "═" },
                ]}
              />
              <Swatches title={t("visual.inspector.hatchColor")} colors={STROKE_COLORS} value={attrs.hatchColor} onPick={(c) => setAttr("hatchColor", c)} noneLabel={t("visual.none")} />
            </>
          )}
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
          {/* Rotação + opacidade (qualquer elemento) */}
          <Seg
            title={t("visual.inspector.rotate")}
            value={attrs.rotated}
            onPick={(v) => setAttr("rotated", v)}
            options={[
              { v: undefined, el: "0°" },
              { v: 45, el: "45°" },
              { v: 90, el: "90°" },
              { v: -45, el: "−45°" },
            ]}
          />
          <Seg
            title={t("visual.inspector.opacity")}
            value={attrs.opacity}
            onPick={(v) => setAttr("opacity", v)}
            options={[
              { v: undefined, el: "100" },
              { v: 0.7, el: "70" },
              { v: 0.4, el: "40" },
              { v: 0.15, el: "15" },
            ]}
          />
          {/* Dimensões (em polegadas; vazio = automático). Box/ellipse: larg×alt;
              círculo: raio. Escritas como wid/ht/rad na linha do objeto. */}
          {(selBox.kind === "box" || selBox.kind === "ellipse") && (
            <Dimensions>
              <NumInput label="L" title={t("visual.inspector.width")} value={attrs.wid} onSet={(v) => setAttr("wid", v)} testid="objects-wid" />
              <NumInput label="A" title={t("visual.inspector.height")} value={attrs.ht} onSet={(v) => setAttr("ht", v)} testid="objects-ht" />
            </Dimensions>
          )}
          {selBox.kind === "circle" && (
            <Dimensions>
              <NumInput label="R" title={t("visual.inspector.radius")} value={attrs.rad} onSet={(v) => setAttr("rad", v)} testid="objects-rad" />
            </Dimensions>
          )}
          {/* Fonte (qualquer elemento com rótulo) + alinhamento (texto) */}
          <div className="mt-1 border-t border-(--color-border) pt-2">
            <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
              {t("visual.inspector.font")}
            </span>
            <div className="mb-2 flex gap-1">
              <button
                onClick={() => setAttr("bold", attrs.bold ? undefined : "bold")}
                data-testid="objects-bold"
                className={cn("h-7 flex-1 rounded-(--radius-sm) border font-bold", attrs.bold ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)")}
              >
                B
              </button>
              <button
                onClick={() => setAttr("italic", attrs.italic ? undefined : "italic")}
                data-testid="objects-italic"
                className={cn("h-7 flex-1 rounded-(--radius-sm) border italic", attrs.italic ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)")}
              >
                I
              </button>
              <select
                value={attrs.fontsize ?? ""}
                onChange={(e) => setAttr("fontsize", e.target.value ? Number(e.target.value) : undefined)}
                data-testid="objects-fontsize"
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
            <ObjectFontPicker value={attrs.font} onChange={(f) => setAttr("font", f)} />
            {selBox.kind === "text" && (
              <div className="mt-2">
                <Seg
                  title={t("visual.inspector.align")}
                  value={attrs.align}
                  onPick={(v) => setAttr("align", v)}
                  options={[
                    { v: "ljust" as const, el: "⟸" },
                    { v: undefined, el: "≡" },
                    { v: "rjust" as const, el: "⟹" },
                  ]}
                />
              </div>
            )}
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

/** Linha de dimensões (título + campos numéricos em polegadas). */
function Dimensions({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
        {t("visual.inspector.size")}
      </span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

/** Campo numérico rotulado (polegadas; vazio = automático). */
function NumInput({
  label,
  title,
  value,
  onSet,
  testid,
}: {
  label: string;
  title: string;
  value?: number;
  onSet: (v: number | undefined) => void;
  testid: string;
}) {
  return (
    <label title={title} className="flex flex-1 items-center gap-1 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-1.5">
      <span className="font-mono text-[10px] text-(--color-text-muted)">{label}</span>
      <input
        type="number"
        step={0.05}
        min={0}
        value={value ?? ""}
        onChange={(e) => onSet(e.target.value ? Number(e.target.value) : undefined)}
        placeholder="auto"
        data-testid={testid}
        className="h-7 w-full min-w-0 bg-transparent text-xs text-(--color-text) outline-none"
      />
    </label>
  );
}
