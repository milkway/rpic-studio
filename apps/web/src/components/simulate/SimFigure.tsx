import { useEffect, useMemo, useRef, type KeyboardEvent, type SyntheticEvent } from "react";
import { cn } from "@rpic/design-system";
import { sanitizeSvg } from "@/lib/sanitize";
import type { SimFigureResult } from "@/lib/simProtocol";
import { useI18n } from "@/lib/i18n";

/** Rede sondável da figura: as formas dela e o traço `v(rede)` que liga. */
export interface ProbeNet {
  name: string;
  trace: string;
  shapes: number[];
  /** Cor do traço quando ligado no gráfico; `null` = desligado. */
  color: string | null;
}

interface SimFigureProps {
  /** SVG desenhado no worker por `renderPic` (rpic do dune + prelude) a partir
   *  do fonte DA EXECUÇÃO: os ids `sN` batem com o `map` do extrator. */
  figure: SimFigureResult;
  /** Formas `sN` a realçar (hover numa legenda/linha do netlist/tabela/rede). */
  highlight: number[];
  /** Redes clicáveis (probe): clicar liga/desliga o traço `v(rede)`. */
  nets?: ProbeNet[];
  onToggleNet?: (net: string) => void;
  onHoverNet?: (net: string | null) => void;
}

const HIT = "sim-hit";

/** Rede sob o evento: o alvo é sempre um clone de acerto `.sim-hit`. */
function netOf(e: SyntheticEvent): string | null {
  const hit = (e.target as Element).closest?.(`.${HIT}`);
  return hit?.getAttribute("data-net") ?? null;
}

/** Folga do alvo de toque em volta da forma, em px de tela. */
const PAD_PX = 10;

/** Retângulo transparente cobrindo a bbox da forma + folga. O traço largo
 *  basta para o mouse, mas o AJUSTE DE TOQUE do Chromium pontua candidatos
 *  pela CAIXA — a de um fio horizontal tem altura 0 e perde para o `<svg>`
 *  (o toque a poucos px do fio caía no fundo). Sem layout (jsdom), não faz nada. */
function addTouchPad(g: SVGGraphicsElement) {
  if (typeof g.getBBox !== "function") return;
  let box: DOMRect;
  try {
    box = g.getBBox();
  } catch {
    return;
  }
  const scale = g.getScreenCTM()?.a || 1;
  const pad = PAD_PX / scale;
  const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  r.setAttribute("class", "sim-hit-pad");
  r.setAttribute("x", String(box.x - pad));
  r.setAttribute("y", String(box.y - pad));
  r.setAttribute("width", String(box.width + 2 * pad));
  r.setAttribute("height", String(box.height + 2 * pad));
  g.appendChild(r);
}

/** A figura simulada. NÃO é o preview do editor (que compila o fonte cru, sem
 *  o prelude — outra numeração de formas). */
export function SimFigure({
  figure,
  highlight,
  nets = [],
  onToggleNet,
  onHoverNet,
}: SimFigureProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const svg = useMemo(() => (figure.svg ? sanitizeSvg(figure.svg) : ""), [figure]);
  // O MESMO objeto entre renders: o React 19 compara o `dangerouslySetInnerHTML`
  // por identidade e, se for um objeto novo, reescreve o innerHTML — apagando
  // clones de acerto e classes de realce/probe a cada re-render (ex.: hover).
  const html = useMemo(() => ({ __html: svg }), [svg]);
  // a camada de acerto só muda com a GEOMETRIA das redes (não com as cores)
  const hitKey = nets.map((n) => `${n.name}:${n.trace}:${n.shapes.join(",")}`).join("|");

  // Camada de ACERTO: um clone transparente de cada forma de rede, com traço
  // largo (px de tela, `non-scaling-stroke`) — fio de 1px e ponto pequeno
  // ficam clicáveis no mouse e no toque. Irmão logo após o original (herda o
  // mesmo transform); sem `id` (não colide com `sN`). Só os clones recebem
  // ponteiro (CSS `.sim-figure.probe-on`), então nenhuma forma desenhada
  // depois os encobre. O 1º clone de cada rede é o alvo de teclado.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll(`.${HIT}`).forEach((el) => el.remove());
    const byName = new Map(nets.map((n) => [n.name, n]));
    for (const net of byName.values()) {
      net.shapes.forEach((id, k) => {
        const orig = root.querySelector(`[id="s${id}"]`);
        if (!orig) return;
        const clone = orig.cloneNode(true) as Element;
        clone.removeAttribute("id");
        clone.removeAttribute("style");
        clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
        clone.setAttribute("class", HIT);
        clone.setAttribute("data-net", net.name);
        clone.setAttribute("data-testid", `sim-probe-${net.name}`);
        if (k === 0) {
          clone.setAttribute("tabindex", "0");
          clone.setAttribute("role", "button");
          clone.setAttribute("aria-label", t("sim.probeNet", { trace: net.trace }));
        }
        orig.after(clone);
        addTouchPad(clone as SVGGraphicsElement);
      });
    }
    root.classList.toggle("probe-on", byName.size > 0);
    // `hitKey` resume a geometria de `nets`: trocar só a COR não recria clones
  }, [svg, hitKey, t]);

  // Rede LIGADA: os originais pintados na cor do traço (`--probe-color`) e o
  // estado no alvo de teclado (`aria-pressed`).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll(".sim-probe").forEach((el) => {
      el.classList.remove("sim-probe");
      (el as SVGElement).style.removeProperty("--probe-color");
    });
    const on = new Map(nets.map((n) => [n.name, n.color !== null]));
    root.querySelectorAll(`.${HIT}[role="button"]`).forEach((el) => {
      el.setAttribute("aria-pressed", String(on.get(el.getAttribute("data-net") ?? "") ?? false));
    });
    for (const net of nets) {
      if (net.color === null) continue;
      for (const id of net.shapes) {
        const el = root.querySelector<SVGElement>(`[id="s${id}"]`);
        if (!el) continue;
        el.classList.add("sim-probe");
        el.style.setProperty("--probe-color", net.color);
      }
    }
  }, [svg, nets, hitKey]);

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
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const net = netOf(e);
    if (net === null) return;
    e.preventDefault();
    onToggleNet?.(net);
  };
  return (
    <div
      ref={ref}
      data-testid="sim-figure"
      className={cn(
        "sim-figure flex justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-canvas) p-3",
        "[&_svg]:h-auto [&_svg]:max-h-48 [&_svg]:max-w-full",
      )}
      onClick={(e) => {
        const net = netOf(e);
        if (net !== null) onToggleNet?.(net);
      }}
      onKeyDown={onKeyDown}
      onPointerOver={(e) => onHoverNet?.(netOf(e))}
      onPointerLeave={() => onHoverNet?.(null)}
      onFocus={(e) => onHoverNet?.(netOf(e))}
      onBlur={() => onHoverNet?.(null)}
      dangerouslySetInnerHTML={html}
    />
  );
}
