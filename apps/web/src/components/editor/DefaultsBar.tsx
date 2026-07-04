import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { applyDefaults, PIC_VARS, readDefaults, type PicVar } from "@/lib/picDefaults";

interface DefaultsBarProps {
  open: boolean;
  source: string;
  /** Escreve o novo código com o bloco de padrões aplicado (ao vivo). */
  onApply: (source: string) => void;
  onClose: () => void;
}

const GROUPS: PicVar["group"][] = ["global", "dims", "stroke", "arrows"];

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

function Slider({
  v,
  value,
  onChange,
}: {
  v: PicVar;
  value: number;
  onChange: (n: number) => void;
}) {
  const { t } = useI18n();
  const changed = Math.abs(value - v.default) > 1e-9;
  const pct = ((value - v.min) / (v.max - v.min)) * 100;
  return (
    <label
      className="block"
      title={t(`defaults.var.${v.key}` as MessageKey)}
      data-testid={`defaults-row-${v.key}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-(--color-ink-text)">{v.key}</span>
        <span
          className={
            changed
              ? "rounded bg-(--color-accent-soft) px-1.5 py-px font-mono text-[10px] font-medium text-(--color-accent)"
              : "font-mono text-[10px] text-(--color-ink-muted)"
          }
        >
          {num(value)}
        </span>
      </div>
      <input
        type="range"
        min={v.min}
        max={v.max}
        step={v.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={`defaults-${v.key}`}
        className="rpic-slider"
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
    </label>
  );
}

/** Barra que expande no rodapé do editor: sliders das variáveis pic com
 *  aplicação AO VIVO no código (o preview reflete enquanto você arrasta). */
export function DefaultsBar({ open, source, onApply, onClose }: DefaultsBarProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, number>>({});
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const timerRef = useRef<number | null>(null);

  // Ao abrir, lê os valores do bloco existente (ou os defaults do rpic).
  useEffect(() => {
    if (!open) return;
    const current = readDefaults(sourceRef.current);
    const next: Record<string, number> = {};
    for (const v of PIC_VARS) next[v.key] = current[v.key] ?? v.default;
    setValues(next);
  }, [open]);

  const dirtyCount = useMemo(
    () => PIC_VARS.filter((v) => Math.abs((values[v.key] ?? v.default) - v.default) > 1e-9).length,
    [values],
  );

  const commit = (next: Record<string, number>) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onApplyRef.current(applyDefaults(sourceRef.current, next));
    }, 160);
  };

  const set = (key: string, n: number) => {
    setValues((prev) => {
      const next = { ...prev, [key]: n };
      commit(next);
      return next;
    });
  };

  const restore = () => {
    const next: Record<string, number> = {};
    for (const v of PIC_VARS) next[v.key] = v.default;
    setValues(next);
    onApply(applyDefaults(sourceRef.current, next)); // remove o bloco na hora
  };

  if (!open) return null;

  return (
    <div
      data-testid="defaults-bar"
      className="shrink-0 border-t border-(--color-ink-border) bg-(--color-ink)"
    >
      <div className="flex items-center justify-between border-b border-(--color-ink-border) px-3.5 py-2">
        <div className="flex items-center gap-2 text-(--color-ink-text)">
          <SlidersHorizontal size={13} className="text-(--color-accent)" />
          <span className="text-xs font-medium">{t("defaults.title")}</span>
          {dirtyCount > 0 && (
            <span className="rounded-full bg-(--color-accent) px-1.5 text-[10px] font-semibold text-white">
              {dirtyCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dirtyCount > 0 && (
            <button
              onClick={restore}
              data-testid="defaults-restore"
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-(--color-ink-muted) transition-colors hover:text-(--color-ink-text)"
            >
              <RotateCcw size={11} /> {t("defaults.clear")}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Fechar"
            data-testid="defaults-close"
            className="cursor-pointer rounded p-0.5 text-(--color-ink-muted) transition-colors hover:text-(--color-ink-text)"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex max-h-44 gap-6 overflow-auto px-3.5 py-3">
        {GROUPS.map((group) => (
          <section key={group} className="min-w-[9.5rem] flex-1">
            <p className="mb-2 font-mono text-[9px] tracking-[0.15em] text-(--color-ink-muted) uppercase">
              {t(`defaults.${group}` as MessageKey)}
            </p>
            <div className="space-y-3">
              {PIC_VARS.filter((v) => v.group === group).map((v) => (
                <Slider
                  key={v.key}
                  v={v}
                  value={values[v.key] ?? v.default}
                  onChange={(n) => set(v.key, n)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
