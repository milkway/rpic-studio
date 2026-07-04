import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
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

/** Barra que expande no rodapé do editor: sliders das variáveis pic com
 *  aplicação AO VIVO no código (o preview reflete enquanto você arrasta). */
export function DefaultsBar({ open, source, onApply, onClose }: DefaultsBarProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, number>>({});
  // Sempre aplica contra o código mais recente (o usuário pode estar editando).
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const timerRef = useRef<number | null>(null);

  // Ao abrir, lê os valores do bloco existente (ou os defaults do rpic).
  // Reinicializa só na transição de fechado→aberto (não a cada tecla no editor).
  useEffect(() => {
    if (!open) return;
    const current = readDefaults(sourceRef.current);
    const next: Record<string, number> = {};
    for (const v of PIC_VARS) next[v.key] = current[v.key] ?? v.default;
    setValues(next);
  }, [open]);

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

  const reset = () => {
    const next: Record<string, number> = {};
    for (const v of PIC_VARS) next[v.key] = v.default;
    setValues(next);
    onApply(applyDefaults(sourceRef.current, next)); // remove o bloco na hora
  };

  if (!open) return null;

  return (
    <div
      data-testid="defaults-bar"
      className="shrink-0 border-t border-(--color-ink-border) bg-(--color-ink-raised)"
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-widest text-(--color-ink-muted) uppercase">
          {t("defaults.title")}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="flex cursor-pointer items-center gap-1 text-[11px] text-(--color-ink-muted) hover:text-(--color-ink-text)"
          >
            <RotateCcw size={11} /> {t("defaults.clear")}
          </button>
          <button
            onClick={onClose}
            aria-label="Fechar"
            data-testid="defaults-close"
            className="cursor-pointer rounded p-0.5 text-(--color-ink-muted) hover:text-(--color-ink-text)"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex max-h-40 flex-wrap gap-x-5 gap-y-2 overflow-auto px-3 pt-1 pb-3">
        {GROUPS.map((group) => (
          <div key={group} className="min-w-40">
            <p className="mb-1 font-mono text-[9px] tracking-widest text-(--color-ink-muted) uppercase">
              {t(`defaults.${group}` as MessageKey)}
            </p>
            <div className="space-y-1.5">
              {PIC_VARS.filter((v) => v.group === group).map((v) => {
                const val = values[v.key] ?? v.default;
                const changed = Math.abs(val - v.default) > 1e-9;
                return (
                  <label key={v.key} className="block w-36">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="truncate text-[11px] text-(--color-ink-muted)">
                        {t(`defaults.var.${v.key}` as MessageKey)}
                      </span>
                      <span
                        className={
                          changed
                            ? "font-mono text-[10px] text-(--color-accent)"
                            : "font-mono text-[10px] text-(--color-ink-muted)"
                        }
                      >
                        {num(val)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={v.min}
                      max={v.max}
                      step={v.step}
                      value={val}
                      onChange={(e) => set(v.key, Number(e.target.value))}
                      data-testid={`defaults-${v.key}`}
                      className="w-full accent-(--color-accent)"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
