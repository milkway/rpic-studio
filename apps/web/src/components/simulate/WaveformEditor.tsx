import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@rpic/design-system";
import { LITERAL } from "@/lib/simSource";
import { parseSpiceNumber } from "@/lib/simValues";
import type { SourceWaveform, WaveArg, WaveQuantity } from "@/lib/simWaveform";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

/** Nome legível de cada argumento (o nome SPICE vai ao lado, em mono). */
const LABEL: Readonly<Record<string, MessageKey>> = {
  v1: "sim.wave.v1",
  v2: "sim.wave.v2",
  td: "sim.wave.td",
  tr: "sim.wave.tr",
  tf: "sim.wave.tf",
  pw: "sim.wave.pw",
  per: "sim.wave.per",
  np: "sim.wave.np",
  vo: "sim.wave.vo",
  va: "sim.wave.va",
  freq: "sim.wave.freq",
  theta: "sim.wave.theta",
  phase: "sim.wave.phase",
  td1: "sim.wave.td1",
  tau1: "sim.wave.tau1",
  td2: "sim.wave.td2",
  tau2: "sim.wave.tau2",
  fc: "sim.wave.fc",
  mdi: "sim.wave.mdi",
  fs: "sim.wave.fs",
  phasec: "sim.wave.phasec",
  phases: "sim.wave.phases",
};

/** Chave do rótulo de um argumento (no PWL, `t3`/`v3` = tempo/valor). */
export function waveArgLabel(wave: SourceWaveform, arg: WaveArg): MessageKey {
  if (wave.fn === "pwl") return arg.quantity === "time" ? "sim.wave.pwlT" : "sim.wave.pwlV";
  return LABEL[arg.name] ?? "sim.wave.other";
}

function unitOf(q: WaveQuantity, level: string): string {
  switch (q) {
    case "level":
      return level;
    case "time":
      return "s";
    case "freq":
      return "Hz";
    case "damping":
      return "1/s";
    case "angle":
      return "°";
    default:
      return "";
  }
}

const valid = (text: string) => {
  const s = text.trim().replace("−", "-");
  return LITERAL.test(s) && parseSpiceNumber(s) !== null;
};

interface WaveformEditorProps {
  wave: SourceWaveform;
  /** Escreve `text` no argumento `index` (no fonte; a sessão reabre). */
  onCommit: (index: number, text: string) => void;
  onClose: () => void;
  /** Posição (px, relativa ao contêiner da figura) no desktop; no celular o
   *  editor é um bottom sheet e ignora isto. */
  anchor: { left: number; top: number } | null;
  /** Só no celular: conteúdo acima dos campos (as medidas, que o sheet cobriria). */
  mobileTop?: ReactNode;
}

/** Editor da forma de onda de uma fonte (`PULSE`, `SIN`, `EXP`, `SFFM`,
 *  `PWL`): um campo por argumento grafado, em notação SPICE (`1u`, `10m`).
 *  Enter ou sair do campo escreve o argumento no fonte; Esc desfaz o que foi
 *  digitado e, de novo, fecha. */
export function WaveformEditor({ wave, onCommit, onClose, anchor, mobileTop }: WaveformEditorProps) {
  const { t } = useI18n();
  const firstRef = useRef<HTMLInputElement>(null);
  /** Texto em edição por argumento (ausente = o do fonte). */
  const [drafts, setDrafts] = useState<Readonly<Record<number, string>>>({});

  // abre com o foco no 1º campo editável
  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
    firstRef.current?.select();
  }, [wave.refdes]);

  const setDraft = (i: number, text: string | null) =>
    setDrafts((cur) => {
      const next = { ...cur };
      if (text === null) delete next[i];
      else next[i] = text;
      return next;
    });
  const commit = (arg: WaveArg) => {
    const draft = drafts[arg.index];
    if (draft === undefined) return;
    if (!valid(draft)) return; // fica vermelho, nada é escrito
    setDraft(arg.index, null);
    if (draft.trim() !== arg.text) onCommit(arg.index, draft);
  };

  const style = anchor
    ? ({ "--sl-left": `${anchor.left}px`, "--sl-top": `${anchor.top}px` } as CSSProperties)
    : undefined;
  const label = t("sim.wave.edit", { refdes: wave.refdes });
  const firstEditable = wave.args.find((a) => a.value !== null)?.index;

  return (
    <div
      role="dialog"
      aria-label={label}
      data-testid="sim-wave"
      data-refdes={wave.refdes}
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
        "fixed inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-(--radius-md) border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        // desktop: ancorado sob a fonte clicada
        "sm:absolute sm:inset-x-auto sm:bottom-auto sm:max-h-none sm:w-80 sm:rounded-(--radius-md) sm:border sm:px-3 sm:pt-2.5 sm:pb-2.5",
        anchor ? "sm:top-(--sl-top) sm:left-(--sl-left)" : "sm:top-2 sm:left-2",
      )}
    >
      {mobileTop && <div className="mb-2 sm:hidden">{mobileTop}</div>}
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-mono text-[12.5px] font-semibold text-(--color-text)">
          {wave.refdes}
        </span>
        <span className="truncate font-mono text-[11px] text-(--color-text-muted)" data-testid="sim-wave-fn">
          {wave.fn.toUpperCase()}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={t("sim.wave.close")}
          onClick={onClose}
          data-testid="sim-wave-close"
        >
          <X size={13} />
        </Button>
      </div>

      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_auto_1.75rem] items-center gap-x-2 gap-y-1">
        {wave.args.map((arg) => {
          const name = t(waveArgLabel(wave, arg));
          const draft = drafts[arg.index];
          const invalid = draft !== undefined && !valid(draft);
          const readOnly = arg.value === null;
          return (
            <div key={arg.index} className="contents" data-testid="sim-wave-row">
              <span className="truncate text-[12px] text-(--color-text-body)">{name}</span>
              <span className="font-mono text-[10.5px] text-(--color-text-muted) uppercase">
                {arg.name}
              </span>
              <input
                ref={arg.index === firstEditable ? firstRef : undefined}
                type="text"
                inputMode="decimal"
                spellCheck={false}
                readOnly={readOnly}
                title={readOnly ? t("sim.wave.ro") : undefined}
                aria-label={t("sim.wave.field", { name, refdes: wave.refdes })}
                aria-invalid={invalid || undefined}
                value={draft ?? arg.text}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDraft(arg.index, e.currentTarget.value)}
                onBlur={() => {
                  commit(arg);
                  setDraft(arg.index, null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit(arg);
                  } else if (e.key === "Escape" && draft !== undefined) {
                    e.stopPropagation();
                    setDraft(arg.index, null);
                  }
                }}
                className={cn(
                  "h-7 w-20 rounded-(--radius-sm) border bg-(--color-paper) px-1.5 text-right font-mono text-[12px] text-(--color-text) tabular-nums",
                  invalid ? "border-(--color-danger)" : "border-(--color-border-strong)",
                  readOnly && "cursor-not-allowed opacity-60",
                )}
                data-testid={`sim-wave-${arg.name}`}
              />
              <span className="font-mono text-[11px] text-(--color-text-muted)">
                {unitOf(arg.quantity, wave.unit)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-tight text-(--color-text-muted) max-sm:hidden">
        {t("sim.wave.hint")}
      </p>
    </div>
  );
}
