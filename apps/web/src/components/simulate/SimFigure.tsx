import { useEffect, useMemo, useRef } from "react";
import { cn } from "@rpic/design-system";
import { sanitizeSvg } from "@/lib/sanitize";
import type { SimFigureResult } from "@/lib/simProtocol";
import { useI18n } from "@/lib/i18n";

interface SimFigureProps {
  /** SVG desenhado no worker por `renderPic` (rpic do dune + prelude) a partir
   *  do fonte DA EXECUÇÃO: os ids `sN` batem com o `map` do extrator. */
  figure: SimFigureResult;
  /** Formas `sN` a realçar (hover numa legenda/linha do netlist/tabela). */
  highlight: number[];
}

/** A figura simulada. NÃO é o preview do editor (que compila o fonte cru, sem
 *  o prelude — outra numeração de formas). */
export function SimFigure({ figure, highlight }: SimFigureProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const svg = useMemo(() => (figure.svg ? sanitizeSvg(figure.svg) : ""), [figure]);

  // Realce: classe nos `<g id="sN">` — o CSS (global.css, `.sim-figure`) pinta
  // o traço com o token e apaga o resto. Idempotente a cada mudança.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll(".sim-hl").forEach((el) => el.classList.remove("sim-hl"));
    for (const id of highlight) root.querySelector(`[id="s${id}"]`)?.classList.add("sim-hl");
    root.classList.toggle("has-hl", highlight.length > 0);
  }, [highlight, svg]);

  if (figure.error !== undefined) {
    return (
      <p className="px-3 py-2 text-xs text-(--color-danger)" data-testid="sim-figure-error">
        {t("sim.figureError", { msg: figure.error })}
      </p>
    );
  }
  return (
    <div
      ref={ref}
      data-testid="sim-figure"
      className={cn(
        "sim-figure flex justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-canvas) p-3",
        "[&_svg]:h-auto [&_svg]:max-h-48 [&_svg]:max-w-full",
      )}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
