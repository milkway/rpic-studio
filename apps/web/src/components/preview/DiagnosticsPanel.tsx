import { AlertTriangle, Terminal } from "lucide-react";

interface DiagnosticsPanelProps {
  error: string | null;
  prints: string[];
}

/** Barra de diagnósticos sob o editor: erro de compilação ou saída de `print`. */
export function DiagnosticsPanel({ error, prints }: DiagnosticsPanelProps) {
  if (!error && prints.length === 0) return null;
  return (
    <div
      data-testid="diagnostics-panel"
      className="max-h-32 shrink-0 overflow-auto border-t border-(--color-ink-border) bg-(--color-ink-raised) px-4 py-2.5 font-mono text-xs"
    >
      {error ? (
        <p className="flex items-start gap-2 text-[#e8a598]" data-testid="compile-error">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
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
