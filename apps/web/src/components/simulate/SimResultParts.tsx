import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy, TriangleAlert } from "lucide-react";
import { cn } from "@rpic/design-system";
import type { Plot, SimDiagnostic } from "@/lib/dune";
import type { MeasureRow } from "@/lib/simMeasure";
import { formatSI, isComplex, unitOf } from "@/lib/waveform";
import { copyText } from "@/lib/exports";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

/** Lista de diagnósticos (extração pic + parser do netlist). Os da PRÓPRIA
 *  figura (`file: null`) pulam o editor para linha/coluna, como o
 *  DiagnosticsPanel; os do prelude/biblioteca/deck só mostram a origem. */
export function SimDiagnostics({
  diagnostics,
  onJump,
}: {
  diagnostics: SimDiagnostic[];
  onJump?: (line: number, col: number) => void;
}) {
  const { t } = useI18n();
  if (diagnostics.length === 0) return null;
  return (
    <section className="space-y-1" data-testid="sim-diagnostics">
      <h3 className="font-mono text-[10.5px] tracking-widest text-(--color-text-muted) uppercase">
        {t("sim.diagnostics")}
      </h3>
      <ul className="space-y-1">
        {diagnostics.map((d, i) => {
          const isError = d.severity === "error";
          const own = d.file === null && d.line !== null;
          return (
            <li
              key={i}
              data-testid={`sim-diag-${i}`}
              data-severity={d.severity}
              className={cn(
                "flex items-start gap-2 text-[12.5px]",
                isError ? "text-(--color-danger)" : "text-(--color-warning)",
              )}
            >
              {isError ? (
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-label="error" />
              ) : (
                <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-label="warning" />
              )}
              <span>
                {own ? (
                  <button
                    onClick={() => onJump?.(d.line!, d.column ?? 1)}
                    data-testid={`sim-diag-${i}-jump`}
                    className="mr-2 cursor-pointer rounded bg-(--color-surface-muted) px-1.5 py-0.5 font-mono text-[11px] underline-offset-2 hover:underline"
                  >
                    {t("diag.line", { n: String(d.line) })}
                  </button>
                ) : (
                  d.line !== null && (
                    <span className="mr-2 font-mono text-[11px] text-(--color-text-muted)">
                      {d.file ?? ""}:{d.line}
                    </span>
                  )
                )}
                <span className="text-(--color-text-body)">{d.message}</span>
                {d.kind && (
                  <span className="ml-1.5 font-mono text-[10.5px] text-(--color-text-muted)">
                    [{d.kind}]
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Netlist extraído, recolhível, monoespaçado, com copiar. Hover numa linha
 *  de elemento realça as formas dele na figura. */
export function NetlistBlock({
  netlist,
  onHoverLine,
  defaultOpen = true,
}: {
  netlist: string;
  onHoverLine: (line: string | null) => void;
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const lines = netlist.replace(/\n$/, "").split("\n");
  return (
    <section
      className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface)"
      data-testid="sim-netlist"
    >
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="sim-netlist-toggle"
          className="flex cursor-pointer items-center gap-1 font-mono text-[10.5px] tracking-widest text-(--color-text-muted) uppercase hover:text-(--color-text)"
        >
          <ChevronRight size={12} className={cn("transition-transform", open && "rotate-90")} />
          {t("sim.netlist")}
          <span className="normal-case tracking-normal">· {lines.length}</span>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={t("sim.copyNetlist")}
          data-testid="sim-netlist-copy"
          onClick={async () => {
            await copyText(netlist);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
            toast(t("preview.copiedToClipboard"));
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </Button>
      </div>
      {open && (
        <pre
          className="overflow-x-auto border-t border-(--color-border) px-1 py-1.5 font-mono text-[11.5px] leading-[1.55] text-(--color-text-body)"
          data-testid="sim-netlist-code"
        >
          {lines.map((l, i) => (
            <div
              key={i}
              onPointerEnter={() => onHoverLine(l)}
              onPointerLeave={() => onHoverLine(null)}
              className={cn(
                "rounded-sm px-2",
                l.startsWith("*")
                  ? "text-(--color-text-muted)"
                  : "hover:bg-(--color-accent-soft) hover:text-(--color-text)",
              )}
            >
              {l || " "}
            </div>
          ))}
        </pre>
      )}
    </section>
  );
}

/** Plots sem escala (`.op`, `.tf`, …): tabela compacta nome → valor. */
export function ScalarTable({
  plot,
  onHover,
}: {
  plot: Plot;
  onHover: (name: string | null) => void;
}) {
  const { t } = useI18n();
  const complex = isComplex(plot);
  return (
    <section className="space-y-1" data-testid="sim-table">
      <h3 className="font-mono text-[10.5px] tracking-widest text-(--color-text-muted) uppercase">
        {plot.plotname}
      </h3>
      <table className="w-full border-collapse font-mono text-[11.5px]">
        <thead>
          <tr className="text-left text-(--color-text-muted)">
            <th className="py-0.5 pr-3 font-normal">{t("sim.variable")}</th>
            <th className="py-0.5 text-right font-normal">{t("sim.value")}</th>
          </tr>
        </thead>
        <tbody>
          {plot.variables.map((v, i) => {
            const unit = unitOf(v.type);
            let text: string;
            const col = plot.columns[i];
            if (complex) {
              // re,im intercalados: o 1º ponto são col[0], col[1]
              const [re, im] = [col[0], col[1]];
              text = `${formatSI(re ?? null, "", 4)} ${im < 0 ? "−" : "+"} j${formatSI(im === undefined ? null : Math.abs(im), unit, 4)}`;
            } else {
              text = formatSI(col[0] ?? null, unit, 4);
            }
            return (
              <tr
                key={v.name}
                onPointerEnter={() => onHover(v.name)}
                onPointerLeave={() => onHover(null)}
                className="border-t border-(--color-border) text-(--color-text-body) hover:bg-(--color-accent-soft) hover:text-(--color-text)"
              >
                <td className="py-0.5 pr-3">{v.name}</td>
                <td className="py-0.5 text-right tabular-nums">{text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Painel compacto das medidas `.measure` do run: nome, valor (prefixo SI) e
 *  o detalhe que o ngspice imprime ao lado (trig/targ, at, with, janela
 *  from/to). Linha que falhou mostra a razão e NUNCA some. Atualiza a cada
 *  run, os re-runs de slider inclusive (o valor "respira" com o arrasto).
 *  As linhas vêm prontas (`measureRows`, memoizado no painel): as duas
 *  instâncias — sob a figura e no topo do sheet do slider — dividem o cálculo. */
export function MeasurePanel({ rows }: { rows: readonly MeasureRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  return (
    <section
      className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5"
      data-testid="sim-measures"
      aria-label={t("sim.measures")}
    >
      <h3 className="font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
        {t("sim.measures")}
      </h3>
      <ul className="max-h-28 overflow-auto font-mono text-[11.5px]">
        {rows.map((r) => (
          <li
            key={r.key}
            data-testid="sim-measure"
            data-name={r.name}
            data-error={r.error === null ? "0" : "1"}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2 leading-snug"
          >
            <span className="font-semibold text-(--color-text)">{r.name}</span>
            <span
              className={cn(
                "tabular-nums",
                r.error === null ? "text-(--color-text-body)" : "text-(--color-text-muted)",
              )}
              data-testid="sim-measure-value"
            >
              {r.value}
            </span>
            {r.error !== null ? (
              <span className="min-w-0 text-[10.5px] text-(--color-warning)">
                {t("sim.measureFailed", { reason: r.error })}
              </span>
            ) : (
              r.details.length > 0 && (
                <span className="min-w-0 text-[10.5px] text-(--color-text-muted) tabular-nums">
                  {r.details.join(" · ")}
                </span>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
