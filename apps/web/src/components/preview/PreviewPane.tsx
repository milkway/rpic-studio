import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { Loader2, Minus, Plus, RotateCcw, Scan } from "lucide-react";
import { motion } from "@rpic/design-system";
import { animate, type Anim } from "@/lib/rpic";
import { sanitizeSvg } from "@/lib/sanitize";
import { Button } from "@/components/ui/Button";
import { Tip } from "@/components/ui/Tooltip";

interface PreviewPaneProps {
  svg: string;
  animations: Anim[];
  /** Incrementa a cada compilação boa — dispara reinjeção/replay. */
  version: number;
  error: string | null;
  loading: boolean;
  compileMs: number | null;
  /** Slot para as abas (Imagem/SVG/Markdown) no cabeçalho. */
  tabs?: ReactNode;
}

/** Papel técnico: SVG ao vivo com zoom, replay de animação e status. */
export function PreviewPane({
  svg,
  animations,
  version,
  error,
  loading,
  compileMs,
  tabs,
}: PreviewPaneProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [zoom, setZoom] = useState(1);

  // Injeta o SVG e (re)monta a timeline GSAP a cada compilação boa.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !svg) return;
    timelineRef.current?.kill();
    timelineRef.current = null;
    stage.innerHTML = sanitizeSvg(svg);
    motion.crossFade(stage, 0.2);
    if (animations.length > 0 && !motion.prefersReduced()) {
      timelineRef.current = animate(stage, animations, gsap) as gsap.core.Timeline;
    }
  }, [svg, version, animations]);

  useEffect(
    () => () => {
      timelineRef.current?.kill();
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-(--color-border) bg-(--color-surface) px-3">
        {tabs}
        <div className="ml-auto flex items-center gap-0.5">
          {animations.length > 0 && (
            <Tip label="Repetir animação (⌘⏎)">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={replay}
                data-testid="replay-button"
                aria-label="Repetir animação"
              >
                <RotateCcw size={14} />
              </Button>
            </Tip>
          )}
          <Tip label="Diminuir zoom">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.max(z / 1.25, 0.2))}
              aria-label="Diminuir zoom"
            >
              <Minus size={14} />
            </Button>
          </Tip>
          <button
            className="min-w-11 cursor-pointer rounded-(--radius-sm) px-1 py-1 text-center font-mono text-[11px] text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            onClick={() => setZoom(1)}
            title="Restaurar 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Tip label="Aumentar zoom">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.min(z * 1.25, 4))}
              aria-label="Aumentar zoom"
            >
              <Plus size={14} />
            </Button>
          </Tip>
          <Tip label="Ajustar à tela">
            <Button variant="ghost" size="icon-sm" onClick={fit} aria-label="Ajustar à tela">
              <Scan size={14} />
            </Button>
          </Tip>
        </div>
      </div>

      <div ref={canvasRef} className="paper-grid relative min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2.5 text-sm text-(--color-text-muted)">
            <Loader2 size={16} className="animate-spin" />
            carregando o motor rpic…
          </div>
        ) : (
          <div className="flex min-h-full min-w-full items-center justify-center p-8">
            <div
              ref={stageRef}
              data-testid="preview-stage"
              className="transition-opacity duration-200 [&_svg]:block"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                opacity: error ? 0.4 : 1,
              }}
            />
          </div>
        )}
        {error && !loading && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-3">
            <span className="rounded-full bg-(--color-danger-soft) px-3 py-1 text-xs font-medium text-(--color-danger)">
              corrigindo… o último diagrama válido continua aí
            </span>
          </div>
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
          {error ? "erro de compilação" : "compilado"}
        </span>
        {compileMs !== null && !error && <span>{compileMs < 1 ? "<1" : Math.round(compileMs)} ms</span>}
        {animations.length > 0 && <span>{animations.length} animações</span>}
      </div>
    </div>
  );
}
