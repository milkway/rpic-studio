import { Braces } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { applyCss, readCss } from "@/lib/customCss";
import { CssEditor } from "./CssEditor";

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
  const { dark } = useTheme();
  const css = readCss(source);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ink-ghost" size="sm" data-testid="css-panel-trigger" className={css ? "text-(--color-accent)" : undefined}>
          <Braces size={13} />
          CSS
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[28rem] max-w-[calc(100vw-2rem)]" data-testid="css-panel">
        <p className="mb-1 font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
          {t("css.title")}
        </p>
        <p className="mb-2 text-[11px] leading-tight text-(--color-text-muted)">{t("css.hint")}</p>
        <CssEditor value={css} onChange={(v) => onSourceChange(applyCss(source, v))} dark={dark} />
      </PopoverContent>
    </Popover>
  );
}
