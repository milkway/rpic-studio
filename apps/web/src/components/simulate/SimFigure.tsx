import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@rpic/design-system";
import { compile, ensureRpic } from "@/lib/rpic";
import { sanitizeSvg } from "@/lib/sanitize";
import { composeSimFigure } from "@/lib/simFigure";
import { useI18n } from "@/lib/i18n";

interface SimFigureProps {
  /** Prelude do dune + fonte DA EXECUÇÃO (não o do editor ao vivo): só assim
   *  os ids `sN` batem com o `map` devolvido pelo extrator. */
  prelude: string;
  source: string;
  /** Formas `sN` a realçar (hover numa legenda/linha do netlist/tabela). */
  highlight: number[];
}

/** A figura simulada, compilada PELO PAINEL a partir de `prelude + fonte`
 *  (o preview do editor compila o fonte cru — outra numeração de formas). */
export function SimFigure({ prelude, source, highlight }: SimFigureProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureRpic().then(
      () => alive && setReady(true),
      () => alive && setReady(false),
    );
    return () => {
      alive = false;
    };
  }, []);

  const figure = useMemo(() => {
    if (!ready) return null;
    try {
      const out = compile(composeSimFigure(prelude, source), { circuits: true });
      return { svg: sanitizeSvg(out.svg), error: null };
    } catch (e) {
      return { svg: "", error: e instanceof Error ? e.message : String(e) };
    }
  }, [ready, prelude, source]);

  // Realce: classe nos `<g id="sN">` — o CSS (global.css, `.sim-figure`) pinta
  // o traço com o token e apaga o resto. Idempotente a cada mudança.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll(".sim-hl").forEach((el) => el.classList.remove("sim-hl"));
    for (const id of highlight) root.querySelector(`[id="s${id}"]`)?.classList.add("sim-hl");
    root.classList.toggle("has-hl", highlight.length > 0);
  }, [highlight, figure]);

  if (figure?.error) {
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
      dangerouslySetInnerHTML={{ __html: figure?.svg ?? "" }}
    />
  );
}
