import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { gsap, Draggable } from "@/lib/gsap";
import { Copy, Loader2, Minus, Plus, RotateCcw, Scan } from "lucide-react";
import { motion } from "@rpic/design-system";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/exports";
import { animate, interactive, type Anim, type Interaction, type ObjectGeometry } from "@/lib/rpic";
import { formatPicPoint, svgToPic, type PicMapping } from "@/lib/picCoords";
import { sanitizeSvg } from "@/lib/sanitize";
import { type CanvasSettings } from "@/lib/storage";
import { ObjectsOverlay } from "@/components/visual/ObjectsOverlay";
import { CanvasSettingsPopover } from "./CanvasSettingsPopover";
import { canvasBackground } from "./canvasStyle";
import { Button } from "@/components/ui/Button";
import { Tip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";

interface PreviewPaneProps {
  /** SVG já "assado" com a fonte escolhida. */
  svg: string;
  animations: Anim[];
  /** Incrementa a cada compilação boa — dispara reinjeção/replay. */
  version: number;
  error: string | null;
  loading: boolean;
  compileMs: number | null;
  /** Aparência (papel + fonte), controlada pelo EditorPage. */
  canvas: CanvasSettings;
  onCanvasChange: (next: CanvasSettings) => void;
  /** Slot para as abas (Imagem/SVG/Markdown) no cabeçalho. */
  tabs?: ReactNode;
  /** Geometria por objeto (v0.7.0): estilizar clicando + pular pra linha. */
  objects?: ObjectGeometry[];
  onJumpToLine?: (line: number, col?: number) => void;
  /** Código-fonte + escrita — estilizar por-linha no overlay universal. */
  source?: string;
  onSourceChange?: (s: string) => void;
  /** `animate scroll` no fonte: troca autoplay por um scrubber de timeline. */
  scroll?: boolean;
  /** Alvos da diretiva `draggable` (0.10.0) — ligados no GSAP Draggable. */
  interactions?: Interaction[];
  /** Mapeamento SVG→pic sob demanda (coordenadas do cursor no rodapé). */
  getPicMap?: () => PicMapping | null;
}

/** Papel técnico: SVG ao vivo com zoom, replay de animação e status. */
export function PreviewPane({
  svg,
  animations,
  version,
  error,
  loading,
  compileMs,
  canvas,
  onCanvasChange,
  tabs,
  objects,
  onJumpToLine,
  source,
  onSourceChange,
  scroll,
  interactions,
  getPicMap,
}: PreviewPaneProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const draggablesRef = useRef<{ kill: () => void }[]>([]);
  const [zoom, setZoom] = useState(1);
  // Tamanho NATURAL do SVG (attrs width/height) — o zoom precisa dimensionar o
  // LAYOUT (não só o transform): `scale()` sozinho não cria área de rolagem no
  // overflow-auto, então com zoom alto o diagrama vazava clipado e o pan não
  // tinha p/ onde ir (e o flex `justify-center` deixava esquerda/topo
  // inalcançáveis mesmo transbordando).
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [scrub, setScrub] = useState(0);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const coordsRafRef = useRef(0);
  // Pan por arrasto: guarda o início do gesto; vira pan após um limiar (4px) —
  // cliques limpos continuam selecionando/deselecionando no overlay.
  const panRef = useRef<{ x: number; y: number; sl: number; st: number; panning: boolean } | null>(null);
  const { t } = useI18n();
  const toast = useToast();

  // Injeta o SVG e (re)monta a timeline GSAP a cada compilação boa.
  // Com `animate scroll`, a timeline nasce PAUSADA no início: quem avança é o
  // scrubber (a intenção do autor é scrubbing, não autoplay).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !svg) return;
    timelineRef.current?.kill();
    timelineRef.current = null;
    stage.innerHTML = sanitizeSvg(svg);
    const svgEl = stage.querySelector("svg");
    const w = Number(svgEl?.getAttribute("width")) || 0;
    const h = Number(svgEl?.getAttribute("height")) || 0;
    setDims(w > 0 && h > 0 ? { w, h } : null);
    motion.crossFade(stage, 0.2);
    if (animations.length > 0 && !motion.prefersReduced()) {
      timelineRef.current = animate(stage, animations, gsap) as gsap.core.Timeline;
      if (scroll) {
        timelineRef.current?.pause(0);
        setScrub(0);
      }
    }
    // Diretiva `draggable` (0.10.0): liga o GSAP Draggable nos alvos do
    // manifesto. Interação iniciada pelo usuário — vale mesmo com
    // prefers-reduced-motion (não é autoplay). Instâncias antigas morrem junto
    // com o SVG reinjetado; matar explícito evita listeners órfãos.
    draggablesRef.current.forEach((d) => d.kill());
    draggablesRef.current = [];
    if (interactions && interactions.length > 0) {
      draggablesRef.current = interactive(stage, interactions, Draggable) as { kill: () => void }[];
    }
  }, [svg, version, animations, scroll, interactions]);

  useEffect(
    () => () => {
      timelineRef.current?.kill();
      draggablesRef.current.forEach((d) => d.kill());
      cancelAnimationFrame(coordsRafRef.current);
    },
    [],
  );

  const replay = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (timelineRef.current) {
      timelineRef.current.restart();
    } else if (animations.length > 0) {
      timelineRef.current = animate(stage, animations, gsap) as gsap.core.Timeline;
    }
  }, [animations]);

  // Atalho ⌘⏎ / Ctrl+Enter: repetir a animação.
  useEffect(() => {
    if (animations.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        replay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [animations.length, replay]);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    const svgEl = stageRef.current?.querySelector("svg");
    if (!canvas || !svgEl) return;
    const w = Number(svgEl.getAttribute("width")) || svgEl.getBoundingClientRect().width;
    const h = Number(svgEl.getAttribute("height")) || svgEl.getBoundingClientRect().height;
    if (!w || !h) return;
    const pad = 64;
    const scale = Math.min((canvas.clientWidth - pad) / w, (canvas.clientHeight - pad) / h, 2.5);
    setZoom(Math.max(scale, 0.1));
  }, []);

  // ——— Pan por arrasto (o canvas é overflow-auto: pan = scroll) ———
  // Fase de CAPTURA: o gesto começa em qualquer lugar (inclusive sobre um
  // objeto — os handles do overlay dão stopPropagation no bubble). A seleção
  // acontece no pointerdown como sempre; só o ARRASTO vira pan. Com o pointer
  // capturado pelo canvas, os moves param de chegar ao overlay (sem churn de
  // hover durante o pan).
  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const c = canvasRef.current;
    if (!c) return;
    // Sobre um objeto `draggable`, o gesto pertence ao GSAP Draggable — pan
    // simultâneo faria o canvas rolar junto do arrasto. (elementsFromPoint,
    // não e.target: o overlay de seleção cobre o SVG.)
    if (interactions?.length) {
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const g = el.closest("g[id]");
        if (g && interactions.some((it) => it.id === g.id)) return;
      }
    }
    panRef.current = { x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop, panning: false };
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current;
    const c = canvasRef.current;
    updateCoords(e.clientX, e.clientY);
    if (!p || !c) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.panning) {
      if (Math.hypot(dx, dy) < 4) return;
      p.panning = true;
      c.setPointerCapture(e.pointerId);
      c.style.cursor = "grabbing";
    }
    c.scrollLeft = p.sl - dx;
    c.scrollTop = p.st - dy;
  };
  const onPanEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const c = canvasRef.current;
    if (panRef.current?.panning && c) {
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      c.style.cursor = "";
    }
    panRef.current = null;
  };

  // ——— Coordenadas pic do cursor (rodapé) ———
  // Cliente → unidades do viewBox pela RAZÃO rect/viewBox do próprio <svg>
  // (getBoundingClientRect inclui QUALQUER transform por construção — o
  // `getScreenCTM()` do Chromium ignora `scale()` CSS de ancestral, o que
  // desviava as coordenadas por um fator ~zoom), depois → pic pelo mapeamento
  // sob demanda (`getPicMap`). Atualiza em rAF p/ não re-renderizar por pixel.
  const updateCoords = (clientX: number, clientY: number) => {
    if (!getPicMap) return;
    cancelAnimationFrame(coordsRafRef.current);
    coordsRafRef.current = requestAnimationFrame(() => {
      const svgEl = stageRef.current?.querySelector("svg");
      const vb = svgEl?.viewBox?.baseVal;
      const r = svgEl?.getBoundingClientRect();
      const map = vb && vb.width > 0 && vb.height > 0 && r && r.width > 0 ? getPicMap() : null;
      if (!map) {
        setCoords(null);
        return;
      }
      const x = vb!.x + ((clientX - r!.left) / r!.width) * vb!.width;
      const y = vb!.y + ((clientY - r!.top) / r!.height) * vb!.height;
      const pic = svgToPic(map, x, y);
      setCoords((prev) =>
        prev && Math.abs(prev.x - pic.x) < 0.005 && Math.abs(prev.y - pic.y) < 0.005 ? prev : pic,
      );
    });
  };
  const clearCoords = () => {
    cancelAnimationFrame(coordsRafRef.current);
    setCoords(null);
  };

  const scrubbable = !!scroll && animations.length > 0 && !motion.prefersReduced();

  // Ao mudar o ZOOM, recentra o conteúdo (era o comportamento visual do
  // transform-origin center; agora que o zoom dimensiona o layout, o scroll
  // precisa acompanhar). Pan não passa por aqui — só o zoom recentra.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.scrollLeft = (c.scrollWidth - c.clientWidth) / 2;
    c.scrollTop = (c.scrollHeight - c.clientHeight) / 2;
  }, [zoom]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-(--color-border) bg-(--color-surface) px-3">
        {tabs}
        <div className="ml-auto flex items-center gap-0.5">
          {animations.length > 0 && !scrubbable && (
            <Tip label={t("preview.replayTip")}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={replay}
                data-testid="replay-button"
                aria-label={t("preview.replayAria")}
              >
                <RotateCcw size={14} />
              </Button>
            </Tip>
          )}
          {/* `animate scroll`: o autor pediu scrubbing — slider avança a timeline
              (no site final, o host liga o ScrollTrigger; aqui o slider simula). */}
          {scrubbable && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={scrub}
              onChange={(e) => {
                const v = Number(e.target.value);
                setScrub(v);
                timelineRef.current?.progress(v).pause();
              }}
              title={t("preview.scrub")}
              aria-label={t("preview.scrub")}
              data-testid="scroll-scrub"
              className="w-28 accent-(--color-accent)"
            />
          )}
          <Tip label={t("preview.zoomOut")}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.max(z / 1.25, 0.2))}
              aria-label={t("preview.zoomOut")}
            >
              <Minus size={14} />
            </Button>
          </Tip>
          <button
            className="min-w-11 cursor-pointer rounded-(--radius-sm) px-1 py-1 text-center font-mono text-[11px] text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            onClick={() => setZoom(1)}
            title={t("preview.zoomReset")}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Tip label={t("preview.zoomIn")}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.min(z * 1.25, 4))}
              aria-label={t("preview.zoomIn")}
            >
              <Plus size={14} />
            </Button>
          </Tip>
          <Tip label={t("preview.fit")}>
            <Button variant="ghost" size="icon-sm" onClick={fit} aria-label={t("preview.fit")}>
              <Scan size={14} />
            </Button>
          </Tip>
          <CanvasSettingsPopover value={canvas} onChange={onCanvasChange} />
        </div>
      </div>

      <div
        ref={canvasRef}
        data-testid="preview-canvas"
        className="relative min-h-0 flex-1 overflow-auto"
        style={canvasBackground(canvas)}
        onPointerDownCapture={onPanDown}
        onPointerMoveCapture={onPanMove}
        onPointerUpCapture={onPanEnd}
        onPointerCancelCapture={onPanEnd}
        onPointerLeave={clearCoords}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2.5 text-sm text-(--color-text-muted)">
            <Loader2 size={16} className="animate-spin" />
            {t("preview.loading")}
          </div>
        ) : (
          /* O wrapper interno tem o tamanho REAL do zoom (w×zoom) → o
             overflow-auto ganha área de rolagem nas 4 direções; `m-auto` centra
             SEM clipar (justify-center deixaria esquerda/topo inalcançáveis). */
          <div className="flex min-h-full min-w-full p-8">
            <div
              className="m-auto"
              style={dims ? { width: dims.w * zoom, height: dims.h * zoom } : undefined}
            >
              <div
                ref={stageRef}
                data-testid="preview-stage"
                className="rpic-stage transition-opacity duration-200 [&_svg]:block"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  width: dims?.w,
                  height: dims?.h,
                  opacity: error ? 0.4 : 1,
                }}
              />
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-3">
            <span className="rounded-full bg-(--color-danger-soft) px-3 py-1 text-xs font-medium text-(--color-danger)">
              {t("preview.fixing")}
            </span>
          </div>
        )}
        {/* Edição visual de ESTILO: clicar num objeto do render → cores/hatch/…
            escritos na sua linha de código (funciona em QUALQUER pic). */}
        {!loading && objects && objects.length > 0 && (
          <ObjectsOverlay
            objects={objects}
            stageRef={stageRef}
            onJumpToLine={onJumpToLine}
            source={source}
            onSourceChange={onSourceChange}
            draggableIds={interactions?.map((it) => it.id)}
          />
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-(--color-border) bg-(--color-surface) px-3 font-mono text-[11px] text-(--color-text-muted)">
        <span
          className="flex items-center gap-1.5"
          data-testid="compile-status"
          data-state={error ? "error" : "ok"}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: error ? "var(--color-danger)" : "var(--color-success)" }}
          />
          {error ? t("preview.compileError") : t("preview.compiled")}
        </span>
        {compileMs !== null && !error && <span>{compileMs < 1 ? "<1" : Math.round(compileMs)} ms</span>}
        {animations.length > 0 && (
          <span>
            {animations.length} {t("preview.animations")}
          </span>
        )}
        {/* Coordenadas pic do cursor — clique copia `(x, y)` pronto p/ o código. */}
        {coords && (
          <button
            className="ml-auto flex cursor-pointer items-center gap-1 rounded-(--radius-sm) px-1.5 py-0.5 hover:bg-(--color-surface-muted) hover:text-(--color-text)"
            onClick={() => {
              void copyText(formatPicPoint(coords));
              toast(t("preview.coordsCopied"));
            }}
            title={t("preview.coordsTip")}
            data-testid="pic-coords"
          >
            {formatPicPoint(coords)}
            <Copy size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
