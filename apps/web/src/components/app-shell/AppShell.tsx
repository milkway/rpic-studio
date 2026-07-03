import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { cn } from "@rpic/design-system";

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="3"
        y="10.5"
        width="11"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <line x1="14" y1="16" x2="23" y2="16" stroke="#d1461f" strokeWidth="2" />
      <path d="M28.5 16l-5.8-2.8v5.6z" fill="#d1461f" />
    </svg>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-(--radius-sm) px-2.5 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-(--color-surface-muted) text-(--color-text)"
      : "text-(--color-text-body) hover:text-(--color-text)",
  );

interface AppShellProps {
  /** Ações do lado direito da topbar (share, exports, login…). */
  actions?: ReactNode;
  children: ReactNode;
}

/** Casca do app: topbar fina de papel + conteúdo em altura total. */
export function AppShell({ actions, children }: AppShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-13 shrink-0 items-center gap-5 border-b border-(--color-border) bg-(--color-surface) px-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-(--color-text)"
          aria-label="rpic studio — início"
        >
          <BrandMark />
          <span className="font-display text-[17px] leading-none font-semibold tracking-tight">
            rpic&thinsp;
            <span className="text-(--color-accent)">studio</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/exemplos" className={navLinkClass}>
            Exemplos
          </NavLink>
          <NavLink to="/ajuda" className={navLinkClass}>
            Ajuda
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">{actions}</div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
