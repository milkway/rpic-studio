import { AlertTriangle, Lightbulb, Terminal } from "lucide-react";
import type { ErrorInfo } from "@/lib/errorInfo";
import { useI18n } from "@/lib/i18n";

interface DiagnosticsPanelProps {
  error: ErrorInfo | null;
  prints: string[];
  /** Pula o editor para a posição do erro. */
  onJump?: (line: number, col: number) => void;
}

/** Barra de diagnósticos sob o editor: erro humanizado (clicável) ou `print`. */
export function DiagnosticsPanel({ error, prints, onJump }: DiagnosticsPanelProps) {
  const { t } = useI18n();
  if (!error && prints.length === 0) return null;
  return (
    <div
      data-testid="diagnostics-panel"
      className="max-h-36 shrink-0 overflow-auto border-t border-(--color-ink-border) bg-(--color-ink-raised) px-4 py-2.5 font-mono text-xs"
    >
      {error ? (
        <div data-testid="compile-error" className="space-y-1">
          <p className="flex items-start gap-2 text-[#ef9a9a]">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span className="font-sans text-[12.5px]">
              {error.line !== null && (
                <button
                  onClick={() => onJump?.(error.line!, error.col ?? 1)}
                  data-testid="error-jump"
                  className="mr-2 cursor-pointer rounded bg-[rgba(239,154,154,0.15)] px-1.5 py-0.5 font-mono text-[11px] underline-offset-2 hover:underline"
                >
                  {t("diag.line", { n: String(error.line) })}
                </button>
              )}
              {error.friendly}
            </span>
          </p>
          {error.suggestion && (
            <p className="flex items-start gap-2 pl-5 text-(--color-success)">
              <Lightbulb size={13} className="mt-0.5 shrink-0" />
              <span className="font-sans text-[12.5px]" data-testid="error-suggestion">
                {error.suggestion}
              </span>
            </p>
          )}
          <p className="pl-5 text-[10.5px] text-(--color-ink-muted)">{error.raw}</p>
        </div>
      ) : (
        prints.map((line, i) => (
          <p key={i} className="flex items-start gap-2 text-(--color-ink-muted)">
            <Terminal size={13} className="mt-0.5 shrink-0" />
            <span className="text-(--color-ink-text)">{line}</span>
          </p>
        ))
      )}
    </div>
  );
}
