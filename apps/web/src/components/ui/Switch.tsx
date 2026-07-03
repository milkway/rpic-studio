import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@rpic/design-system";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  /** Variante para fundo escuro (painel do editor). */
  ink?: boolean;
  /** Travado (ex.: ligado automaticamente por detecção no código). */
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onCheckedChange, label, ink, disabled, id }: SwitchProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-xs font-medium select-none",
        ink ? "text-(--color-ink-muted)" : "text-(--color-text-body)",
        disabled && "cursor-default",
      )}
      htmlFor={id}
    >
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative h-4.5 w-8 shrink-0 cursor-pointer rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)",
          checked
            ? "bg-(--color-accent)"
            : ink
              ? "bg-(--color-ink-border)"
              : "bg-(--color-border-strong)",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform",
            "data-[state=checked]:translate-x-4",
          )}
        />
      </SwitchPrimitive.Root>
      {label}
    </label>
  );
}
