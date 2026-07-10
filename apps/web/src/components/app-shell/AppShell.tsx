import type { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, Moon, Sun } from "lucide-react";
import { asset, cn } from "@rpic/design-system";
import { useI18n, type Locale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useMe } from "@/lib/queries";
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

/** Casca do app: topbar fina + conteúdo em altura total. Em telas ESTREITAS
 *  (<md) a nav colapsa num menu hambúrguer e a marca perde o "studio" — senão a
 *  linha (marca + 4 links + ações + idioma/tema/login) estoura e os controles da
 *  direita somem clipados. */
export function AppShell({ actions, children }: AppShellProps) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  // "Editor" cobre o rascunho (/) e diagramas salvos (/e/:id)
  const editorActive = pathname === "/" || pathname.startsWith("/e/");
  const links = [
    { to: "/", label: t("nav.editor"), active: editorActive },
    { to: "/exemplos", label: t("nav.examples") },
    { to: "/bindings", label: t("nav.bindings") },
    { to: "/ajuda", label: t("nav.help") },
    ...(me?.is_admin ? [{ to: "/usuarios", label: t("nav.users") }] : []),
  ];
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-13 shrink-0 items-center gap-2.5 border-b border-(--color-border) bg-(--color-surface) px-3 md:gap-5 md:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label={t("nav.home")}>
          {/* Logo oficial do rpic — um "r" desenhado no próprio rpic (blueprint). */}
          <img src={asset("brand/logo.svg")} alt="" width="27" height="27" />
          <span className="text-[17px] leading-none">
            <span className="brand-r">R</span>
            <span className="brand-pic">PIC</span>
            <span className="font-display ml-1.5 font-medium text-(--color-text-muted) max-sm:hidden">
              studio
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 max-md:hidden">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={l.active !== undefined ? () => navLinkClass({ isActive: l.active! }) : navLinkClass}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <DropdownMenu>
          <DropdownTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("nav.home")}
              data-testid="nav-menu"
              className="md:hidden"
            >
              <Menu size={16} />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="start" className="min-w-40">
            {links.map((l) => (
              <DropdownItem
                key={l.to}
                onSelect={() => navigate(l.to)}
                className={cn((l.active ?? pathname === l.to) && "bg-(--color-surface-muted) text-(--color-text)")}
              >
                {l.label}
              </DropdownItem>
            ))}
          </DropdownContent>
        </DropdownMenu>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {actions}
          <div className="ml-1.5 flex shrink-0 items-center gap-1 border-l border-(--color-border) pl-3 max-sm:ml-0 max-sm:pl-2">
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
      <AppFooter />
    </div>
  );
}

/** Barra de status fina no rodapé: versão do studio + do motor rpic. */
function AppFooter() {
  const { t } = useI18n();
  return (
    <footer className="flex h-6 shrink-0 items-center justify-end gap-2 border-t border-(--color-border) bg-(--color-surface) px-4 text-[11px] leading-none text-(--color-text-muted)">
      <span className="tabular-nums">
        <span className="font-medium">rpic studio</span> v{__APP_VERSION__}
        <span className="mx-1.5 text-(--color-border)">·</span>
        {t("footer.engine")} rpic v{__RPIC_VERSION__}
      </span>
      <span className="text-(--color-border)">·</span>
      <a
        href={`https://github.com/milkway/rpic-lang/releases/tag/v${__RPIC_VERSION__}`}
        target="_blank"
        rel="noreferrer"
        className="transition-colors hover:text-(--color-text)"
      >
        {t("footer.changelog")}
      </a>
    </footer>
  );
}
