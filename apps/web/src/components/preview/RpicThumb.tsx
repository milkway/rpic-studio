import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { RotateCcw } from "lucide-react";
import { cn, motion } from "@rpic/design-system";
import { animate, ensureRpic, type Anim } from "@/lib/rpic";
import { compileFigure, loadDunePrelude } from "@/lib/dunePrelude";
import { sanitizeSvg } from "@/lib/sanitize";
import { bakeAppearance, ensureFontLoaded } from "@/lib/appearance";
import { loadCanvasSettings } from "@/lib/storage";
import { detectSpice, detectTexLabels } from "@/lib/detect";
import { useI18n } from "@/lib/i18n";

interface RpicThumbProps {
  source: string;
  circuits: boolean;
  className?: string;
  /** Mostra o botão de replay quando o diagrama tem animações
   *  (o container pai precisa ser `position: relative`). */
  replayable?: boolean;
}

/** Miniatura de um diagrama rpic (compila ao montar; anima sob demanda). */
export function RpicThumb({ source, circuits, className, replayable }: RpicThumbProps) {
  const [bundle, setBundle] = useState<{ svg: string; animations: Anim[] } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    // fonte `spice = 1`: com o prelude do dune, como o preview (issue #17)
    Promise.all([ensureRpic(), detectSpice(source) ? loadDunePrelude() : null])
      .then(([, prelude]) => {
        if (cancelled) return;
        try {
          const out = compileFigure(source, { circuits, texlabels: detectTexLabels(source) }, prelude);
          const font = loadCanvasSettings().fontFamily;
          void ensureFontLoaded(font);
          setBundle({
            svg: sanitizeSvg(bakeAppearance(out.svg, font)),
            animations: out.animations,
          });
        } catch {
          setBundle(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source, circuits]);

  useEffect(
    () => () => {
      timelineRef.current?.kill();
    },
    [],
  );

  const replay = () => {
    const stage = stageRef.current;
    if (!stage || !bundle || motion.prefersReduced()) return;
    timelineRef.current?.kill();
    timelineRef.current = animate(stage, bundle.animations, gsap) as gsap.core.Timeline;
  };

  if (!bundle) {
    return <div className={className} aria-hidden="true" />;
  }
  return (
    <>
      <div
        ref={stageRef}
        className={cn("rpic-stage", className)}
        // SVG gerado pelo nosso compilador e sanitizado com DOMPurify.
        dangerouslySetInnerHTML={{ __html: bundle.svg }}
      />
      {replayable && bundle.animations.length > 0 && (
        <button
          onClick={replay}
          data-testid="thumb-replay"
          title={t("preview.replayAria")}
          aria-label={t("preview.replayAria")}
          className="absolute right-2.5 bottom-2.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-(--color-border-strong) bg-(--color-surface) text-(--color-text-body) shadow-(--shadow-sm) transition-colors hover:border-(--color-accent) hover:text-(--color-accent)"
        >
          <RotateCcw size={14} />
        </button>
      )}
    </>
  );
}
