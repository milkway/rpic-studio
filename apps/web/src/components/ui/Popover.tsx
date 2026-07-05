import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@rpic/design-system";
import type { ComponentPropsWithoutRef } from "react";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={6}
        align="start"
        className={cn(
          "z-50 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface)",
          "p-3 shadow-(--shadow-pop)",
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
