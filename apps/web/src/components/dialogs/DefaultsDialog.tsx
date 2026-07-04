import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogClose, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { applyDefaults, PIC_VARS, readDefaults, type PicVar } from "@/lib/picDefaults";

interface DefaultsDialogProps {
  source: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Escreve o novo código com o bloco de padrões aplicado. */
  onApply: (source: string) => void;
}

const GROUPS: PicVar["group"][] = ["global", "dims", "stroke", "arrows"];

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

function VarSlider({
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
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm text-(--color-text-body)">
          {t(`defaults.var.${v.key}` as MessageKey)}
        </span>
        <span
          className={
            changed
              ? "font-mono text-xs font-medium text-(--color-accent)"
              : "font-mono text-xs text-(--color-text-muted)"
          }
        >
          {v.key} = {num(value)}
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
        className="w-full accent-(--color-accent)"
      />
    </label>
  );
}

/** Ajusta as variáveis pic e as escreve como um bloco editável no código. */
export function DefaultsDialog({ source, open, onOpenChange, onApply }: DefaultsDialogProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, number>>({});

  // Ao abrir, lê os valores do bloco existente (ou os defaults do rpic).
  useEffect(() => {
    if (!open) return;
    const current = readDefaults(source);
    const next: Record<string, number> = {};
    for (const v of PIC_VARS) next[v.key] = current[v.key] ?? v.default;
    setValues(next);
  }, [open, source]);

  const dirtyCount = useMemo(
    () => PIC_VARS.filter((v) => Math.abs((values[v.key] ?? v.default) - v.default) > 1e-9).length,
    [values],
  );

  const set = (key: string, n: number) => setValues((prev) => ({ ...prev, [key]: n }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("defaults.title")} description={t("defaults.desc")}>
        <div className="max-h-[55vh] space-y-4 overflow-auto pr-1">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-2 font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
                {t(`defaults.${group}` as MessageKey)}
              </h3>
              <div className="space-y-3">
                {PIC_VARS.filter((v) => v.group === group).map((v) => (
                  <VarSlider
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
        <DialogFooter>
          <button
            onClick={() => {
              const reset: Record<string, number> = {};
              for (const v of PIC_VARS) reset[v.key] = v.default;
              setValues(reset);
            }}
            className="mr-auto flex cursor-pointer items-center gap-1.5 text-xs text-(--color-text-muted) hover:text-(--color-text)"
          >
            <RotateCcw size={12} /> {t("defaults.clear")}
          </button>
          <DialogClose asChild>
            <Button variant="ghost">{t("save.cancel")}</Button>
          </DialogClose>
          <Button
            variant="primary"
            data-testid="defaults-apply"
            onClick={() => {
              onApply(applyDefaults(source, values));
              onOpenChange(false);
            }}
          >
            {t("defaults.apply")}
            {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
