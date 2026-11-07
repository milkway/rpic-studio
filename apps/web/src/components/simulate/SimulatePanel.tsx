import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Footprints, Loader2, Play, SlidersHorizontal, Square, X, Zap } from "lucide-react";
import { cn } from "@rpic/design-system";
import type { OverlayMap, Plot, SimDiagnostic } from "@/lib/dune";
import { detectSpice } from "@/lib/detect";
import {
  elementShapes,
  netlistLineShapes,
  netPins,
  netShapes,
  netTraceName,
  probeSlots,
  toggleProbe,
  traceShapes,
  type Probes,
} from "@/lib/simFigure";
import { finiteRange, formatSI, hasScale, plotSeries } from "@/lib/waveform";
import { withAlter, type SimControl } from "@/lib/simValues";
import {
  applySourceEdit,
  valueEdit,
  type SourceCalls,
  type SourceEdit,
  type WriteBackFailure,
} from "@/lib/simSource";
import { useSimulation } from "@/lib/useSimulation";
import { PREFS_EVENT, pushPrefsSoon } from "@/lib/prefs";
import { loadSimFineSteps, saveSettings } from "@/lib/storage";
import { Tip } from "@/components/ui/Tooltip";
import type { WorkerFactory } from "@/lib/simClient";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { SimFigure, type ProbeNet, type SliderElement } from "./SimFigure";
import { ElementSlider, sourceKeyword } from "./ElementSlider";
import { TimeScrubber } from "./TimeScrubber";
import { groupByUnit, MAX_TRACES, traceStyle, WaveformChart } from "./WaveformChart";
import { MeasurePanel, NetlistBlock, ScalarTable, SimDiagnostics } from "./SimResultParts";

