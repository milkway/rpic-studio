import { Braces } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useI18n } from "@/lib/i18n";
import { applyCss, readCss } from "@/lib/customCss";

/** Painel de CSS custom por diagrama: o `class "…"` do rpic vira estilo real.
 *  O CSS é guardado NO PRÓPRIO pic (bloco de comentário) — o studio injeta um
 *  `<style>` no SVG (preview + exports). Fonte da verdade = código. */
export function CssPanel({
  source,
  onSourceChange,
}: {
  source: string;
  onSourceChange: (s: string) => void;
}) {
  const { t } = useI18n();
  const css = readCss(source);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ink-ghost" size="sm" data-testid="css-panel-trigger" className={css ? "text-(--color-accent)" : undefined}>
          <Braces size={13} />
          CSS
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" data-testid="css-panel">
        <p className="mb-1 font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
          {t("css.title")}
        </p>
        <p className="mb-2 text-[11px] leading-tight text-(--color-text-muted)">{t("css.hint")}</p>
        <textarea
          value={css}
          onChange={(e) => onSourceChange(applyCss(source, e.target.value))}
          spellCheck={false}
          rows={7}
          placeholder={".critical { stroke: #d33; stroke-width: 2 }\n.storage text { font-weight: 700 }"}
          data-testid="css-textarea"
          className="w-full resize-y rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-2 py-1.5 font-mono text-xs text-(--color-text) outline-none focus:border-(--color-accent)"
        />
      </PopoverContent>
    </Popover>
  );
}
