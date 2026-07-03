import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Copy } from "lucide-react";
import { cn } from "@rpic/design-system";
import type { Anim } from "@/lib/rpic";
import { toMarkdownSnippet, copyText } from "@/lib/exports";
import { PreviewPane } from "./PreviewPane";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type TabValue = "imagem" | "svg" | "markdown";

interface PreviewTabsProps {
  svg: string;
  animations: Anim[];
  version: number;
  error: string | null;
  loading: boolean;
  compileMs: number | null;
}

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

/** Painel direito: imagem ao vivo, código SVG ou snippet Markdown. */
export function PreviewTabs(props: PreviewTabsProps) {
  const [tab, setTab] = useState<TabValue>("imagem");
  const toast = useToast();

  const tabsList = (
    <Tabs.List className="flex items-center gap-1">
      <TabButton value="imagem">Imagem</TabButton>
      <TabButton value="svg">SVG</TabButton>
      <TabButton value="markdown">Markdown</TabButton>
    </Tabs.List>
  );

  const codeContent = tab === "svg" ? props.svg : toMarkdownSnippet(props.svg);

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
                    toast("Copiado para a área de transferência");
                  }}
                >
                  <Copy size={13} />
                  Copiar
                </Button>
              </div>
            </div>
            <pre
              data-testid={`code-view-${tab}`}
              className="min-h-0 flex-1 overflow-auto bg-(--color-surface) p-4 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-(--color-text-body)"
            >
              {codeContent}
            </pre>
          </div>
        )}
      </div>
    </Tabs.Root>
  );
}
