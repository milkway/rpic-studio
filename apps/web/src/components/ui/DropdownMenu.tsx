import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@rpic/design-system";
import type { ComponentPropsWithoutRef } from "react";

export const DropdownMenu = Dropdown.Root;
export const DropdownTrigger = Dropdown.Trigger;

export function DropdownContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        sideOffset={6}
        align="end"
        className={cn(
          "z-50 min-w-52 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface)",
          "p-1.5 shadow-(--shadow-pop)",
          className,
        )}
        {...props}
      >
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

export function DropdownItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Dropdown.Item>) {
  return (
    <Dropdown.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-(--radius-sm) px-2.5 py-2 text-sm",
        "text-(--color-text-body) outline-none select-none",
        "data-highlighted:bg-(--color-surface-muted) data-highlighted:text-(--color-text)",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownSeparator() {
  return <Dropdown.Separator className="my-1.5 h-px bg-(--color-border)" />;
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <Dropdown.Label className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] tracking-widest text-(--color-text-muted) uppercase">
      {children}
    </Dropdown.Label>
  );
}
