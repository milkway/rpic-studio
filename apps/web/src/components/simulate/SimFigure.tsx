import { useEffect, useMemo, useRef, type KeyboardEvent, type SyntheticEvent } from "react";
import { cn } from "@rpic/design-system";
import { sanitizeSvg } from "@/lib/sanitize";
import type { SimFigureResult } from "@/lib/simProtocol";
import { useI18n } from "@/lib/i18n";
import { formatSpice, relabel } from "@/lib/simValues";

/** Rede sondável da figura: as formas dela e o traço `v(rede)` que liga. */
export interface ProbeNet {
  name: string;
  trace: string;
  shapes: number[];
  /** Cor do traço quando ligado no gráfico; `null` = desligado. */
  color: string | null;
}

/** Elemento ajustável da figura (slider): as formas dele e, se alterado, o
 *  valor original e o novo (o rótulo desenhado passa a mostrar o novo). */
export interface SliderElement {
  refdes: string;
  shapes: number[];
  /** Rótulo acessível do alvo (ex.: "Adjust R1 (1 kΩ)"). */
  label: string;
  /** `keyword`: o sub-trecho da fonte que o slider move (`AC`/`DC`), p/ o
   *  rótulo trocar o número certo. */
  altered: { original: number; value: number; keyword?: string | null } | null;
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
  /** Elementos clicáveis (slider): clicar abre o slider do valor. */
  elements?: SliderElement[];
  /** Elemento com o slider aberto (`aria-expanded`). */
  selected?: string | null;
  onSelectElement?: (refdes: string) => void;
  onHoverElement?: (refdes: string | null) => void;
}

const HIT = "sim-hit";

/** Rede sob o evento: o alvo é sempre um clone de acerto `.sim-hit`. */
function netOf(e: SyntheticEvent): string | null {
  const hit = (e.target as Element).closest?.(`.${HIT}`);
  return hit?.getAttribute("data-net") ?? null;
}

const EL = "sim-hit-el";

/** Elemento sob o evento: o alvo é a caixa `.sim-hit-el` dele. Um clone de
 *  REDE por cima vence (é desenhado depois) — rede plota, elemento ajusta. */
function elementOf(e: SyntheticEvent): string | null {
  const target = e.target as Element;
  if (target.closest?.(`.${HIT}`)) return null;
  return target.closest?.(`.${EL}`)?.getAttribute("data-el") ?? null;
}

/** Folga da caixa de um elemento, em px de tela. */
const EL_PAD_PX = 4;

/** Caixa de acerto de um elemento: a união das bboxes das formas dele (rótulo
 *  incluso) + folga. Fica ATRÁS de tudo (1º filho do pai das formas): os
 *  clones de rede, desenhados depois, ganham onde se sobrepõem. Sem layout
 *  (jsdom) a caixa existe com tamanho 0 — ainda clicável por evento. */
