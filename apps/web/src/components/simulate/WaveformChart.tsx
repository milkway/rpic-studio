import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@rpic/design-system";
import {
  decimateMinMax,
  finiteRange,
  formatSI,
  linearTicks,
  logTicks,
  nearestIndex,
  paddedDomain,
  type Series,
  type Trace,
} from "@/lib/waveform";
import { useI18n } from "@/lib/i18n";

/** Traços desenhados no máximo; o resto vira "(+N outros)". */
export const MAX_TRACES = 8;
/** Baldes da decimação min/max (~2 pontos por balde → ~400 por traço). */
const BUCKETS = 200;
const HEIGHT = 232;
const M = { top: 10, right: 14, bottom: 26, left: 58 };

/** Cor do traço i: 6 tokens em ordem fixa; 7–8 repetem 1–2 TRACEJADOS
 *  (codificação composta — nunca uma 7ª cor gerada). */
export function traceStyle(i: number): { color: string; dash?: string } {
  return { color: `var(--color-trace-${(i % 6) + 1})`, dash: i >= 6 ? "5 3" : undefined };
}

/** Traços VISÍVEIS (com o slot de cor) agrupados por unidade: um gráfico por
 *  unidade (V, A, …) — nunca dois eixos y; `index` = slot da cor, que segue a
 *  entidade (não a posição no grupo). Os grupos seguem `unitOrder` (a ordem do
 *  plot inteiro): esconder `v(in)` não faz o gráfico de A pular p/ cima. */
export function groupByUnit(
  entries: { trace: Trace; index: number }[],
  unitOrder: readonly string[] = [],
): { unit: string; traces: { trace: Trace; index: number }[] }[] {
  const groups: { unit: string; traces: { trace: Trace; index: number }[] }[] = [];
  for (const e of entries) {
    let g = groups.find((x) => x.unit === e.trace.unit);
    if (!g) groups.push((g = { unit: e.trace.unit, traces: [] }));
    g.traces.push(e);
  }
  const rank = (u: string) => {
    const i = unitOrder.indexOf(u);
    return i < 0 ? unitOrder.length : i;
  };
  return groups.sort((a, b) => rank(a.unit) - rank(b.unit));
}

interface WaveformChartProps {
  plotname: string;
  series: Series;
  /** Os traços DESTE gráfico (mesma unidade), com o índice global da cor. */
  traces: { trace: Trace; index: number }[];
  /** Traços além do limite (só o último gráfico mostra "(+N)"). */
  more?: number;
  /** Traço em foco (hover na legenda) — vindo do painel p/ casar com a figura. */
  focus: string | null;
  onFocus: (name: string | null) => void;
  /** Instante do scrubber de .tran (valor da escala) — cursor sólido + marcas
   *  nos traços + valores na legenda; `null` = sem cursor. */
  cursor?: number | null;
}

/** Gráfico SVG feito à mão: x = escala do plot (log p/ freq. > 1 década),
 *  |valor| em plots complexos, decimação min/max, ticks com prefixo SI. */
