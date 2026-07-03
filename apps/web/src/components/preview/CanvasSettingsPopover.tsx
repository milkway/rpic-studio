import * as Popover from "@radix-ui/react-popover";
import { Grid2x2, RotateCcw } from "lucide-react";
import { cn } from "@rpic/design-system";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { DEFAULT_CANVAS, type CanvasSettings } from "@/lib/storage";
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
