import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Play, Square, Zap } from "lucide-react";
import { cn } from "@rpic/design-system";
import type { OverlayMap, Plot, SimDiagnostic } from "@/lib/dune";
import { detectSpice } from "@/lib/detect";
import {
  netlistLineShapes,
  netShapes,
  netTraceName,
  probeSlots,
  toggleProbe,
  traceShapes,
  type Probes,
} from "@/lib/simFigure";
import { formatSI, hasScale, plotSeries } from "@/lib/waveform";
import { useSimulation } from "@/lib/useSimulation";
import type { WorkerFactory } from "@/lib/simClient";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SimFigure, type ProbeNet } from "./SimFigure";
import { groupByUnit, MAX_TRACES, traceStyle, WaveformChart } from "./WaveformChart";
import { NetlistBlock, ScalarTable, SimDiagnostics } from "./SimResultParts";

interface SimulatePanelProps {
  source: string;
  /** Aba visível? A figura só é montada visível: o SVG dela repete ids/defs
   *  do preview (`s0`, marcadores) e não pode coexistir com ele no DOM. */
  active: boolean;
  tabs?: ReactNode;
  onJumpToLine?: (line: number, col?: number) => void;
  /** Testes: worker falso. */
  workerFactory?: WorkerFactory;
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/** Aba "Simular": extrai o netlist da figura (`spice = 1`) e simula com o
 *  dune num Web Worker terminável; formas de onda, tabela de `.op`,
 *  diagnósticos, netlist e a figura com realce ligado a tudo isso. */
export function SimulatePanel({
  source,
  active,
  tabs,
  onJumpToLine,
  workerFactory,
}: SimulatePanelProps) {
  const { t } = useI18n();
  const sim = useSimulation(workerFactory);
  const marked = useMemo(() => detectSpice(source), [source]);
  const elapsed = useElapsed(sim.status === "running" ? sim.startedAt : null);
  const [plotIdx, setPlotIdx] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [hoverLine, setHoverLine] = useState<string | null>(null);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  /** Traços ligados (probe por clique na figura) → slot de cor; `null` = padrão. */
  const [probes, setProbes] = useState<Probes>(null);
  const toast = useToast();

  const running = sim.status === "running";
  const failure = sim.failure;
  const pic = sim.run?.pic ?? failure?.pic ?? null;
  const map: OverlayMap | null = pic?.map ?? null;
  const plots: Plot[] = sim.run?.plots ?? [];
  const swept = plots.filter(hasScale);
  const scalars = plots.filter((p) => !hasScale(p));
  const plot = swept[Math.min(plotIdx, swept.length - 1)] ?? null;
  const series = useMemo(() => (plot ? plotSeries(plot) : null), [plot]);
  const traceNames = useMemo(() => series?.traces.map((tr) => tr.name) ?? [], [series]);
  // traços visíveis na ordem do rawfile, cada um com o seu slot de cor
  const visible = useMemo(() => {
    if (!series) return [];
    const slots = probeSlots(probes, traceNames, MAX_TRACES);
    return series.traces.flatMap((trace) => {
      const index = slots.get(trace.name.toLowerCase());
      return index === undefined ? [] : [{ trace, index }];
    });
  }, [series, probes, traceNames]);
  const groups = useMemo(
    () => groupByUnit(visible, [...new Set(series?.traces.map((tr) => tr.unit))]),
    [visible, series],
  );
  const more = series ? series.traces.length - visible.length : 0;
  // redes clicáveis: as que têm `v(rede)` no plot; cor = a do traço, se ligado
  const probeNets: ProbeNet[] = useMemo(() => {
    if (!map) return [];
    return map.nets.flatMap((net) => {
      const trace = netTraceName(traceNames, net.name);
      if (!trace || net.shapes.length === 0) return [];
      const on = visible.find((v) => v.trace.name === trace);
      return [
        {
          name: net.name,
          trace,
          shapes: net.shapes,
          color: on ? traceStyle(on.index).color : null,
        },
      ];
    });
  }, [map, traceNames, visible]);
  const diagnostics: SimDiagnostic[] = useMemo(() => {
    if (failure) {
      // `pic` com erro: os diagnósticos do lançamento JÁ são os da extração
      return failure.kind === "pic"
        ? failure.diagnostics
        : [...(pic?.diagnostics ?? []), ...failure.diagnostics];
    }
    return [...(pic?.diagnostics ?? []), ...(sim.run?.diagnostics ?? [])];
  }, [failure, pic, sim.run]);

  useEffect(() => {
    setPlotIdx(0);
    setProbes(null);
    setHoverNet(null);
  }, [sim.run]);

  const highlight = useMemo(() => {
    if (!map) return [];
    if (hoverLine !== null) return netlistLineShapes(map, hoverLine);
    if (hoverNet !== null) return netShapes(map, hoverNet);
    if (focus !== null) return traceShapes(map, focus);
    return [];
  }, [map, focus, hoverLine, hoverNet]);
  // hover numa rede da figura também destaca o traço dela no gráfico
  const chartFocus = focus ?? (hoverNet !== null ? netTraceName(traceNames, hoverNet) : null);

  const toggleNet = (net: string) => {
    const trace = netTraceName(traceNames, net);
    if (!trace) return;
    const r = toggleProbe(probes, traceNames, trace, MAX_TRACES);
    if (r.full) toast(t("sim.probeFull", { n: String(MAX_TRACES) }));
    else setProbes(r.probes);
  };

  const stale = sim.source !== null && sim.source !== source && !running;
  const run = () => sim.start(source);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="simulate-panel">
      <div className="flex h-10 min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-(--color-border) bg-(--color-surface) px-3">
        {tabs}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span
            className="font-mono text-[11px] text-(--color-text-muted) tabular-nums max-sm:hidden"
            data-testid="sim-status"
            data-state={sim.status}
          >
            {running
              ? t("sim.running", { s: `${(elapsed / 1000).toFixed(1)} s` })
              : sim.status === "cancelled"
                ? t("sim.cancelled")
                : sim.ms !== null && (sim.status === "done" || sim.status === "error")
                  ? t("sim.ranIn", { ms: formatSI(sim.ms / 1000, "s") })
                  : ""}
          </span>
          {running ? (
            <Button variant="outline" size="sm" onClick={sim.cancel} data-testid="sim-cancel">
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />
              <Square size={11} />
              {t("sim.cancel")}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={run}
              disabled={!marked}
              data-testid="sim-run"
            >
              <Play size={12} />
              {sim.status === "idle" ? t("sim.run") : t("sim.rerun")}
            </Button>
          )}
        </div>
      </div>

      {/* A figura fica FORA da rolagem: o realce de legenda/netlist/tabela
          continua à vista enquanto se rola até eles. */}
      {active && sim.figure && pic && (
        <div className="shrink-0 border-b border-(--color-border) bg-(--color-paper) px-4 py-3">
          <SimFigure
            figure={sim.figure}
            highlight={highlight}
            nets={probeNets}
            onToggleNet={toggleNet}
            onHoverNet={setHoverNet}
          />
          {probeNets.length > 0 && (
            <p
              className="mt-1.5 text-center font-mono text-[10.5px] text-(--color-text-muted)"
              data-testid="sim-probe-hint"
            >
              {t("sim.probeHint")}
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-(--color-paper) p-4">
        {!marked && sim.status === "idle" && (
          <EmptyState>
            {t("sim.notMarked", { code: "spice = 1", dot: ".tran/.ac/.dc/.op" })}
          </EmptyState>
        )}
        {marked && sim.status === "idle" && <EmptyState>{t("sim.idle")}</EmptyState>}

        {stale && (
          <p className="font-mono text-[11px] text-(--color-warning)" data-testid="sim-stale">
            {t("sim.stale")}
          </p>
        )}

        {failure && (
          <div
            className="rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-[12.5px]"
            data-testid="sim-error"
            data-kind={failure.kind}
          >
            <p className="font-medium text-(--color-danger)">
              {failure.kind === "pic"
                ? t("sim.picError")
                : failure.kind === "load"
                  ? t("sim.loadError")
                  : t("sim.engineError", { kind: failure.kind })}
            </p>
            {failure.kind !== "pic" && (
              <p className="mt-0.5 font-mono text-[11.5px] text-(--color-text-body)">
                {failure.message}
              </p>
            )}
          </div>
        )}

        {swept.length > 1 && (
          <div
            className="flex flex-wrap items-center gap-1"
            role="tablist"
            aria-label={t("sim.plot")}
            data-testid="sim-plot-select"
          >
            {swept.map((p, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === plotIdx}
                onClick={() => setPlotIdx(i)}
                className={cn(
                  "cursor-pointer rounded-(--radius-sm) px-2 py-0.5 font-mono text-[11px] text-(--color-text-muted) hover:text-(--color-text)",
                  i === plotIdx && "bg-(--color-surface-muted) text-(--color-text)",
                )}
              >
                {p.plotname}
              </button>
            ))}
          </div>
        )}

        {plot && series && (
          <section className="space-y-2">
            {swept.length === 1 && (
              <h3 className="font-mono text-[10.5px] tracking-widest text-(--color-text-muted) uppercase">
                {plot.plotname}
              </h3>
            )}
            {/* um gráfico por unidade (V, A…): nunca dois eixos y */}
            {groups.map((g, gi) => (
              <div
                key={`${plotIdx}:${g.unit}`}
                className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-2"
              >
                <WaveformChart
                  plotname={plot.plotname}
                  series={series}
                  traces={g.traces}
                  more={gi === groups.length - 1 ? more : 0}
                  focus={chartFocus}
                  onFocus={setFocus}
                />
              </div>
            ))}
          </section>
        )}

        {scalars.map((p, i) => (
          <ScalarTable key={i} plot={p} onHover={setFocus} />
        ))}

        {sim.status === "done" && plots.length === 0 && (
          <EmptyState>{t("sim.noPlots", { code: ".tran 1u 1m" })}</EmptyState>
        )}

        <SimDiagnostics diagnostics={diagnostics} onJump={(l, c) => onJumpToLine?.(l, c)} />

        {pic?.netlist && <NetlistBlock netlist={pic.netlist} onHoverLine={setHoverLine} />}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-(--radius-md) border border-dashed border-(--color-border-strong) px-4 py-3 text-[13px] text-(--color-text-body)">
      <Zap size={15} className="mt-0.5 shrink-0 text-(--color-accent)" />
      <p>{children}</p>
    </div>
  );
}
