import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@rpic/design-system";

type Variant = "primary" | "outline" | "ghost" | "ink-ghost";
type Size = "sm" | "md" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary:
    "bg-(--color-accent) text-(--color-accent-contrast) hover:bg-(--color-accent-strong) shadow-(--shadow-sm)",
  outline:
    "border border-(--color-border-strong) bg-(--color-surface) text-(--color-text) hover:border-(--color-text-muted)",
  ghost: "text-(--color-text-body) hover:bg-(--color-surface-muted) hover:text-(--color-text)",
  "ink-ghost":
    "text-(--color-ink-muted) hover:bg-(--color-ink-raised) hover:text-(--color-ink-text)",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  icon: "h-9 w-9",
  "icon-sm": "h-7 w-7",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "ghost", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-(--radius-sm) font-medium",
        "transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