function addElementPad(root: HTMLElement, el: SliderElement): SVGRectElement | null {
  const groups = el.shapes
    .map((id) => root.querySelector<SVGGraphicsElement>(`[id="s${id}"]`))
    .filter((g): g is SVGGraphicsElement => g !== null);
  if (groups.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of groups) {
    if (typeof g.getBBox !== "function") continue;
    let b: DOMRect;
    try {
      b = g.getBBox();
    } catch {
      continue;
    }
    if (b.width === 0 && b.height === 0) continue; // grupo vazio
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  const scale = groups[0].getScreenCTM?.()?.a || 1;
  const pad = EL_PAD_PX / scale;
  const has = Number.isFinite(x0);
  const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  r.setAttribute("class", EL);
  r.setAttribute("x", String(has ? x0 - pad : 0));
  r.setAttribute("y", String(has ? y0 - pad : 0));
  r.setAttribute("width", String(has ? x1 - x0 + 2 * pad : 0));
  r.setAttribute("height", String(has ? y1 - y0 + 2 * pad : 0));
  r.setAttribute("rx", String(3 / scale));
  r.setAttribute("data-el", el.refdes);
  r.setAttribute("data-testid", `sim-el-${el.refdes}`);
  r.setAttribute("tabindex", "0");
  r.setAttribute("role", "button");
  r.setAttribute("aria-haspopup", "dialog");
  r.setAttribute("aria-label", el.label);
  groups[0].parentNode?.insertBefore(r, groups[0].parentNode.firstChild);
  return r;
}

/** Valor novo de um elemento cujo rótulo não pôde ser reescrito: um `<text>`
 *  centrado acima da união das formas, dentro da 1ª (herda o estilo
 *  `.sim-altered text` e o sistema de coordenadas). Sem layout (jsdom), na
 *  origem — ainda presente no DOM. */
function overlayValue(
  root: HTMLElement,
  groups: SVGGraphicsElement[],
  refdes: string,
  text: string,
): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  for (const g of groups) {
    if (typeof g.getBBox !== "function") continue;
    let b: DOMRect;
    try {
      b = g.getBBox();
    } catch {
      continue;
    }
    if (b.width === 0 && b.height === 0) continue;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
  }
  const has = Number.isFinite(x0);
  const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
  tx.setAttribute("class", "sim-relabel");
  tx.setAttribute("data-testid", `sim-relabel-${refdes}`);
  tx.setAttribute("x", String(has ? (x0 + x1) / 2 : 0));
  tx.setAttribute("y", String(has ? y0 - 3 : 0));
  tx.setAttribute("text-anchor", "middle");
  tx.setAttribute("font-size", root.querySelector("text")?.getAttribute("font-size") ?? "11pt");
  tx.textContent = text;
  groups[0].appendChild(tx);
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
  elements = [],
  selected = null,
  onSelectElement,
  onHoverElement,
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
  const elKey = elements.map((e) => `${e.refdes}:${e.shapes.join(",")}:${e.label}`).join("|");
  const alteredKey = elements
    .map((e) => (e.altered ? `${e.refdes}=${e.altered.value}:${e.altered.keyword ?? ""}` : ""))
    .join("|");

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
    root.classList.toggle("probe-on", byName.size > 0 || elements.length > 0);
    // `hitKey` resume a geometria de `nets`: trocar só a COR não recria clones
  }, [svg, hitKey, t, elKey]);

  // Caixas de acerto dos ELEMENTOS ajustáveis (clicar abre o slider).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll(`.${EL}`).forEach((el) => el.remove());
    for (const el of elements) addElementPad(root, el);
    // `elKey` resume `elements` (geometria + rótulo); o valor não recria
  }, [svg, elKey]);

  useEffect(() => {
    ref.current?.querySelectorAll(`.${EL}`).forEach((el) => {
      el.setAttribute("aria-expanded", String(el.getAttribute("data-el") === selected));
    });
  }, [svg, elKey, selected]);

  // Elemento ALTERADO: formas marcadas (`.sim-altered`, cor de destaque) e o
  // rótulo desenhado reescrito com o valor novo (itálico). O texto original
  // fica em `data-orig-text` p/ restaurar. Só UM texto por elemento, varrendo
  // as formas em ordem: a 1ª forma do elemento é o rótulo de valor (o `map`
  // do extrator não diz qual texto é o valor), então um rótulo de pino "1"
  // mais adiante não é reescrito por um `DC 1`. Nenhum texto casa (rótulo TeX,
  // grafia desconhecida) → o valor novo SOBREPOSTO acima do elemento
  // (`.sim-relabel`), em vez de deixar o número velho valendo.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelectorAll(".sim-altered").forEach((g) => g.classList.remove("sim-altered"));
    root.querySelectorAll(".sim-relabel").forEach((tx) => tx.remove());
    root.querySelectorAll<SVGTextElement>("text[data-orig-text]").forEach((tx) => {
      tx.textContent = tx.getAttribute("data-orig-text");
      tx.removeAttribute("data-orig-text");
    });
    for (const el of elements) {
      if (!el.altered) continue;
      const { original, value, keyword = null } = el.altered;
      const groups = el.shapes
        .map((id) => root.querySelector<SVGGraphicsElement>(`[id="s${id}"]`))
        .filter((g): g is SVGGraphicsElement => g !== null);
      let done = false;
      for (const g of groups) {
        g.classList.add("sim-altered");
        if (done) continue;
        for (const tx of g.querySelectorAll("text")) {
          const orig = tx.textContent ?? "";
          const next = relabel(orig, original, value, keyword);
          if (next === null) continue;
          tx.setAttribute("data-orig-text", orig);
          tx.textContent = next;
          done = true;
          break;
        }
      }
      if (!done && groups.length > 0) overlayValue(root, groups, el.refdes, formatSpice(value));
    }
  }, [svg, alteredKey, elKey]);

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
    const el = elementOf(e);
    if (el !== null) {
      e.preventDefault();
      onSelectElement?.(el);
      return;
    }
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
        if (net !== null) {
          onToggleNet?.(net);
          return;
        }
        const el = elementOf(e);
        if (el !== null) onSelectElement?.(el);
      }}
      onKeyDown={onKeyDown}
      onPointerOver={(e) => {
        onHoverNet?.(netOf(e));
        onHoverElement?.(elementOf(e));
      }}
      onPointerLeave={() => {
        onHoverNet?.(null);
        onHoverElement?.(null);
      }}
      onFocus={(e) => {
        onHoverNet?.(netOf(e));
        onHoverElement?.(elementOf(e));
      }}
      onBlur={() => {
        onHoverNet?.(null);
        onHoverElement?.(null);
      }}
      dangerouslySetInnerHTML={html}
    />
  );
}
