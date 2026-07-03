import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { asset, cn } from "@rpic/design-system";
import { UserMenu } from "./UserMenu";

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
          className="flex items-center gap-2.5 text-(--color-text)"
          aria-label="rpic studio — início"
        >
          {/* Logo oficial do rpic — um "r" desenhado no próprio rpic (blueprint). */}
          <img src={asset("brand/logo.svg")} alt="" width="27" height="27" />
          <span className="text-[17px] leading-none">
            <span className="brand-r text-[#022c22]">R</span>
            <span className="brand-pic text-[#0f766e]">PIC</span>
            <span className="font-display ml-1.5 font-medium text-(--color-text-muted)">
              studio
            </span>
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
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <div className="ml-1.5 border-l border-(--color-border) pl-3">
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
