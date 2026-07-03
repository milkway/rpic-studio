import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { FolderOpen, LogIn, LogOut } from "lucide-react";
import { useAuthConfig, useMe, useLogout } from "@/lib/queries";
import { loginUrl } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from "@/components/ui/DropdownMenu";

/** Entrar com Google / menu do usuário logado (meus diagramas, sair). */
export function UserMenu() {
  const { data: me, isLoading } = useMe();
  const { data: authConfig } = useAuthConfig();
  const logout = useLogout();
  const location = useLocation();

  if (isLoading) return null;

  if (!me) {
    // Sem login configurado (ou API fora do ar), o app é anônimo — sem botão.
    if (!authConfig?.google_login) return null;
    return (
      <Button
        variant="outline"
        size="sm"
        data-testid="login-button"
        onClick={() => {
          window.location.href = loginUrl(location.pathname);
        }}
      >
        <LogIn size={14} />
        Entrar
      </Button>
    );
  }

  const initial = (me.name || me.email).charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          data-testid="user-menu"
          className="flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-(--color-border-strong) bg-(--color-surface-muted) text-sm font-semibold text-(--color-text) transition-shadow hover:shadow-(--shadow-sm)"
          aria-label={`Conta: ${me.email}`}
        >
          {me.picture_url ? (
            <img src={me.picture_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{me.email}</DropdownLabel>
        <DropdownItem asChild>
          <Link to="/diagramas">
            <FolderOpen size={15} /> Meus diagramas
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem onSelect={() => logout.mutate()}>
          <LogOut size={15} /> Sair
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
