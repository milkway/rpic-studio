import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { RotateCcw, X } from "lucide-react";
import { cn } from "@rpic/design-system";
import { formatSI } from "@/lib/waveform";
import {
  formatSpice,
  KEY_STEP,
  parseSpiceNumber,
  POS_MAX,
  POS_PER_DECADE,
  posOf,
  roundSig,
  valueAt,
  type SimControl,
} from "@/lib/simValues";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

/** Teclas que andam o slider (o fim do passo = soltá-las). */
const STEP_KEYS = new Set([
  "ArrowRight",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "End",
]);

interface ElementSliderProps {
  control: SimControl;
  /** Valor corrente (o alterado, ou o original). */
  value: number;
  /** Valor novo. `commit` = soltar/teclado/Enter: re-roda na hora (o arrasto
   *  é limitado no `useSimulation`). */
  onChange: (value: number, commit: boolean) => void;
  /** O usuário TERMINOU de mexer (soltou o ponteiro, Enter/blur no campo,
   *  soltou a tecla de passo) — nunca durante o arrasto. O painel escreve o
   *  valor de volta no fonte aqui. */
  onSettle?: (value: number) => void;
  onReset: () => void;
  onClose: () => void;
  /** Posição (px, relativa ao contêiner da figura) no desktop; no celular o
   *  slider é um bottom sheet e ignora isto. */
  anchor: { left: number; top: number } | null;
}

/** Slider flutuante do valor principal de um elemento: escala LOG de 100×÷ a
 *  100× em torno do valor do fonte, campo numérico (notação SPICE: `4.7k`,
 *  `10u`, `1meg`) e reset. Teclado: setas = 1/12 de década (≈ E12),
 *  PageUp/PageDown = uma década, Home = valor original, Esc fecha. */
/** Palavra-chave SPICE do parâmetro de uma fonte independente (o campo mostra
 *  `AC [1.5]`/`DC [5]`); outros elementos não têm. */
export function sourceKeyword(control: SimControl): string | null {
  if (!/^[VI]/i.test(control.refdes)) return null;
  return control.param === "acmag" ? "AC" : control.param === "dc" ? "DC" : null;
}

