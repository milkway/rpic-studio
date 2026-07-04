import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Grid2x2, RotateCcw, Search } from "lucide-react";
import { cn } from "@rpic/design-system";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { DEFAULT_CANVAS, type CanvasSettings } from "@/lib/storage";
import {
  BUILTIN_FONTS,
  ensureGoogleFont,
  GOOGLE_FONTS,
  googleFamilyOf,
  googleValue,
  resolveFontStack,
} from "@/lib/appearance";
import { Button } from "@/components/ui/Button";
import { Tip } from "@/components/ui/Tooltip";
import { canvasBackground } from "./canvasStyle";

const BG_PRESETS = ["#ffffff", "#f7faf7", "#faf4e6", "#eef2f7", "#1e2823"];
const GRID_PRESETS = ["#cbd5e1", "#a5d6a7", "#93c1d9", "#d9bb8c", "#55655a"];
const SIZES = [14, 22, 32];
const PATTERNS: CanvasSettings["pattern"][] = ["plain", "dots", "lines"];

interface CanvasSettingsPopoverProps {
  value: CanvasSettings;
  onChange: (value: CanvasSettings) => void;
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
      {children}
    </p>
  );
}

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
function TypefacePicker({
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
    const list = q
      ? GOOGLE_FONTS.filter((f) => f.family.toLowerCase().includes(q))
      : GOOGLE_FONTS;
    return list.slice(0, 60);
  }, [query]);

  const pickGoogle = (family: string) => {
    ensureGoogleFont(family); // pré-carrega para o preview refletir logo
    onChange(googleValue(family));
  };

  return (
    <div>
      <GroupLabel>{t("canvas.typeface")}</GroupLabel>
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

function ColorRow({
  presets,
  current,
  customLabel,
  onPick,
}: {
  presets: string[];
  current: string;
  customLabel: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {presets.map((color) => (
        <button
          key={color}
          onClick={() => onPick(color)}
          aria-label={color}
          className={cn(
            "h-6 w-6 cursor-pointer rounded-full border transition-transform hover:scale-110",
            current.toLowerCase() === color.toLowerCase()
              ? "border-(--color-accent) ring-2 ring-(--color-accent-soft)"
              : "border-(--color-border-strong)",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
      <label
        className="relative ml-0.5 h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-dashed border-(--color-border-strong) hover:border-(--color-accent)"
        title={customLabel}
        style={{
          background:
            "conic-gradient(#e57373, #ffd54f, #81c784, #4fc3f7, #ba68c8, #e57373)",
        }}
      >
        <input
          type="color"
          value={current}
          onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={customLabel}
        />
      </label>
    </div>
  );
}

/** Popover de aparência do papel: padrão, fundo, cor e tamanho da grade. */
export function CanvasSettingsPopover({ value, onChange }: CanvasSettingsPopoverProps) {
  const { t } = useI18n();

  return (
    <Popover.Root>
      <Tip label={t("canvas.button")}>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("canvas.button")}
            data-testid="canvas-settings"
          >
            <Grid2x2 size={14} />
          </Button>
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="end"
          className="z-50 w-64 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-4 shadow-(--shadow-pop)"
        >
          <div className="space-y-4">
            <TypefacePicker
              value={value.fontFamily}
              onChange={(fontFamily) => onChange({ ...value, fontFamily })}
            />

            <div>
              <GroupLabel>{t("canvas.pattern")}</GroupLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {PATTERNS.map((pattern) => (
                  <button
                    key={pattern}
                    onClick={() => onChange({ ...value, pattern })}
                    data-testid={`canvas-pattern-${pattern}`}
                    className={cn(
                      "cursor-pointer rounded-(--radius-sm) border px-1 pt-1 pb-1.5 text-[11px] font-medium transition-colors",
                      value.pattern === pattern
                        ? "border-(--color-accent) text-(--color-accent)"
                        : "border-(--color-border) text-(--color-text-body) hover:border-(--color-border-strong)",
                    )}
                  >
                    <span
                      className="mb-1 block h-8 rounded-[4px] border border-(--color-border)"
                      style={canvasBackground({
                        ...value,
                        pattern,
                        gridSize: 8,
                      })}
                    />
                    {t(`canvas.${pattern}` as MessageKey)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <GroupLabel>{t("canvas.bg")}</GroupLabel>
              <ColorRow
                presets={BG_PRESETS}
                current={value.bg}
                customLabel={t("canvas.custom")}
                onPick={(bg) => onChange({ ...value, bg })}
              />
            </div>

            {value.pattern !== "plain" && (
              <>
                <div>
                  <GroupLabel>{t("canvas.gridColor")}</GroupLabel>
                  <ColorRow
                    presets={GRID_PRESETS}
                    current={value.gridColor}
                    customLabel={t("canvas.custom")}
                    onPick={(gridColor) => onChange({ ...value, gridColor })}
                  />
                </div>
                <div>
                  <GroupLabel>{t("canvas.gridSize")}</GroupLabel>
                  <div className="flex gap-1.5">
                    {SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => onChange({ ...value, gridSize: size })}
                        className={cn(
                          "cursor-pointer rounded-(--radius-sm) border px-2.5 py-1 font-mono text-[11px] transition-colors",
                          value.gridSize === size
                            ? "border-(--color-accent) text-(--color-accent)"
                            : "border-(--color-border) text-(--color-text-body) hover:border-(--color-border-strong)",
                        )}
                      >
                        {size}px
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button
              onClick={() => onChange(DEFAULT_CANVAS)}
              className="flex cursor-pointer items-center gap-1.5 text-xs text-(--color-text-muted) hover:text-(--color-text)"
            >
              <RotateCcw size={11} /> {t("canvas.reset")}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
