import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Link2, PencilLine } from "lucide-react";
import { cn, motion } from "@rpic/design-system";
import { AppShell } from "@/components/app-shell/AppShell";
import { RpicThumb } from "@/components/preview/RpicThumb";
import { ReadOnlyCode } from "@/components/preview/ReadOnlyCode";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { examples, TAG_META, type Example, type ExampleTag } from "@/lib/examples";
import { copyText } from "@/lib/exports";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { encodeShareHash } from "@/lib/share";
import { saveDraft } from "@/lib/storage";

function TagBadge({ tag, active, onClick }: { tag: ExampleTag; active?: boolean; onClick?: () => void }) {
  const { locale } = useI18n();
  const meta = TAG_META[tag];
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        onClick && "cursor-pointer transition-colors",
        active
          ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)"
          : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-body)",
        onClick && !active && "hover:border-(--color-border-strong)",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label[locale]}
    </Comp>
  );
}

function ExampleCard({ example }: { example: Example }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, locale } = useI18n();
  const { dark } = useTheme();

  const open = () => {
    saveDraft(example.source, example.circuits);
    navigate("/");
  };

  const copyCode = async () => {
    await copyText(example.source);
    toast(t("examplesPage.codeCopied"));
  };

  const copyLink = async () => {
    const { origin, pathname } = window.location;
    const base = pathname.replace(/exemplos\/?$/, "");
    await copyText(
      `${origin}${base}${encodeShareHash({ source: example.source, circuits: example.circuits })}`,
    );
    toast(t("share.linkCopied"));
  };

  return (
    <article
      data-card
      data-testid={`example-${example.id}`}
      className="overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) shadow-(--shadow-sm)"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-(--color-border) px-5 py-3.5">
        <h3 className="font-display mr-1 font-semibold text-(--color-text)">
          {example.title[locale]}
        </h3>
        {example.tags.map((tag) => (
          <TagBadge key={tag} tag={tag} />
        ))}
      </header>

      <div className="grid md:grid-cols-2">
        <div className="paper-grid flex max-h-80 min-h-52 items-center justify-center overflow-auto border-b border-(--color-border) p-6 md:border-r md:border-b-0">
          <RpicThumb
            source={example.source}
            circuits={example.circuits}
            className="flex items-center justify-center [&_svg]:h-auto [&_svg]:max-h-64 [&_svg]:w-auto [&_svg]:max-w-full"
          />
        </div>
        <div className="max-h-80 min-h-52 overflow-hidden bg-(--color-ink) [&_.cm-editor]:h-full">
          <ReadOnlyCode content={example.source} language="rpic" dark={dark} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 px-5 py-3">
        <p className="mr-auto min-w-40 flex-1 text-sm text-(--color-text-body)">
          {example.description[locale]}
        </p>
        <Button variant="ghost" size="sm" onClick={copyCode} data-testid={`example-copy-${example.id}`}>
          <Copy size={13} /> {t("examplesPage.copyCode")}
        </Button>
        <Button variant="ghost" size="sm" onClick={copyLink}>
          <Link2 size={13} /> {t("examplesPage.copyLink")}
        </Button>
        <Button variant="primary" size="sm" onClick={open} data-testid={`example-open-${example.id}`}>
          <PencilLine size={13} /> {t("examplesPage.open")}
        </Button>
      </footer>
    </article>
  );
}

/** Galeria: diagrama renderizado + código lado a lado, com badges e filtro. */
export function ExamplesPage() {
  const gridRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [filter, setFilter] = useState<ExampleTag | null>(null);

  const allTags = useMemo(() => {
    const seen = new Set<ExampleTag>();
    for (const ex of examples) for (const tag of ex.tags) seen.add(tag);
    return [...seen];
  }, []);

  const visible = useMemo(
    () => (filter ? examples.filter((ex) => ex.tags.includes(filter)) : examples),
    [filter],
  );

  useEffect(() => {
    const cards = gridRef.current?.querySelectorAll("[data-card]");
    if (cards?.length) motion.fadeUp(cards, { stagger: 0.04 });
  }, [filter]);

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-(--color-text)">
            {t("examplesPage.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-(--color-text-body)">{t("examplesPage.subtitle")}</p>

          <div className="mt-6 flex flex-wrap items-center gap-2" data-testid="tag-filter">
            <button
              onClick={() => setFilter(null)}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                filter === null
                  ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)"
                  : "border-(--color-border) bg-(--color-surface-muted) text-(--color-text-body) hover:border-(--color-border-strong)",
              )}
            >
              {t("examplesPage.all")}
            </button>
            {allTags.map((tag) => (
              <TagBadge
                key={tag}
                tag={tag}
                active={filter === tag}
                onClick={() => setFilter(filter === tag ? null : tag)}
              />
            ))}
          </div>

          <div ref={gridRef} className="mt-6 space-y-6">
            {visible.map((ex) => (
              <ExampleCard key={ex.id} example={ex} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