export function ElementSlider({
  control,
  value,
  onChange,
  onSettle,
  onReset,
  onClose,
  anchor,
}: ElementSliderProps) {
  const { t } = useI18n();
  const rangeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const original = control.value;
  // o CENTRO da escala é o valor do fonte na ABERTURA do slider: a escrita de
  // volta muda o original (o fonte) ao soltar, e recentrar a escala aí faria
  // o polegar saltar para o meio sob o dedo
  const [center] = useState(original);
  const pos = posOf(value, center);
  const altered = value !== original;
  const unit = control.unit;
  const ratio = roundSig(value / original, 2);

  // abre com o foco no slider (teclado já opera)
  useEffect(() => {
    rangeRef.current?.focus({ preventScroll: true });
  }, [control.refdes]);

  const step = (delta: number) =>
    onChange(valueAt(Math.min(POS_MAX, Math.max(0, pos + delta)), center), true);

  const onRangeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        step(KEY_STEP);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        step(-KEY_STEP);
        break;
      case "PageUp":
        step(POS_PER_DECADE);
        break;
      case "PageDown":
        step(-POS_PER_DECADE);
        break;
      case "Home":
        onReset();
        break;
      case "End":
        onChange(valueAt(POS_MAX, center), true);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  // fim do passo de teclado (tecla solta; segurar a seta = um único fim)
  const onRangeKeyUp = (e: KeyboardEvent<HTMLInputElement>) => {
    if (STEP_KEYS.has(e.key)) onSettle?.(value);
  };

  const parsed = draft === null ? value : parseSpiceNumber(draft);
  const invalid = draft !== null && (parsed === null || parsed === 0);
  const commitDraft = () => {
    if (draft === null) return;
    if (parsed !== null && parsed !== 0) {
      onChange(parsed, true);
      onSettle?.(parsed);
      setDraft(null);
    }
  };

  const style = anchor
    ? ({ "--sl-left": `${anchor.left}px`, "--sl-top": `${anchor.top}px` } as CSSProperties)
    : undefined;
  const label = t("sim.adjust", { refdes: control.refdes });
  const keyword = sourceKeyword(control);

  return (
    <div
      role="dialog"
      aria-label={label}
      data-testid="sim-slider"
      data-refdes={control.refdes}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      style={style}
      className={cn(
        "z-40 border-(--color-border) bg-(--color-surface) shadow-(--shadow-pop)",
        // celular: bottom sheet fixo na base da tela
        "fixed inset-x-0 bottom-0 rounded-t-(--radius-md) border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        // desktop: ancorado sob o elemento clicado
        "sm:absolute sm:inset-x-auto sm:bottom-auto sm:w-80 sm:rounded-(--radius-md) sm:border sm:px-3 sm:pt-2.5 sm:pb-2.5",
        anchor ? "sm:top-(--sl-top) sm:left-(--sl-left)" : "sm:top-2 sm:left-2",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-mono text-[12.5px] font-semibold text-(--color-text)">
          {control.refdes}
        </span>
        <span className="truncate font-mono text-[11px] text-(--color-text-muted)">
          {control.param}
        </span>
        {altered && (
          <span
            className="rounded-(--radius-sm) bg-(--color-accent-soft) px-1.5 font-mono text-[10.5px] text-(--color-success) tabular-nums"
            data-testid="sim-slider-ratio"
          >
            ×{ratio}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={t("sim.closeSlider")}
          onClick={onClose}
          data-testid="sim-slider-close"
        >
          <X size={13} />
        </Button>
      </div>

      <div className="mt-1 flex min-w-0 items-center gap-2">
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={POS_MAX}
          step={1}
          value={pos}
          aria-label={label}
          aria-valuetext={formatSI(value, unit)}
          onChange={(e) => onChange(valueAt(Number(e.currentTarget.value), center), false)}
          onPointerUp={(e) => {
            const v = valueAt(Number(e.currentTarget.value), center);
            onChange(v, true);
            onSettle?.(v);
          }}
          onKeyDown={onRangeKey}
          onKeyUp={onRangeKeyUp}
          className="h-7 min-w-0 flex-1 cursor-pointer accent-(--color-accent)"
          data-testid="sim-slider-range"
        />
        {keyword && (
          <span
            className="shrink-0 font-mono text-[11px] text-(--color-text-muted)"
            data-testid="sim-slider-keyword"
          >
            {keyword}
          </span>
        )}
        <input
          type="text"
          inputMode="decimal"
          spellCheck={false}
          aria-label={t("sim.sliderValue", { refdes: control.refdes })}
          aria-invalid={invalid || undefined}
          value={draft ?? formatSpice(value)}
          onFocus={(e) => {
            setDraft(formatSpice(value));
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => {
            commitDraft();
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "Escape" && draft !== null) {
              e.stopPropagation();
              setDraft(null);
            }
          }}
          className={cn(
            "h-7 w-18 shrink-0 rounded-(--radius-sm) border bg-(--color-paper) px-1.5 text-right font-mono text-[12px] text-(--color-text) tabular-nums",
            invalid ? "border-(--color-danger)" : "border-(--color-border-strong)",
          )}
          data-testid="sim-slider-input"
        />
        <span className="w-4 shrink-0 font-mono text-[12px] text-(--color-text-muted)">{unit}</span>
      </div>

      {/* marcas sob a TRILHA (a coluna do campo+unidade fica de fora):
          ÷100, o valor do fonte no centro, ×100 */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 font-mono text-[10px] text-(--color-text-muted) tabular-nums",
          keyword ? "pr-[8rem]" : "pr-[6.5rem]",
        )}
        aria-hidden
      >
        <span>{formatSI(valueAt(0, center), unit)}</span>
        <span className="text-(--color-text-body)">{formatSI(center, unit)}</span>
        <span>{formatSI(valueAt(POS_MAX, center), unit)}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[10px] leading-tight text-(--color-text-muted) max-sm:hidden">
          {t("sim.sliderKeys")}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0 whitespace-nowrap"
          disabled={!altered}
          onClick={() => {
            onReset();
            // o botão desabilita ao voltar ao original: o foco não pode cair no body
            rangeRef.current?.focus({ preventScroll: true });
          }}
          data-testid="sim-slider-reset"
        >
          <RotateCcw size={12} />
          {t("sim.resetTo", { value: formatSI(original, unit) })}
        </Button>
      </div>
    </div>
  );
}
