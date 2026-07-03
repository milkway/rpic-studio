import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Copy } from "lucide-react";
import { cn } from "@rpic/design-system";
import type { Anim } from "@/lib/rpic";
import { copyText, formatXml, toMarkdownSnippet } from "@/lib/exports";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { PreviewPane } from "./PreviewPane";
import { ReadOnlyCode } from "./ReadOnlyCode";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type TabValue = "imagem" | "svg" | "markdown";

interface PreviewTabsProps {
  svg: string;
  /** Código pic atual — vai no bloco ```pic da aba Markdown. */
  source: string;
  animations: Anim[];
  version: number;
  error: string | null;
  loading: boolean;
  compileMs: number | null;
}

const MD_LABELS = {
  en: {
    image: "Option 1 — embedded image (paste into any Markdown)",
    sourceBlock: "Option 2 — rpic source (for pipelines that render .pic)",
    title: "diagram",
  },
  pt: {
    image: "Opção 1 — imagem embutida (cole em qualquer Markdown)",
    sourceBlock: "Opção 2 — código rpic (para pipelines que renderizam .pic)",
    title: "diagrama",
  },
};

function TabButton({ value, children }: { value: TabValue; children: string }) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "cursor-pointer rounded-(--radius-sm) px-2.5 py-1 font-mono text-[11px] tracking-wide uppercase",
        "text-(--color-text-muted) transition-colors hover:text-(--color-text)",
        "data-[state=active]:bg-(--color-surface-muted) data-[state=active]:text-(--color-text)",
      )}
    >
      {children}
    </Tabs.Trigger>
  );
}

/** Painel direito: imagem ao vivo, código SVG formatado ou Markdown pronto. */
export function PreviewTabs({ source, ...props }: PreviewTabsProps) {
  const [tab, setTab] = useState<TabValue>("imagem");
  const toast = useToast();
  const { t, locale } = useI18n();
  const { dark } = useTheme();

  const tabsList = (
    <Tabs.List className="flex items-center gap-1">
      <TabButton value="imagem">{t("preview.tabImage")}</TabButton>
      <TabButton value="svg">SVG</TabButton>
      <TabButton value="markdown">Markdown</TabButton>
    </Tabs.List>
  );

  // Formata só quando a aba está aberta (o SVG muda a cada compilação).
  const codeContent = useMemo(() => {
    if (tab === "svg") return formatXml(props.svg);
    if (tab === "markdown") return toMarkdownSnippet(props.svg, source, MD_LABELS[locale]);
    return "";
  }, [tab, props.svg, source, locale]);

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(v) => setTab(v as TabValue)}
      className="h-full min-h-0"
      asChild
    >
      <div>
        {tab === "imagem" ? (
          <PreviewPane {...props} tabs={tabsList} />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-(--color-border) bg-(--color-surface) px-3">
              {tabsList}
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await copyText(codeContent);
                    toast(t("preview.copiedToClipboard"));
                  }}
                >
                  <Copy size={13} />
                  {t("preview.copy")}
                </Button>
              </div>
            </div>
            <ReadOnlyCode
              content={codeContent}
              language={tab === "svg" ? "xml" : "markdown"}
              dark={dark}
              testid={`code-view-${tab}`}
            />
          </div>
        )}
      </div>
    </Tabs.Root>
  );
}
