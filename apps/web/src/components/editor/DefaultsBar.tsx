import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Cpu, RotateCcw, Sigma, SlidersHorizontal, Type, X } from "lucide-react";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { applyDefaults, PIC_VARS, readDefaults, type PicVar } from "@/lib/picDefaults";
import { fontLabel, resolveFontStack } from "@/lib/appearance";
import { mathActive } from "@/lib/rpic";
import { TypefacePicker } from "./TypefacePicker";

interface DefaultsBarProps {
  open: boolean;
  source: string;
  /** Escreve o novo código com o bloco de padrões aplicado (ao vivo). */
  onApply: (source: string) => void;
  onClose: () => void;
  /** Fonte do diagrama (aparência de render, não vai no código). */
  fontFamily: string;
  onFontChange: (fontFamily: string) => void;
  /** Recursos detectados no código (somente leitura). */
  circuits: boolean;
  texlabels: boolean;
}

const GROUPS: PicVar["group"][] = ["global", "dims", "stroke", "arrows"];

const HEIGHT_KEY = "rpic:defaultsH.v1";
const DEFAULT_H = 220;
const MIN_H = 130;

function loadHeight(): number {
  try {
    const v = Number(window.localStorage.getItem(HEIGHT_KEY));
    return v >= MIN_H ? v : DEFAULT_H;
  } catch {
    return DEFAULT_H;
  }
}

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
 *  aplicação AO VIVO no código, redimensionável pela alça superior. */
/** Status somente-leitura de um recurso auto-detectado (circuitos, TeX). */
function FeatureStatus({
  icon,
  label,
  active,
  hint,
  testid,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  hint?: string;
  testid: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2" data-testid={testid}>
      <span className="flex items-center gap-1.5 text-[13px] text-(--color-ink-text)">
        <span className={active ? "text-(--color-accent)" : "text-(--color-ink-muted)"}>
          {icon}
        </span>
        {label}
      </span>
      <span
        className={
          active
            ? "rounded-full bg-(--color-accent) px-2 py-px text-[10px] font-semibold text-white"
            : "rounded-full bg-(--color-ink-raised) px-2 py-px text-[10px] font-medium text-(--color-ink-muted)"
        }
        data-active={active}
      >
        {active ? t("features.on") : t("features.off")}
      </span>
      {hint && active && <span className="sr-only">{hint}</span>}
    </div>
  );
}

export function DefaultsBar({
  open,
  source,
  onApply,
  onClose,
  fontFamily,
  onFontChange,
  circuits,
  texlabels,
}: DefaultsBarProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, number>>({});
  const [height, setHeight] = useState(loadHeight);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const timerRef = useRef<number | null>(null);

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
    onApply(applyDefaults(sourceRef.current, next));
  };

  // Alça de arrasto: puxar para cima cresce a barra (encolhe o editor).
  const onResizeStart = useCallback((down: React.PointerEvent) => {
    down.preventDefault();
    const startY = down.clientY;
    const startH = height;
    const maxH = Math.round(window.innerHeight * 0.6);
    const move = (e: PointerEvent) => {
      setHeight(Math.min(Math.max(startH + (startY - e.clientY), MIN_H), maxH));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setHeight((h) => {
        try {
          window.localStorage.setItem(HEIGHT_KEY, String(h));
        } catch {
          // sem persistência — a altura vale para a sessão
        }
        return h;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [height]);

  if (!open) return null;

  return (
    <div
      data-testid="defaults-bar"
      className="flex shrink-0 flex-col border-t border-(--color-ink-border) bg-(--color-ink)"
    >
      {/* alça de redimensionamento */}
      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={onResizeStart}
        data-testid="defaults-resize"
        className="group flex h-2 cursor-row-resize items-center justify-center"
      >
        <div className="h-0.5 w-9 rounded-full bg-(--color-ink-border) transition-colors group-hover:bg-(--color-accent)" />
      </div>

      <div className="flex items-center justify-between px-3.5 pb-2">
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

      {/* Wrapper com a altura escolhida + scroll; dentro, um fluxo multi-coluna
          de altura automática que BALANCEIA os grupos (largura de coluna
          adaptativa à largura real da barra). */}
      <div
        className="overflow-auto border-t border-(--color-ink-border) px-3.5 py-3"
        style={{ height }}
      >
        <div className="gap-x-7 [column-width:14rem]">
          {/* Fonte: aparência de render (não escrita no código) — mas mora
              aqui porque, para o usuário, é uma propriedade do diagrama. */}
          <section className="mb-5 inline-block w-full break-inside-avoid align-top">
            <p className="mb-2 font-mono text-[9px] tracking-[0.15em] text-(--color-ink-muted) uppercase">
              {t("canvas.typeface")}
            </p>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  data-testid="font-trigger"
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-(--radius-sm) border border-(--color-ink-border) bg-(--color-ink-raised) px-2.5 py-1.5 text-left text-[13px] text-(--color-ink-text) transition-colors hover:border-(--color-ink-muted)"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Type size={13} className="shrink-0 text-(--color-ink-muted)" />
                    <span
                      className="truncate"
                      style={{ fontFamily: resolveFontStack(fontFamily) || undefined }}
                    >
                      {fontLabel(fontFamily)}
                    </span>
                  </span>
                  <ChevronDown size={13} className="shrink-0 text-(--color-ink-muted)" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="top"
                  align="start"
                  sideOffset={6}
                  className="z-50 w-72 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 shadow-(--shadow-pop)"
                >
                  <TypefacePicker value={fontFamily} onChange={onFontChange} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </section>

          {/* Recursos auto-detectados (sem interruptor): ligam sozinhos com o
              código; aqui o usuário vê o estado atual. */}
          <section className="mb-5 inline-block w-full break-inside-avoid align-top">
            <p className="mb-2 font-mono text-[9px] tracking-[0.15em] text-(--color-ink-muted) uppercase">
              {t("features.title")}
            </p>
            <div className="space-y-2.5">
              <FeatureStatus
                icon={<Cpu size={13} />}
                label={t("features.circuits")}
                active={circuits}
                testid="feature-circuits"
              />
              <FeatureStatus
                icon={<Sigma size={13} />}
                label={t("features.texlabels")}
                active={texlabels}
                hint={texlabels && !mathActive() ? t("math.reloadHint") : undefined}
                testid="feature-texlabels"
              />
              {texlabels && !mathActive() && (
                <p className="text-[10px] text-(--color-warning)">{t("features.texReload")}</p>
              )}
            </div>
          </section>

          {GROUPS.map((group) => (
            <section key={group} className="mb-5 inline-block w-full break-inside-avoid align-top">
              <p className="mb-2 font-mono text-[9px] tracking-[0.15em] text-(--color-ink-muted) uppercase">
                {t(`defaults.${group}` as MessageKey)}
              </p>
              <div className="space-y-3.5">
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
    </div>
  );
}
