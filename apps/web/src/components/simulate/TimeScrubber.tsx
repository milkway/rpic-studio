import { useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { formatSI } from "@/lib/waveform";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

/** Duração de uma passada completa do "play" (independe do tempo simulado). */
const SWEEP_MS = 4000;
/** Resolução do slider: passos sobre o intervalo da escala. */
const STEPS = 1000;

interface TimeScrubberProps {
  /** Intervalo da escala (s) do plot de transiente. */
  min: number;
  max: number;
  /** Instante corrente; `null` = sem cursor. */
  value: number | null;
  onChange: (t: number | null) => void;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

/** Scrubber de tempo do `.tran`: arrastar move o cursor sobre os gráficos
 *  (linha + marcas + valores na legenda); "play" varre o intervalo em
 *  `SWEEP_MS`. Com `prefers-reduced-motion`, o play pula em 10 passos
 *  discretos em vez de animar continuamente. */
export function TimeScrubber({ min, max, value, onChange }: TimeScrubberProps) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const span = max - min;
  const pos = value === null ? 0 : Math.round(((value - min) / span) * STEPS);

  // animação: rAF avança a partir do instante corrente até o fim e para
  useEffect(() => {
    if (!playing) return;
    const from = value === null || value >= max ? min : value;
    const t0 = performance.now() - ((from - min) / span) * SWEEP_MS;
    const reduce = reducedMotion();
    const tick = (now: number) => {
      let f = Math.min(1, (now - t0) / SWEEP_MS);
      if (reduce) f = Math.min(1, Math.ceil(f * 10) / 10);
      onChange(min + f * span);
      if (f >= 1) {
        setPlaying(false);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
    // só (re)inicia ao apertar play: o `value` que a própria animação muda
    // não entra nas dependências (reiniciaria a cada quadro)
  }, [playing, min, max]);

  if (!(span > 0)) return null;
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 py-1.5"
      data-testid="sim-scrubber"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={playing ? t("sim.pause") : t("sim.play")}
        aria-pressed={playing}
        onClick={() => setPlaying((p) => !p)}
        data-testid="sim-scrubber-play"
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </Button>
      <input
        type="range"
        min={0}
        max={STEPS}
        step={1}
        value={pos}
        aria-label={t("sim.time")}
        aria-valuetext={value === null ? "—" : formatSI(value, "s", 4)}
        onChange={(e) => {
          setPlaying(false);
          onChange(min + (Number(e.currentTarget.value) / STEPS) * span);
        }}
        className="h-6 min-w-0 flex-1 cursor-pointer accent-(--color-accent)"
        data-testid="sim-scrubber-range"
      />
      <span
        className="w-20 shrink-0 text-right font-mono text-[11px] text-(--color-text) tabular-nums"
        data-testid="sim-scrubber-time"
      >
        {value === null ? "—" : formatSI(value, "s", 4)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("sim.clearCursor")}
        disabled={value === null}
        onClick={() => {
          setPlaying(false);
          onChange(null);
        }}
        data-testid="sim-scrubber-clear"
      >
        <X size={13} />
      </Button>
    </div>
  );
}
