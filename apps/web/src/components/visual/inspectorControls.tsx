import { type ReactNode } from "react";
import { cn } from "@rpic/design-system";

/** Botões segmentados (uma escolha entre opções) — usado nos inspetores. */
export function Seg<T>({
  title,
  value,
  options,
  onPick,
}: {
  title: string;
  value: T;
  options: { v: T; el: ReactNode; testid?: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">{title}</span>
      <div className="flex gap-1">
        {options.map((o, i) => (
          <button
            key={i}
            onClick={() => onPick(o.v)}
            data-testid={o.testid}
            className={cn(
              "flex h-7 flex-1 items-center justify-center rounded-(--radius-sm) border text-sm leading-none",
              value === o.v
                ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)"
                : "border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {o.el}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Paleta de cores + "nenhuma" + color picker livre (emite `#rrggbb`). */
export function Swatches({
  title,
  colors,
  value,
  onPick,
  noneLabel,
}: {
  title: string;
  colors: readonly string[];
  value?: string;
  onPick: (c: string | undefined) => void;
  noneLabel: string;
}) {
  return (
    <div className="mb-3">
      <span className="mb-1 block font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">{title}</span>
      {/* Grid de 6 colunas: "nenhuma" + 10 cores + picker = 12 → duas linhas
          CHEIAS (sem buraco), com o color picker SEMPRE por último. */}
      <div className="grid grid-cols-6 place-items-center gap-1.5">
        <button
          onClick={() => onPick(undefined)}
          title={noneLabel}
          className={cn("size-6 rounded-full border border-(--color-border) text-[9px] leading-none text-(--color-text-muted)", !value && "ring-2 ring-(--color-accent)")}
        >
          ⌀
        </button>
        {colors.map((c) => (
          <button key={c} onClick={() => onPick(c)} title={c} style={{ background: c }} className={cn("size-6 rounded-full border border-(--color-border)", value === c && "ring-2 ring-(--color-accent)")} />
        ))}
        {/* cor livre (rgb/hex — v0.7.0): emite `shaded "#rrggbb"`. SEMPRE por último. */}
        <label
          title="Cor livre"
          className={cn(
            "relative size-6 cursor-pointer overflow-hidden rounded-full border border-(--color-border)",
            value?.startsWith("#") && "ring-2 ring-(--color-accent)",
          )}
          style={{ background: value?.startsWith("#") ? value : "conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)" }}
        >
          <input
            type="color"
            value={value?.startsWith("#") ? value : "#1b5e20"}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