export function WaveformChart({
  plotname,
  series,
  traces,
  more = 0,
  focus,
  onFocus,
  cursor = null,
}: WaveformChartProps) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = traces.map((t) => t.trace);
  const colorOf = (i: number) => traceStyle(traces[i].index);
  const hidden = more;
  const xs = series.scale.values;

  const geom = useMemo(() => {
    let [x0, x1] = finiteRange(xs);
    if (x0 === x1) {
      x0 -= 1;
      x1 += 1;
    }
    let lo = Infinity;
    let hi = -Infinity;
    const segs = shown.map((tr) => {
      const s = decimateMinMax(xs, tr.values, BUCKETS);
      for (const seg of s)
        for (const [, y] of seg) {
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      return s;
    });
    const [y0, y1] = paddedDomain(lo, hi);
    const log = series.scale.log;
    const pw = width - M.left - M.right;
    const ph = HEIGHT - M.top - M.bottom;
    const lx0 = log ? Math.log10(x0) : x0;
    const lx1 = log ? Math.log10(x1) : x1;
    const sx = (x: number) => M.left + (((log ? Math.log10(x) : x) - lx0) / (lx1 - lx0)) * pw;
    const sy = (y: number) => M.top + (1 - (y - y0) / (y1 - y0)) * ph;
    const invX = (px: number) => {
      const v = lx0 + ((px - M.left) / pw) * (lx1 - lx0);
      return log ? 10 ** v : v;
    };
    const xTicks = log ? logTicks(x0, x1) : linearTicks(x0, x1, Math.max(2, Math.floor(pw / 90)));
    const yTicks = linearTicks(y0, y1, 4);
    const paths = segs.map((s) =>
      s
        .map((seg) =>
          seg
            .map(([x, y], k) => `${k ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
            .join(""),
        )
        .join(""),
    );
    return { sx, sy, invX, xTicks, yTicks, paths, pw, ph };
  }, [series, traces, width]);

  const units = new Set(shown.map((tr) => tr.unit));
  const yUnit = units.size === 1 ? [...units][0] : "";
  const hoverIdx = hoverX === null ? null : nearestIndex(xs, geom.invX(hoverX));
  const hoverPx =
    hoverIdx === null || !Number.isFinite(xs[hoverIdx]) ? null : geom.sx(xs[hoverIdx]);
  const cursorIdx = cursor === null ? null : nearestIndex(xs, cursor);
  const cursorPx =
    cursorIdx === null || !Number.isFinite(xs[cursorIdx]) ? null : geom.sx(xs[cursorIdx]);

  return (
    <div className="space-y-2" data-testid="sim-chart">
      <div ref={boxRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={t("sim.chartLabel", {
            plot: plotname,
            n: String(shown.length),
            scale: series.scale.name,
          })}
          className="block font-mono text-[10px]"
          data-testid="sim-chart-svg"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left;
            setHoverX(px >= M.left && px <= M.left + geom.pw ? px : null);
          }}
          onPointerLeave={() => setHoverX(null)}
        >
          {/* grade e eixos recessivos */}
          {geom.yTicks.map((v) => (
            <g key={`y${v}`}>
              <line
                x1={M.left}
                x2={M.left + geom.pw}
                y1={geom.sy(v)}
                y2={geom.sy(v)}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={M.left - 6}
                y={geom.sy(v) + 3}
                textAnchor="end"
                fill="var(--color-text-muted)"
              >
                {formatSI(v, yUnit)}
              </text>
            </g>
          ))}
          {geom.xTicks.map((v) => (
            <g key={`x${v}`}>
              <line
                x1={geom.sx(v)}
                x2={geom.sx(v)}
                y1={M.top}
                y2={M.top + geom.ph}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={geom.sx(v)}
                y={HEIGHT - M.bottom + 15}
                textAnchor="middle"
                fill="var(--color-text-muted)"
              >
                {formatSI(v, series.scale.unit)}
              </text>
            </g>
          ))}
          <line
            x1={M.left}
            x2={M.left + geom.pw}
            y1={M.top + geom.ph}
            y2={M.top + geom.ph}
            stroke="var(--color-border-strong)"
          />
          {/* traços (2px, round) — o focado na frente, os outros apagados */}
          {geom.paths.map((d, i) => {
            const st = colorOf(i);
            const dim = focus !== null && focus !== shown[i].name;
            return (
              <path
                key={shown[i].name}
                d={d}
                fill="none"
                stroke={st.color}
                strokeDasharray={st.dash}
                strokeWidth={focus === shown[i].name ? 2.75 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dim ? 0.25 : 1}
                data-testid={`sim-trace-${traces[i].index}`}
              />
            );
          })}
          {cursorIdx !== null && cursorPx !== null && (
            <g data-testid="sim-cursor" pointerEvents="none">
              <line
                x1={cursorPx}
                x2={cursorPx}
                y1={M.top}
                y2={M.top + geom.ph}
                stroke="var(--color-text)"
                strokeWidth={1.25}
              />
              {shown.map((tr, i) => {
                const y = tr.values[cursorIdx];
                if (!Number.isFinite(y)) return null;
                return (
                  <circle
                    key={tr.name}
                    cx={cursorPx}
                    cy={geom.sy(y)}
                    r={3.5}
                    fill={colorOf(i).color}
                    stroke="var(--color-surface)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          )}
          {hoverPx !== null && (
            <line
              x1={hoverPx}
              x2={hoverPx}
              y1={M.top}
              y2={M.top + geom.ph}
              stroke="var(--color-text-muted)"
              strokeDasharray="3 3"
            />
          )}
        </svg>
        {hoverIdx !== null && hoverPx !== null && (
          <div
            className={cn(
              "pointer-events-none absolute top-2 z-10 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface) px-2 py-1.5 font-mono text-[11px] shadow-(--shadow-pop)",
            )}
            style={hoverPx > width / 2 ? { right: width - hoverPx + 10 } : { left: hoverPx + 10 }}
            data-testid="sim-tooltip"
          >
            <div className="text-(--color-text-muted)">
              {series.scale.name} = {formatSI(xs[hoverIdx], series.scale.unit, 4)}
            </div>
            {shown.map((tr, i) => (
              <div key={tr.name} className="flex items-center gap-1.5 text-(--color-text)">
                <span className="inline-block h-0.5 w-3" style={{ background: colorOf(i).color }} />
                {tr.name} = {formatSI(tr.values[hoverIdx], tr.unit, 4)}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* legenda: nome em texto (a cor sozinha nunca identifica) */}
      <ul
        className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 font-mono text-[11px]"
        data-testid="sim-legend"
      >
        {shown.map((tr, i) => {
          const st = colorOf(i);
          return (
            <li
              key={tr.name}
              onPointerEnter={() => onFocus(tr.name)}
              onPointerLeave={() => onFocus(null)}
              onFocus={() => onFocus(tr.name)}
              onBlur={() => onFocus(null)}
              tabIndex={0}
              data-testid={`sim-legend-${traces[i].index}`}
              className={cn(
                "flex cursor-default items-center gap-1.5 rounded-(--radius-sm) px-1 py-0.5 text-(--color-text-body) outline-none",
                "hover:bg-(--color-surface-muted) focus-visible:bg-(--color-surface-muted)",
                focus === tr.name && "text-(--color-text)",
              )}
            >
              <svg width="16" height="6" aria-hidden>
                <line
                  x1="1"
                  x2="15"
                  y1="3"
                  y2="3"
                  stroke={st.color}
                  strokeWidth="2"
                  strokeDasharray={st.dash}
                  strokeLinecap="round"
                />
              </svg>
              {tr.name}
              {cursorIdx !== null && (
                <span className="text-(--color-text) tabular-nums" data-testid="sim-legend-value">
                  = {formatSI(tr.values[cursorIdx], tr.unit, 4)}
                </span>
              )}
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="text-(--color-text-muted)">{t("sim.more", { n: String(hidden) })}</li>
        )}
      </ul>
    </div>
  );
}
