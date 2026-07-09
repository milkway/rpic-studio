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
  onJumpToLine?: (line: number, col?: number) => void;
  /** Código-fonte atual + escrita — habilita estilizar por-linha (setObjectAttr). */
  source?: string;
  onSourceChange?: (s: string) => void;
}

const SHAPE_TAGS = /^(rect|circle|ellipse|line|path|polygon|polyline)$/;

/** Rótulo pic no início da linha do objeto (`B: circle …` → "B"), se houver — o
 *  badge do seletor o mostra junto de linha/tipo. Labels pic começam maiúsculos. */
function lineLabel(source: string | undefined, line?: number): string | undefined {
  if (!source || !line) return undefined;
  return /^\s*([A-Z][A-Za-z0-9_]*)\s*:/.exec(source.split("\n")[line - 1] ?? "")?.[1];
}

// Menor distância (em px de TELA) do ponto (cx,cy) ao CONTORNO de um grupo `#s{i}`,
// amostrando cada elemento de geometria via `getPointAtLength` mapeado pela CTM.
// Usado p/ acertar TRAÇOS FINOS (linhas), que exigiriam clique pixel-perfect no
// `elementsFromPoint`. Retorna Infinity se o grupo não tem geometria mensurável.
function geomDistPx(g: Element, cx: number, cy: number): number {
  let min = Infinity;
  for (const el of g.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse")) {
    const ge = el as SVGGeometryElement;
    if (typeof ge.getTotalLength !== "function" || typeof ge.getPointAtLength !== "function") continue;
    let total: number;
    try {
      total = ge.getTotalLength();
    } catch {
      continue;
    }
    const ctm = ge.getScreenCTM();
    if (!total || !isFinite(total) || !ctm) continue;
    const scale = Math.hypot(ctm.a, ctm.b) || 1;
    const steps = Math.max(24, Math.min(120, Math.round((total * scale) / 3)));
    for (let i = 0; i <= steps; i++) {
      let p: DOMPoint;
      try {
        p = ge.getPointAtLength((total * i) / steps);
      } catch {
        break;
      }
      const d = Math.hypot(ctm.a * p.x + ctm.c * p.y + ctm.e - cx, ctm.b * p.x + ctm.d * p.y + ctm.f - cy);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Realce que ABRAÇA a geometria real (não um retângulo), tanto p/ SELEÇÃO quanto
 * p/ HOVER. Abordagem: CLONAR o grupo `#s{i}` e sobrepor um contorno na cor de
 * acento — traço `non-scaling-stroke` (largura CONSTANTE em pixels de tela,
 * invariante ao zoom/viewBox) + halo branco (separa de hachura/fundo escuro). É
 * crisp mesmo sobre traço fino (onde um `drop-shadow` some) e NÃO é destrutivo.
 * Texto ganha `fill` de acento; formas ganham só o CONTORNO (fill none).
 * `hover` = variante mais fina/apagada e SEM pulso (a seleção pulsa p/ se
 * distinguir do hover).
 */
function styleHighlightClone(clone: SVGElement, accent: string, hover: boolean): void {
  clone.style.pointerEvents = "none";
  clone.style.filter = "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)";
  for (const el of [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))]) {
    el.removeAttribute("id");
    const tag = el.tagName?.toLowerCase();
    if (tag === "text" || tag === "tspan") {
      el.style.fill = accent;
      el.style.stroke = "none";
      el.style.opacity = hover ? "0.55" : "1";
    } else if (tag && SHAPE_TAGS.test(tag)) {
      el.removeAttribute("filter");
      el.style.fill = "none";
      el.style.stroke = accent;
      el.style.strokeWidth = hover ? "1.75" : "2.5";
      el.style.setProperty("vector-effect", "non-scaling-stroke");
      el.style.strokeDasharray = "none";
      el.style.opacity = hover ? "0.55" : "1";
    }
  }
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!hover && !reduce) {
    // pulso sutil (nunca apaga demais) só na SELEÇÃO p/ o olho pousar nela
    clone.animate?.([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
      duration: 1500,
      iterations: Infinity,
      easing: "ease-in-out",
    });
  }
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
export function ObjectsOverlay({ objects, stageRef, onJumpToLine, source, onSourceChange }: Props) {
  const { t } = useI18n();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<OBox[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const boxesRef = useRef<OBox[]>([]);
  const selRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const deselectFromRef = useRef<{ x: number; y: number } | null>(null);
  const selBox = boxes.find((b) => b.id === sel);
  // Estiliza escrevendo o atributo NA STATEMENT do objeto (`setObjectAttr` acha o
  // fim, agora respeitando `}` de bloco). Macros (`define`)/laços (`for`) expandem
  // UMA statement em VÁRIOS objetos, todos na MESMA (line,col) dentro do bloco →
  // o atributo entra no bloco e vale p/ TODAS as instâncias: nesse caso mostra um
  // AVISO. Detecção: (line,col) compartilhada por >1 objeto, ou a linha tem `{`/`}`.
  const canStyle = !!(onSourceChange && source && selBox?.line);
  const affectsAll = (() => {
    if (!source || !selBox?.line) return false;
    const key = `${selBox.line}:${selBox.col ?? ""}`;
    let count = 0;
    for (const o of objects) if (!o.file && o.bbox && `${o.line}:${o.col ?? ""}` === key) count++;
    if (count > 1) return true;
    return /[{}]/.test(source.split("\n")[selBox.line - 1] ?? "");
  })();
  const attrs = canStyle ? readObjectAttrs(source!, selBox!.line!, selBox!.col) : {};
  const setAttr = (kind: AttrKind, value: string | number | undefined) => {
    if (!canStyle) return;
    onSourceChange!(setObjectAttr(source!, selBox!.line!, selBox!.col, kind, value));
  };
  // Gradiente = par `gradient "from" "to"` (o rpic exige as DUAS cores). Escolher
  // uma cor mantém a outra (default from=black / to=white); "nenhuma" em qualquer
  // lado remove o gradiente inteiro.
  const setGradient = (from: string, to: string) => setAttr("gradient", `"${from}" "${to}"`);
  // Remove um atributo composto E seus PARÂMETROS órfãos numa só escrita. Necessário
  // porque no rpic um parâmetro sozinho recria o efeito default: `hatchsep` sem
  // `hatch` ainda hachura; `gradientangle` sem `gradient` ainda faz um degradê. Sem
  // isso, o toggle ∅ "não remove de vez" (e a hachura órfã fica por cima do gradiente).
  const clearAttrs = (kinds: AttrKind[]) => {
    if (!canStyle) return;
    let s = source!;
    for (const k of kinds) s = setObjectAttr(s, selBox!.line!, selBox!.col, k, undefined);
    onSourceChange!(s);
  };
  const clearHatch = () => clearAttrs(["hatch", "hatchAngle", "hatchSep", "hatchWid", "hatchColor"]);
  const clearGradient = () => clearAttrs(["gradient", "gradientAngle"]);

  // Qual objeto está SOB o cursor. As caixas de bbox se sobrepõem (uma forma
  // diagonal grande cobre outras), então NÃO dá p/ confiar em qual `div` recebeu
  // o evento — isso selecionava o objeto errado. Hit-test pela GEOMETRIA REAL:
  //  1) a forma PINTADA sob o cursor (via `elementsFromPoint`, ignorando os clones
  //     de realce e objetos não-interativos) → o objeto certo mesmo com bbox alheia
  //     por cima;
  //  2) PROXIMIDADE: o objeto cujo CONTORNO está a ≤ TOL px do cursor — torna
  //     TRAÇOS FINOS (uma linha de 1px, ex.: a altura de um triângulo) clicáveis sem
  //     mira pixel-perfect; empate de distância → menor área (o traço vence o quadrado
  //     com que ele é colinear);
  //  3) fallback (cursor em área vazia dentro de bboxes, ex.: interior de forma sem
  //     preenchimento): a MENOR bbox que contém o ponto (a mais específica).
  const pickObjectAt = (clientX: number, clientY: number): string | null => {
    const stage = stageRef.current;
    const overlay = overlayRef.current;
    if (!stage || !overlay) return null;
    const ids = new Set(boxesRef.current.map((b) => b.id));
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      if (!stage.contains(el) || el.closest("[data-hl]")) continue; // fora do SVG ou é realce
      const g = el.closest("g[id]");
      if (g && ids.has(g.id)) return g.id;
    }
    const or = overlay.getBoundingClientRect();
    const px = clientX - or.left;
    const py = clientY - or.top;
    const TOL = 7;
    let near: { id: string; d: number; area: number } | null = null;
    let smallest: { id: string; area: number } | null = null;
    for (const b of boxesRef.current) {
      const area = b.w * b.h;
      if (px >= b.left && px <= b.left + b.w && py >= b.top && py <= b.top + b.h && (!smallest || area < smallest.area)) {
        smallest = { id: b.id, area };
      }
      // candidato de proximidade: bbox expandida por TOL contém o ponto
      if (px < b.left - TOL || px > b.left + b.w + TOL || py < b.top - TOL || py > b.top + b.h + TOL) continue;
      const g = stage.querySelector(`[id="${b.id}"]`);
      if (!g) continue;
      const d = geomDistPx(g, clientX, clientY);
      if (d > TOL) continue;
      // menor distância (buckets de ~2px); empate → menor área
      if (!near || Math.round(d / 2) < Math.round(near.d / 2) || (Math.round(d / 2) === Math.round(near.d / 2) && area < near.area)) {
        near = { id: b.id, d, area };
      }
    }
    return near?.id ?? smallest?.id ?? null;
  };

  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

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
      const overlay = overlayRef.current;
      if (!stage || !overlay) return boxesRef.current;
      // Origem = o PRÓPRIO overlay: as caixas são `absolute` DENTRO dele, logo o
      // rect do overlay é, por definição, a referência exata das suas coords —
      // invariante a scroll/layout. (O canvas coincide só por o overlay ficar
      // colado nele; referenciar o próprio container é o correto e auto-contido.)
      const or = overlay.getBoundingClientRect();
      const next: OBox[] = [];
      objects.forEach((o) => {
        if (!o.bbox || o.file) return; // sem geometria, ou veio de copy/circuits
        const el = stage.querySelector(`#${o.id}`);
        if (!el) return;
        const r = (el as SVGGraphicsElement).getBoundingClientRect();
        // NÃO descartar linhas finas: uma linha vertical/horizontal tem
        // width/height ≈ 0 no getBoundingClientRect (Chromium ignora o traço), e a
        // guarda antiga `< 1` sumia com ela (ex.: a ALTURA vertical do Pitágoras
        // ficava sem handle → não-selecionável). Só descarta o degenerado (ponto).
        if (r.width < 0.5 && r.height < 0.5) return;
        next.push({ id: o.id, kind: o.kind, line: o.line, col: o.col, left: r.left - or.left, top: r.top - or.top, w: r.width, h: r.height });
      });
      return next;
    };
    // Realça a GEOMETRIA REAL clonando `#s{i}` e sobrepondo um contorno de acento
    // (ver `styleHighlightClone`), tanto p/ SELEÇÃO quanto p/ HOVER. Cada papel é
    // um clone marcado com `data-hl="{papel}:{id}"`, reconciliado de forma
    // IDEMPOTENTE: se o clone já é do alvo atual, não faz nada (sem churn/flicker);
    // se o alvo mudou, troca em UM frame; some com a seleção/hover ou some junto na
    // reinjeção do SVG e é RECRIADO. `id` nulo (ou hover == seleção) remove o clone.
    const cssEsc = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s);
    const reconcile = (svg: SVGElement, role: "sel" | "hover", id: string | null) => {
      const key = id ? `${role}:${id}` : "";
      const existing = svg.querySelector<SVGElement>(`[data-hl^="${role}:"]`);
      if ((existing?.getAttribute("data-hl") ?? "") === key) return; // já correto
      existing?.remove();
      if (!id) return;
      const target = svg.querySelector<SVGElement>(`#${cssEsc(id)}`);
      if (!target) return;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#1b5e20";
      const clone = target.cloneNode(true) as SVGElement;
      clone.removeAttribute("id");
      clone.setAttribute("data-hl", key);
      styleHighlightClone(clone, accent, role === "hover");
      svg.appendChild(clone); // por cima de tudo
    };
    const syncHighlight = () => {
      const svg = stageRef.current?.querySelector("svg");
      if (!svg) return;
      const sel = selRef.current;
      const hov = hoverRef.current;
      reconcile(svg, "sel", sel);
      reconcile(svg, "hover", hov && hov !== sel ? hov : null); // hover só se != seleção
    };
    const loop = () => {
      const next = compute();
      if (!same(next, boxesRef.current)) {
        boxesRef.current = next;
        setBoxes(next);
      }
      syncHighlight();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stageRef.current?.querySelectorAll("[data-hl]").forEach((el) => el.remove());
    };
  }, [objects, stageRef]);

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10" data-testid="objects-overlay">
      {/* clicar no vazio deseleciona — mas só o CLIQUE limpo (down+up sem
          movimento): um arrasto a partir do vazio é PAN do canvas e não deve
          perder a seleção. (Se o pan capturar o pointer, o up nem chega aqui.) */}
      <div
        className="pointer-events-auto absolute inset-0"
        onPointerDown={(e) => {
          deselectFromRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const d = deselectFromRef.current;
          deselectFromRef.current = null;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) setSel(null);
        }}
        data-testid="objects-deselect"
      />
      {boxes.map((b) => {
        const selected = sel === b.id;
        // Área de clique com MÍNIMO (linha fina de 0px vira uma faixa clicável de
        // HIT_MIN, centrada na geometria) — senão o `div` de 0px não captura evento
        // e a linha ficaria inalcançável mesmo estando em `boxes`. Overlaps não
        // importam: `pickObjectAt` resolve por geometria/proximidade.
        const HIT_MIN = 10;
        const hw = Math.max(b.w, HIT_MIN);
        const hh = Math.max(b.h, HIT_MIN);
        return (
          <div
            key={b.id}
            // A bbox é SÓ o alvo de clique/hover (transparente): tanto o hover
            // quanto a seleção são desenhados como CONTORNO na geometria real (clones
            // no SVG), não como retângulo. Hover é rastreado por `ref` (sem re-render
            // → sem flicker); o loop rAF lê `hoverRef` e reconcilia o clone.
            // Os handlers NÃO usam `b.id` diretamente: delegam a `pickObjectAt` (hit-test
            // por geometria) — como as bboxes se sobrepõem, o `div` que recebeu o evento
            // pode não ser o objeto sob o cursor. Por isso `onPointerMove` (não `Enter`):
            // mover DENTRO de uma bbox grande sobre a geometria de outro reavalia o alvo.
            className="pointer-events-auto absolute cursor-pointer"
            style={{ left: b.left - (hw - b.w) / 2, top: b.top - (hh - b.h) / 2, width: hw, height: hh }}
            onPointerMove={(e) => {
              hoverRef.current = pickObjectAt(e.clientX, e.clientY);
            }}
            onPointerLeave={() => {
              hoverRef.current = null;
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const id = pickObjectAt(e.clientX, e.clientY);
              if (id) setSel(id);
            }}
            onDoubleClick={(e) => {
              const id = pickObjectAt(e.clientX, e.clientY);
              const bx = boxesRef.current.find((x) => x.id === id);
              if (bx?.line) onJumpToLine?.(bx.line, bx.col ?? undefined);
            }}
            title={b.line ? t("visual.objectsHint") : undefined}
            data-testid="objects-handle"
          >
            {selected && b.line && (
              <span className="pointer-events-none absolute -top-5 left-0 z-10 rounded-(--radius-sm) bg-(--color-accent) px-1.5 text-[10px] leading-4 whitespace-nowrap text-white">
                {(() => {
                  const lbl = lineLabel(source, b.line);
                  return lbl ? `${lbl} · ` : "";
                })()}
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
          className="pointer-events-auto absolute top-2 right-2 max-h-[calc(100%-1rem)] w-60 overflow-auto rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 shadow-lg"
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
          {/* Macro/laço: o estilo entra no bloco e vale p/ TODAS as instâncias. */}
          {affectsAll && (
            <p
              className="mb-2 rounded-(--radius-sm) bg-(--color-surface-muted) px-2 py-1 text-[11px] leading-tight text-(--color-warning)"
              data-testid="objects-affects-all"
            >
              {t("visual.inspector.affectsAll")}
            </p>
          )}
          {canStyle && (
          <>
          {/* Preenchimento/traço/hachura/gradiente/espessura só p/ FORMAS: no rpic
              texto não é colorível por atributo (só via `class`+CSS) e vários desses
              não se aplicam. Texto mostra só fonte/alinhamento/rotação. */}
          {selBox.kind !== "text" && (
          <>
          <Swatches title={t("visual.inspector.fill")} colors={FILL_COLORS} value={attrs.fill} onPick={(c) => setAttr("fill", c)} noneLabel={t("visual.none")} />
          <Swatches title={t("visual.inspector.stroke")} colors={STROKE_COLORS} value={attrs.stroke} onPick={(c) => setAttr("stroke", c)} noneLabel={t("visual.none")} />
          {/* Gradiente (preenchimento de 2 passos) — só p/ formas fecháveis (não
              texto). Toggle ∅/▨ como a hachura: ligar semeia um par default e
              REVELA cor-inicial/final + ângulo; desligar remove o par. */}
          {selBox.kind !== "text" && (
            <>
              <Seg
                title={t("visual.inspector.gradient")}
                value={attrs.gradientFrom || attrs.gradientTo || attrs.gradientAngle != null ? "on" : undefined}
                onPick={(v) => (v ? setGradient("steelblue", "white") : clearGradient())}
                options={[
                  { v: undefined, el: "∅" },
                  { v: "on", el: "▨" },
                ]}
              />
              {(attrs.gradientFrom || attrs.gradientTo || attrs.gradientAngle != null) && (
                <>
                  <Swatches
                    title={t("visual.inspector.gradientFrom")}
                    colors={FILL_COLORS}
                    value={attrs.gradientFrom}
                    onPick={(c) => (c ? setGradient(c, attrs.gradientTo ?? "white") : clearGradient())}
                    noneLabel={t("visual.none")}
                  />
                  <Swatches
                    title={t("visual.inspector.gradientTo")}
                    colors={FILL_COLORS}
                    value={attrs.gradientTo}
                    onPick={(c) => (c ? setGradient(attrs.gradientFrom ?? "black", c) : clearGradient())}
                    noneLabel={t("visual.none")}
                  />
                  <Seg
                    title={t("visual.inspector.gradientAngle")}
                    value={attrs.gradientAngle}
                    onPick={(v) => setAttr("gradientAngle", v)}
                    options={[
                      { v: undefined, el: "0°" },
                      { v: 45, el: "45°" },
                      { v: 90, el: "90°" },
                      { v: 135, el: "135°" },
                    ]}
                  />
                </>
              )}
            </>
          )}
          <Seg title={t("visual.inspector.hatch")} value={attrs.hatch} onPick={(v) => (v ? setAttr("hatch", v) : clearHatch())} options={[{ v: undefined, el: "∅" }, { v: "hatch" as const, el: "▧" }, { v: "crosshatch" as const, el: "▦" }]} />
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
              {/* Largura da linha de hachura em PONTOS (default 0.8); undefined = default. */}
              <Seg
                title={t("visual.inspector.hatchWid")}
                value={attrs.hatchWid}
                onPick={(v) => setAttr("hatchWid", v)}
                options={[
                  { v: 0.4, el: <div className="h-px w-5 bg-current" /> },
                  { v: undefined, el: <div className="h-0.5 w-5 bg-current" /> },
                  { v: 1.5, el: <div className="h-1 w-5 rounded-full bg-current" /> },
                  { v: 3, el: <div className="h-1.5 w-5 rounded-full bg-current" /> },
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
          {/* Espessura: `thin` (0.9.0, 2/3 do linethick) | auto | thick N.
              thin/thick são mutuamente exclusivos — o attrSpec remove o outro. */}
          <Seg<number | "thin" | undefined>
            title={t("visual.inspector.thick")}
            value={attrs.thin ? "thin" : attrs.thick}
            onPick={(v) => (v === "thin" ? setAttr("thin", "thin") : setAttr("thick", v))}
            options={[
              { v: "thin", el: <div className="h-px w-5 bg-current opacity-50" />, testid: "objects-thin" },
              { v: undefined, el: <div className="h-px w-5 bg-current" /> },
              { v: 1.5, el: <div className="h-0.5 w-5 bg-current" /> },
              { v: 3, el: <div className="h-1 w-5 rounded-full bg-current" /> },
            ]}
          />
          </>
          )}
          {/* Rotação: qualquer elemento (inclusive texto). */}
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
          {/* Opacidade: só formas — no rpic `opacity` em texto é erro de compilação. */}
          {selBox.kind !== "text" && (
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
          )}
          {/* Dimensões (em polegadas; vazio = automático). Box: larg×alt + raio
              dos CANTOS (`box rad N` = cantos arredondados); ellipse: larg×alt;
              círculo: raio. Escritas como wid/ht/rad na linha do objeto. */}
          {selBox.kind === "box" && (
            <Dimensions>
              <NumInput label="↔" title={t("visual.inspector.width")} value={attrs.wid} onSet={(v) => setAttr("wid", v)} testid="objects-wid" />
              <NumInput label="↕" title={t("visual.inspector.height")} value={attrs.ht} onSet={(v) => setAttr("ht", v)} testid="objects-ht" />
              <NumInput label="⌜" title={t("visual.inspector.corner")} value={attrs.rad} onSet={(v) => setAttr("rad", v)} testid="objects-rad" />
            </Dimensions>
          )}
          {selBox.kind === "ellipse" && (
            <Dimensions>
              <NumInput label="↔" title={t("visual.inspector.width")} value={attrs.wid} onSet={(v) => setAttr("wid", v)} testid="objects-wid" />
              <NumInput label="↕" title={t("visual.inspector.height")} value={attrs.ht} onSet={(v) => setAttr("ht", v)} testid="objects-ht" />
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
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

/** Campo numérico rotulado (polegadas; vazio = automático). Rótulo em cima do
 *  campo (não apertado ao lado) — o `title` traz a descrição completa. */
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
    <label title={title} className="flex min-w-0 flex-col gap-0.5">
      <span className="px-0.5 font-mono text-[9px] tracking-wide text-(--color-text-muted) uppercase">{label}</span>
      <input
        type="number"
        step={0.05}
        min={0}
        value={value ?? ""}
        onChange={(e) => onSet(e.target.value ? Number(e.target.value) : undefined)}
        placeholder="auto"
        data-testid={testid}
        className="h-7 w-full min-w-0 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-2 text-xs text-(--color-text) outline-none focus:border-(--color-accent)"
      />
    </label>
  );
}
