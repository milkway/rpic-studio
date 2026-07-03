import { AlertTriangle, Lightbulb, Terminal, TriangleAlert } from "lucide-react";
import type { ErrorInfo } from "@/lib/errorInfo";
import { useI18n } from "@/lib/i18n";

interface DiagnosticsPanelProps {
  error: ErrorInfo | null;
  warnings: ErrorInfo[];
  prints: string[];
  /** Pula o editor para a posição do diagnóstico. */
  onJump?: (line: number, col: number) => void;
}

function DiagnosticRow({
  info,
  testid,
  onJump,
}: {
  info: ErrorInfo;
  testid: string;
  onJump?: (line: number, col: number) => void;
}) {
  const { t } = useI18n();
  const isError = info.severity === "error";
  return (
    <div data-testid={testid} className="space-y-1">
      <p
        className={`flex items-start gap-2 ${isError ? "text-[#ef9a9a]" : "text-[#e6c96a]"}`}
      >
        {isError ? (
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        ) : (
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
        )}
        <span className="font-sans text-[12.5px]">
          {info.line !== null && (
            <button
              onClick={() => onJump?.(info.line!, info.col ?? 1)}
              data-testid={`${testid}-jump`}
              className={`mr-2 cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] underline-offset-2 hover:underline ${
                isError ? "bg-[rgba(239,154,154,0.15)]" : "bg-[rgba(230,201,106,0.15)]"
              }`}
            >
              {t("diag.line", { n: String(info.line) })}
            </button>
          )}
          {info.friendly}
        </span>
      </p>
      {info.suggestion && (
        <p className="flex items-start gap-2 pl-5 text-(--color-success)">
          <Lightbulb size={13} className="mt-0.5 shrink-0" />
          <span className="font-sans text-[12.5px]" data-testid={`${testid}-suggestion`}>
            {info.suggestion}
          </span>
        </p>
      )}
      {isError && <p className="pl-5 text-[10.5px] text-(--color-ink-muted)">{info.raw}</p>}
    </div>
  );
}

/** Barra de diagnósticos sob o editor: erro humanizado, avisos e `print`. */
export function DiagnosticsPanel({ error, warnings, prints, onJump }: DiagnosticsPanelProps) {
  if (!error && warnings.length === 0 && prints.length === 0) return null;
  return (
    <div
      data-testid="diagnostics-panel"
      className="max-h-36 shrink-0 space-y-1.5 overflow-auto border-t border-(--color-ink-border) bg-(--color-ink-raised) px-4 py-2.5 font-mono text-xs"
    >
      {error ? (
        <DiagnosticRow info={error} testid="compile-error" onJump={onJump} />
      ) : (
        <>
          {warnings.map((w, i) => (
            <DiagnosticRow key={i} info={w} testid={`compile-warning-${i}`} onJump={onJump} />
          ))}
          {prints.map((line, i) => (
            <p key={i} className="flex items-start gap-2 text-(--color-ink-muted)">
              <Terminal size={13} className="mt-0.5 shrink-0" />
              <span className="text-(--color-ink-text)">{line}</span>
            </p>
          ))}
        </>
      )}
    </div>
  );
}
