import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { asset, cn } from "@rpic/design-system";
import { useI18n, type Locale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { Tip } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/DropdownMenu";
import { UserMenu } from "./UserMenu";

const FLAGS: Record<Locale, string> = { en: "🇺🇸", pt: "🇧🇷" };

function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("locale.label")}
          data-testid="locale-switcher"
          className="text-base"
        >
          {FLAGS[locale]}
        </Button>
      </DropdownTrigger>
      <DropdownContent className="min-w-40">
        {(["en", "pt"] as const).map((l) => (
          <DropdownItem
            key={l}
            onSelect={() => setLocale(l)}
            data-testid={`locale-${l}`}
            className={cn(locale === l && "bg-(--color-surface-muted) text-(--color-text)")}
          >
            <span className="text-base">{FLAGS[l]}</span> {t(`locale.${l}`)}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label="Toggle dark mode"
      data-testid="theme-toggle"
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </Button>
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

/** Casca do app: topbar fina + conteúdo em altura total. */
export function AppShell({ actions, children }: AppShellProps) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  // "Editor" cobre o rascunho (/) e diagramas salvos (/e/:id)
  const editorActive = pathname === "/" || pathname.startsWith("/e/");
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-13 shrink-0 items-center gap-5 border-b border-(--color-border) bg-(--color-surface) px-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label={t("nav.home")}>
          {/* Logo oficial do rpic — um "r" desenhado no próprio rpic (blueprint). */}
          <img src={asset("brand/logo.svg")} alt="" width="27" height="27" />
          <span className="text-[17px] leading-none">
            <span className="brand-r">R</span>
            <span className="brand-pic">PIC</span>
            <span className="font-display ml-1.5 font-medium text-(--color-text-muted)">
              studio
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" className={() => navLinkClass({ isActive: editorActive })}>
            {t("nav.editor")}
          </NavLink>
          <NavLink to="/exemplos" className={navLinkClass}>
            {t("nav.examples")}
          </NavLink>
          <NavLink to="/bindings" className={navLinkClass}>
            {t("nav.bindings")}
          </NavLink>
          <NavLink to="/ajuda" className={navLinkClass}>
            {t("nav.help")}
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <div className="ml-1.5 flex items-center gap-1 border-l border-(--color-border) pl-3">
            <Tip label={t("locale.label")}>
              <span>
                <LocaleSwitcher />
              </span>
            </Tip>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