interface SimulatePanelProps {
  source: string;
  /** Aba visível? A figura só é montada visível: o SVG dela repete ids/defs
   *  do preview (`s0`, marcadores) e não pode coexistir com ele no DOM. */
  active: boolean;
  tabs?: ReactNode;
  onJumpToLine?: (line: number, col?: number) => void;
  /** Chamadas rotuladas do fonte (do compile do preview): onde o valor do
   *  slider é escrito de volta. Só valem se `calls.source === source`. */
  calls?: SourceCalls | null;
  /** Escrita de volta: troca um trecho do fonte (o editor a aplica como UMA
   *  edição desfazível). Ausente = slider só mexe na simulação. */
  onSourceEdit?: (edit: SourceEdit, base: string) => boolean;
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
  calls = null,
  onSourceEdit,
  workerFactory,
}: SimulatePanelProps) {
  const { t } = useI18n();
  // "passos finos" persistido com as outras preferências (rpic:settings.v1);
  // o estado vivo é o do hook (vai em todo pedido ao worker)
  const sim = useSimulation(workerFactory, loadSimFineSteps());
  const { setFine } = sim;
  const toggleFine = () => {
    const next = !sim.fine;
    setFine(next);
    saveSettings({ simFineSteps: next });
    pushPrefsSoon();
  };
  // prefs da conta aplicadas DEPOIS da montagem (login): relê
  useEffect(() => {
    const onPrefs = () => setFine(loadSimFineSteps());
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, [setFine]);
  const marked = useMemo(() => detectSpice(source), [source]);
  const elapsed = useElapsed(sim.status === "running" ? sim.startedAt : null);
  const [plotIdx, setPlotIdx] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [hoverLine, setHoverLine] = useState<string | null>(null);
  const [hoverNet, setHoverNet] = useState<string | null>(null);
  /** Traços ligados (probe por clique na figura) → slot de cor; `null` = padrão. */
  const [probes, setProbes] = useState<Probes>(null);
  /** Instante do scrubber de .tran (s); `null` = sem cursor. */
  const [cursor, setCursor] = useState<number | null>(null);
  /** Elemento com o slider aberto (refdes); `null` = fechado. */
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [hoverEl, setHoverEl] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const figWrapRef = useRef<HTMLDivElement>(null);
  /** Resultado da última escrita de volta (linha de status sob a figura). */
  const [writeNote, setWriteNote] = useState<{ ok: boolean; text: string } | null>(null);
  /** Chamadas do fonte que ESTE painel acabou de reescrever (posições já
   *  ajustadas): valem até o preview recompilar o texto novo (debounce). */
  const ownCalls = useRef<SourceCalls | null>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
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
  // redes clicáveis: as que têm `v(rede)` no plot; cor = a do traço, se ligado.
  // Alvos = as formas da rede (fios/pontos) E os terminais dos elementos nela
  // (`pins`): rede ligada pino a pino, sem forma própria, também se sonda.
  const probeNets: ProbeNet[] = useMemo(() => {
    if (!map) return [];
    return map.nets.flatMap((net) => {
      const trace = netTraceName(traceNames, net.name);
      if (!trace) return [];
      const pins = netPins(map, net.name);
      if (net.shapes.length === 0 && pins.length === 0) return [];
      const on = visible.find((v) => v.trace.name === trace);
      return [
        {
          name: net.name,
          trace,
          shapes: net.shapes,
          pins,
          color: on ? traceStyle(on.index).color : null,
        },
      ];
    });
  }, [map, traceNames, visible]);
  // todos os terminais (terra inclusa): registram o frame pic → SVG dos alvos
  const terminals = useMemo(
    () => map?.elements.flatMap((el) => (el.pins ?? []).map((p) => ({ x: p.x, y: p.y }))) ?? [],
    [map],
  );
  const diagnostics: SimDiagnostic[] = useMemo(() => {
    if (failure) {
      // `pic` com erro: os diagnósticos do lançamento JÁ são os da extração
      return failure.kind === "pic"
        ? failure.diagnostics
        : [...(pic?.diagnostics ?? []), ...failure.diagnostics];
    }
    return [...(pic?.diagnostics ?? []), ...(sim.run?.diagnostics ?? [])];
  }, [failure, pic, sim.run]);

  // execução NOVA zera a vista; re-run de slider mantém plot/probes/cursor
  useEffect(() => {
    setPlotIdx(0);
    setProbes(null);
    setHoverNet(null);
  }, [sim.epoch]);
  // scrubber só no transiente (escala em segundos)
  const timeRange = useMemo(
    () => (series && series.scale.unit === "s" ? finiteRange(series.scale.values) : null),
    [series],
  );
  useEffect(() => setCursor(null), [sim.epoch, plotIdx]);

  // ---- sliders: elementos ajustáveis da sessão ----
  const controls = sim.controls;
  const control: SimControl | null = controls.find((c) => c.refdes === selectedEl) ?? null;
  useEffect(() => {
    // sessão nova (outros elementos): fecha o slider se o elemento sumiu
    setSelectedEl((cur) => (cur && controls.some((c) => c.refdes === cur) ? cur : null));
  }, [controls]);
  const sliderElements: SliderElement[] = useMemo(() => {
    if (!map) return [];
    return controls.map((c) => {
      const v = sim.alters[c.refdes];
      return {
        refdes: c.refdes,
        shapes: elementShapes(map, c.refdes),
        label: t("sim.adjust", { refdes: c.refdes }),
        altered:
          v === undefined ? null : { original: c.value, value: v, keyword: sourceKeyword(c) },
      };
    });
  }, [map, controls, sim.alters, t]);
  const alteredList = controls.filter((c) => sim.alters[c.refdes] !== undefined);

  // âncora do slider (desktop): sob a caixa do elemento, dentro do contêiner
  const placeSlider = useCallback(() => {
    const wrap = figWrapRef.current;
    if (!wrap || selectedEl === null) return setAnchor(null);
    const pad = [...wrap.querySelectorAll(".sim-hit-el")].find(
      (el) => el.getAttribute("data-el") === selectedEl,
    );
    if (!pad) return setAnchor(null);
    const r = pad.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    if (w.width === 0) return setAnchor(null); // sem layout (jsdom)
    const width = 320; // sm:w-80
    const left = Math.min(
      Math.max(4, r.left - w.left + r.width / 2 - width / 2),
      w.width - width - 4,
    );
    setAnchor({ left: Math.max(4, left), top: r.bottom - w.top + 6 });
  }, [selectedEl]);
  useLayoutEffect(() => {
    placeSlider();
  }, [placeSlider, sim.figure]);
  useEffect(() => {
    if (selectedEl === null) return;
    window.addEventListener("resize", placeSlider);
    // o contêiner da figura muda de tamanho sem `resize` da janela (alça do
    // split, barra lateral recolhida): observa o próprio contêiner. jsdom não
    // tem ResizeObserver.
    const wrap = figWrapRef.current;
    const ro =
      wrap && typeof ResizeObserver !== "undefined" ? new ResizeObserver(placeSlider) : null;
    if (wrap) ro?.observe(wrap);
    return () => {
      window.removeEventListener("resize", placeSlider);
      ro?.disconnect();
    };
  }, [selectedEl, placeSlider, sim.figure, active]);

  const setValue = (c: SimControl, value: number | null, commit: boolean) =>
    sim.setAlters(withAlter(sim.alters, c, value), commit);

  const WB_REASON: Record<WriteBackFailure, MessageKey> = {
    "no-call": "sim.wb.noCall",
    "unknown-macro": "sim.wb.unknownMacro",
    "not-literal": "sim.wb.notLiteral",
    stale: "sim.wb.stale",
    unavailable: "sim.wb.unavailable",
  };
  /** Escreve o valor solto no argumento de valor da chamada do elemento: o
   *  fonte passa a dizer o que a sessão simula, então o elemento deixa de
   *  estar alterado (a sessão ADOTA o texto novo, sem reabrir). Sem posição
   *  confiável, nada é escrito e a linha de status diz por quê. */
  const writeBack = (c: SimControl, value: number) => {
    if (!onSourceEdit || value === c.value) return;
    const fail = (reason: WriteBackFailure, macro?: string) =>
      setWriteNote({
        ok: false,
        text: t("sim.notWritten", {
          refdes: c.refdes,
          reason: t(WB_REASON[reason], { refdes: c.refdes, macro: macro ?? "" }),
        }),
      });
    const own = ownCalls.current;
    const current =
      own && own.source === source
        ? own.calls
        : calls && calls.source === source
          ? calls.calls
          : null;
    // código mudou desde a execução ≠ posições ainda não prontas p/ este texto
    // (debounce do preview, ou a última compilação falhou)
    if (sim.source !== source) return fail("stale");
    if (!current) return fail("unavailable");
    const r = valueEdit(source, current, c.refdes, c.param, value);
    if (!r.ok) return fail(r.reason, r.macro);
    // o editor só aplica contra o texto em que a edição foi calculada; se não
    // aplicou, a sessão NÃO adota um fonte que o editor nunca recebeu
    if (!onSourceEdit(r.edit, source)) return fail("stale");
    const next = applySourceEdit(source, r.edit);
    ownCalls.current = { source: next, calls: r.calls };
    sim.adopt(next, { [c.refdes]: value });
    const keyword = sourceKeyword(c);
    setWriteNote({
      ok: true,
      text: t("sim.writtenBack", {
        refdes: c.refdes,
        value: keyword ? `${keyword} ${r.written}` : r.written,
      }),
    });
  };
  const closeSlider = () => {
    const refdes = selectedEl;
    setSelectedEl(null);
    // devolve o foco ao alvo do elemento na figura
    const pad = [...(figWrapRef.current?.querySelectorAll<SVGElement>(".sim-hit-el") ?? [])].find(
      (el) => el.getAttribute("data-el") === refdes,
    );
    pad?.focus({ preventScroll: true });
  };

  // latência do slider: do envio do pedido ao quadro seguinte ao commit do
  // resultado (alter + re-run no worker + transferência + render) — exposta
  // em `data-*` p/ medição (e2e), sem re-render
  useEffect(() => {
    const el = statusRef.current;
    if (!el || sim.sentAt === null) return;
    const sentAt = sim.sentAt;
    const id = requestAnimationFrame(() => {
      el.dataset.paintMs = (performance.now() - sentAt).toFixed(2);
    });
    return () => cancelAnimationFrame(id);
  }, [sim.run, sim.sentAt]);

  const highlight = useMemo(() => {
    if (!map) return [];
    if (hoverLine !== null) return netlistLineShapes(map, hoverLine);
    if (hoverNet !== null) return netShapes(map, hoverNet);
    if (hoverEl !== null) return elementShapes(map, hoverEl);
    if (focus !== null) return traceShapes(map, focus);
    return [];
  }, [map, focus, hoverLine, hoverNet, hoverEl]);
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
  // medidas `.measure` do run na tela (re-run de slider que falha mantém o
  // último run bom — e as medidas dele)
  const measurements = sim.run?.measurements ?? [];
  const showFigure = active && sim.figure !== null && pic !== null;
  const measurePanel = measurements.length > 0 && (
    <MeasurePanel measurements={measurements} netlist={pic?.netlist ?? ""} />
  );
  const run = () => {
    setWriteNote(null);
    sim.start(source);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="simulate-panel">
      <div className="flex h-10 min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-(--color-border) bg-(--color-surface) px-3">
        {tabs}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span
            className="font-mono text-[11px] text-(--color-text-muted) tabular-nums max-sm:hidden"
            data-testid="sim-status"
            data-state={sim.status}
            data-rerun={sim.rerun ? "1" : "0"}
            data-roundtrip-ms={sim.roundTrip?.toFixed(2)}
            data-worker-ms={sim.timing ? (sim.timing.alter + sim.timing.run).toFixed(3) : undefined}
            ref={statusRef}
          >
            {running
              ? t("sim.running", { s: `${(elapsed / 1000).toFixed(1)} s` })
              : sim.status === "cancelled"
                ? t("sim.cancelled")
                : sim.ms !== null && (sim.status === "done" || sim.status === "error")
                  ? t(sim.rerun ? "sim.reranIn" : "sim.ranIn", { ms: formatSI(sim.ms / 1000, "s") })
                  : ""}
          </span>
          <Tip label={t("sim.fineTip")}>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFine}
              aria-pressed={sim.fine}
              aria-label={t("sim.fine")}
              data-testid="sim-fine"
              className={cn(
                sim.fine &&
                  "bg-(--color-accent-soft) text-(--color-success) hover:bg-(--color-accent-soft)",
              )}
            >
              <Footprints size={13} />
              <span className="max-sm:hidden">{t("sim.fine")}</span>
            </Button>
          </Tip>
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
      {showFigure && sim.figure && (
        <div
          ref={figWrapRef}
          className="relative z-10 shrink-0 border-b border-(--color-border) bg-(--color-paper) px-4 py-3"
        >
          <SimFigure
            figure={sim.figure}
            highlight={highlight}
            nets={probeNets}
            terminals={terminals}
            onToggleNet={toggleNet}
            onHoverNet={setHoverNet}
            elements={sliderElements}
            selected={selectedEl}
            onSelectElement={(refdes) => setSelectedEl((cur) => (cur === refdes ? null : refdes))}
            onHoverElement={setHoverEl}
          />
          {(probeNets.length > 0 || controls.length > 0 || alteredList.length > 0 || writeNote) && (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {(probeNets.length > 0 || controls.length > 0) && (
                <p
                  className="min-w-0 text-center font-mono text-[10.5px] text-(--color-text-muted)"
                  data-testid="sim-probe-hint"
                >
                  {probeNets.length > 0 && t("sim.probeHint")}
                  {probeNets.length > 0 && controls.length > 0 && " · "}
                  {controls.length > 0 && t("sim.sliderHint")}
                </p>
              )}
              {writeNote && (
                <p
                  role="status"
                  className={cn(
                    "min-w-0 text-center font-mono text-[10.5px]",
                    writeNote.ok ? "text-(--color-success)" : "text-(--color-warning)",
                  )}
                  data-testid="sim-writeback"
                  data-ok={writeNote.ok ? "1" : "0"}
                >
                  {writeNote.text}
                </p>
              )}
              {alteredList.length > 0 && (
                <AlteredChip
                  altered={alteredList.map((c) => ({ control: c, value: sim.alters[c.refdes] }))}
                  onOpen={setSelectedEl}
                  onReset={(c) => setValue(c, null, true)}
                  onResetAll={() => sim.setAlters({}, true)}
                />
              )}
            </div>
          )}
          {/* fora da rolagem, logo sob a figura: no celular fica ACIMA do
              bottom sheet do slider, e o valor acompanha o arrasto */}
          {measurePanel && (
            // com o slider aberto no celular, as medidas sobem para o topo do sheet
            <div className={cn("mt-2", control && "max-sm:hidden")}>{measurePanel}</div>
          )}
          {control && (
            <ElementSlider
              key={control.refdes}
              control={control}
              value={sim.alters[control.refdes] ?? control.value}
              onChange={(v, commit) => setValue(control, v, commit)}
              onSettle={(v) => writeBack(control, v)}
              onReset={() => setValue(control, null, true)}
              onClose={closeSlider}
              anchor={anchor}
              mobileTop={measurePanel || undefined}
            />
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

        {!showFigure && measurePanel}

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
            {timeRange && (
              <TimeScrubber
                min={timeRange[0]}
                max={timeRange[1]}
                value={cursor}
                onChange={setCursor}
              />
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
                  cursor={timeRange ? cursor : null}
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

/** Chip "N alterados": lista as alterações (abrir o slider, desfazer uma,
 *  desfazer tudo). */
function AlteredChip({
  altered,
  onOpen,
  onReset,
  onResetAll,
}: {
  altered: { control: SimControl; value: number }[];
  onOpen: (refdes: string) => void;
  onReset: (c: SimControl) => void;
  onResetAll: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-(--color-success) bg-(--color-accent-soft) px-2 py-0.5 font-mono text-[10.5px] text-(--color-success) hover:bg-(--color-surface-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)"
          data-testid="sim-altered-chip"
        >
          <SlidersHorizontal size={11} />
          {t("sim.altered", { n: String(altered.length) })}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 max-w-[calc(100vw-1.5rem)] p-2"
        data-testid="sim-altered-list"
      >
        <p className="px-1 pb-1 font-mono text-[10.5px] tracking-widest text-(--color-text-muted) uppercase">
          {t("sim.alteredTitle")}
        </p>
        <ul className="space-y-0.5">
          {altered.map(({ control: c, value }) => (
            <li key={c.refdes} className="flex items-center gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate rounded-(--radius-sm) px-1 py-0.5 text-left font-mono text-[11.5px] text-(--color-text-body) hover:bg-(--color-surface-muted)"
                onClick={() => {
                  setOpen(false);
                  onOpen(c.refdes);
                }}
              >
                <span className="font-semibold text-(--color-text)">{c.refdes}</span>{" "}
                {formatSI(c.value, c.unit)} →{" "}
                <span className="text-(--color-success) italic">{formatSI(value, c.unit)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("sim.resetOne", { refdes: c.refdes })}
                onClick={() => onReset(c)}
              >
                <X size={12} />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-1.5 w-full"
          onClick={() => {
            setOpen(false);
            onResetAll();
          }}
          data-testid="sim-reset-all"
        >
          {t("sim.resetAll")}
        </Button>
      </PopoverContent>
    </Popover>
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
