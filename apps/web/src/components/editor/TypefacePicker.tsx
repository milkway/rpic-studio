import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@rpic/design-system";
import { useI18n } from "@/lib/i18n";
import {
  BUILTIN_FONTS,
  ensureGoogleFont,
  GOOGLE_FONTS,
  googleFamilyOf,
  googleValue,
  resolveFontStack,
} from "@/lib/appearance";

/** Linha do resultado: carrega a fonte ao entrar na viewport e exibe o nome
 *  NELA MESMA, para identificação visual imediata. */
function FontRow({
  family,
  selected,
  rootRef,
  onPick,
}: {
  family: string;
  selected: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onPick: (family: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          ensureGoogleFont(family);
          io.disconnect();
        }
      },
      { root: rootRef.current, rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [family, rootRef, visible]);

  return (
    <button
      ref={ref}
      onClick={() => onPick(family)}
      data-testid={`font-google-${family}`}
      style={visible ? { fontFamily: resolveFontStack(googleValue(family)) } : undefined}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px]",
        selected
          ? "bg-(--color-accent-soft) text-(--color-accent)"
          : "text-(--color-text-body) hover:bg-(--color-surface-muted)",
      )}
    >
      {family}
      {selected && <Check size={13} />}
    </button>
  );
}

/** Seletor de fonte: chips builtin + busca no catálogo Google (sob demanda). */
export function TypefacePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (fontFamily: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const currentGoogle = googleFamilyOf(value);
  const resultsRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? GOOGLE_FONTS.filter((f) => f.family.toLowerCase().includes(q)) : GOOGLE_FONTS;
    return list.slice(0, 60);
  }, [query]);

  const pickGoogle = (family: string) => {
    ensureGoogleFont(family); // pré-carrega para o preview refletir logo
    onChange(googleValue(family));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {BUILTIN_FONTS.map((font) => (
          <button
            key={font.id}
            onClick={() => onChange(font.id)}
            data-testid={`canvas-font-${font.id || "default"}`}
            style={{ fontFamily: resolveFontStack(font.id) || undefined }}
            className={cn(
              "cursor-pointer rounded-(--radius-sm) border px-2 py-1 text-xs transition-colors",
              value === font.id
                ? "border-(--color-accent) text-(--color-accent)"
                : "border-(--color-border) text-(--color-text-body) hover:border-(--color-border-strong)",
            )}
          >
            {font.label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        <div className="flex items-center gap-1.5 rounded-(--radius-sm) border border-(--color-border) px-2">
          <Search size={13} className="text-(--color-text-muted)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("canvas.searchFonts")}
            data-testid="font-search"
            className="h-7 min-w-0 flex-1 bg-transparent text-xs text-(--color-text) outline-none"
          />
        </div>
        <div
          ref={resultsRef}
          className="mt-1 max-h-44 overflow-auto rounded-(--radius-sm) border border-(--color-border)"
          data-testid="font-results"
        >
          {results.map((f) => (
            <FontRow
              key={f.family}
              family={f.family}
              selected={currentGoogle === f.family}
              rootRef={resultsRef}
              onPick={pickGoogle}
            />
          ))}
          {results.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-(--color-text-muted)">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
