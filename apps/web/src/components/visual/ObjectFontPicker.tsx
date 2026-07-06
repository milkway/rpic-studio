import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@rpic/design-system";
import { useI18n } from "@/lib/i18n";
import { ensureGoogleFont, GOOGLE_FONTS } from "@/lib/appearance";
import { FONT_FAMILIES } from "@/lib/palette";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

const GOOGLE_SET = new Set(GOOGLE_FONTS.map((f) => f.family));

/** Linha do resultado: carrega a Google Font ao entrar na viewport e mostra o
 *  nome NELA MESMA (fontes de sistema são instantâneas). */
function FontRow({
  family,
  selected,
  rootRef,
  onPick,
}: {
  family: string;
  selected: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  onPick: (family: string) => void;
}) {
  const isGoogle = GOOGLE_SET.has(family);
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(!isGoogle);

  useEffect(() => {
    if (!isGoogle || visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          void ensureGoogleFont(family);
          io.disconnect();
        }
      },
      { root: rootRef.current, rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [family, isGoogle, visible, rootRef]);

  return (
    <button
      ref={ref}
      onClick={() => onPick(family)}
      data-testid={`objects-font-${family}`}
      style={visible ? { fontFamily: family } : undefined}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px]",
        selected ? "bg-(--color-accent-soft) text-(--color-accent)" : "text-(--color-text-body) hover:bg-(--color-surface-muted)",
      )}
    >
      <span className="truncate">{family}</span>
      {selected && <Check size={13} className="shrink-0" />}
    </button>
  );
}

/** Seletor de fonte POR OBJETO (grava a família crua p/ `font "…"`): mostra cada
 *  nome no próprio tipo, como o do menu Defaults. Sistema + catálogo Google
 *  (busca + lazy-load). */
export function ObjectFontPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (family: string | undefined) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const system = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? FONT_FAMILIES.filter((f) => f.toLowerCase().includes(q)) : [...FONT_FAMILIES];
  }, [query]);
  const google = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? GOOGLE_FONTS.filter((f) => f.family.toLowerCase().includes(q)) : GOOGLE_FONTS).slice(0, 60);
  }, [query]);

  const pick = (family: string | undefined) => {
    if (family && GOOGLE_SET.has(family)) void ensureGoogleFont(family);
    onChange(family);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="objects-font"
          style={{ fontFamily: value || undefined }}
          className="flex w-full items-center justify-between gap-2 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-2 py-1.5 text-left text-xs text-(--color-text)"
        >
          <span className="truncate">{value || t("visual.inspector.fontDefault")}</span>
          <ChevronDown size={13} className="shrink-0 text-(--color-text-muted)" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" data-testid="objects-font-menu">
        <div className="flex items-center gap-1.5 border-b border-(--color-border) px-2">
          <Search size={13} className="text-(--color-text-muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("canvas.searchFonts")}
            data-testid="objects-font-search"
            className="h-8 min-w-0 flex-1 bg-transparent text-xs text-(--color-text) outline-none"
          />
        </div>
        <div ref={resultsRef} className="max-h-56 overflow-auto py-1">
          {!query && (
            <button
              onClick={() => pick(undefined)}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-left text-[13px]",
                !value ? "bg-(--color-accent-soft) text-(--color-accent)" : "text-(--color-text-muted) hover:bg-(--color-surface-muted)",
              )}
            >
              {t("visual.inspector.fontDefault")}
              {!value && <Check size={13} />}
            </button>
          )}
          {system.map((f) => (
            <FontRow key={f} family={f} selected={value === f} rootRef={resultsRef} onPick={pick} />
          ))}
          {google.map((f) => (
            <FontRow key={f.family} family={f.family} selected={value === f.family} rootRef={resultsRef} onPick={pick} />
          ))}
          {system.length === 0 && google.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-(--color-text-muted)">—</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
