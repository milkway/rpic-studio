import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilePlus2, Link2, Lock, LogIn, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell/AppShell";
import { RpicThumb } from "@/components/preview/RpicThumb";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
} from "@/components/ui/DropdownMenu";
import { Dialog, DialogContent, DialogClose, DialogFooter } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { loginUrl } from "@/lib/api";
import { formatDate, useI18n } from "@/lib/i18n";
import {
  useAuthConfig,
  useDeleteDiagram,
  useDiagrams,
  useMe,
  useShareDiagram,
  useUnshareDiagram,
  useUpdateDiagram,
} from "@/lib/queries";
import type { DiagramSummary } from "@/lib/types";
import { detectCircuits } from "@/lib/detect";
import { copyText } from "@/lib/exports";

function DiagramCard({ diagram }: { diagram: DiagramSummary }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, locale } = useI18n();
  const del = useDeleteDiagram();
  const share = useShareDiagram();
  const unshare = useUnshareDiagram();
  const update = useUpdateDiagram();
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTitle, setNewTitle] = useState(diagram.title);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const isPublic = !!diagram.share_slug;

  const rename = () => {
    // O source vem na listagem — não precisa de outra requisição.
    update.mutate(
      {
        id: diagram.id,
        title: newTitle.trim() || diagram.title,
        source: diagram.source,
        circuits: diagram.circuits,
      },
      { onSuccess: () => setRenameOpen(false), onError: () => toast(t("diagrams.renameError"), "error") },
    );
  };

  return (
    <article
      data-testid="diagram-card"
      className="group flex flex-col overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) shadow-(--shadow-sm) transition-all duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-card)"
    >
      <button
        onClick={() => navigate(`/e/${diagram.id}`)}
        className="paper-grid flex h-40 cursor-pointer items-center justify-center overflow-hidden border-b border-(--color-border) p-4"
        aria-label={t("diagrams.open")}
      >
        <RpicThumb
          source={diagram.source}
          circuits={detectCircuits(diagram.source)}
          className="flex items-center justify-center [&_svg]:h-auto [&_svg]:max-h-32 [&_svg]:w-auto [&_svg]:max-w-full"
        />
      </button>

      <div className="flex items-start gap-2 p-3.5">
        <Link to={`/e/${diagram.id}`} className="min-w-0 flex-1">
          <p className="truncate font-medium text-(--color-text)">{diagram.title}</p>
          <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-(--color-text-muted)">
            {formatDate(diagram.updated_at, locale)}
          </p>
        </Link>

        {/* Selo de privacidade — clicável quando público (copia o link). */}
        {isPublic ? (
          <button
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-(--color-accent-soft) px-2 py-0.5 text-[10px] font-medium text-(--color-accent)"
            title={t("diagrams.copyPublic")}
            data-testid="badge-public"
            onClick={async () => {
              await copyText(`${window.location.origin}${base}/d/${diagram.share_slug}`);
              toast(t("diagrams.publicCopied"));
            }}
          >
            <Link2 size={10} /> {t("diagrams.public")}
          </button>
        ) : (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-(--color-surface-muted) px-2 py-0.5 text-[10px] font-medium text-(--color-text-muted)"
            data-testid="badge-private"
          >
            <Lock size={10} /> {t("diagrams.private")}
          </span>
        )}

        <DropdownMenu>
          <DropdownTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("diagrams.actionsFor", { title: diagram.title })}
            >
              <MoreHorizontal size={16} />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => navigate(`/e/${diagram.id}`)}>
              <Pencil size={15} /> {t("diagrams.open")}
            </DropdownItem>
            <DropdownItem onSelect={() => setRenameOpen(true)}>
              <Pencil size={15} /> {t("diagrams.rename")}
            </DropdownItem>
            {isPublic ? (
              <DropdownItem
                onSelect={() =>
                  unshare.mutate(diagram.id, { onSuccess: () => toast(t("diagrams.revoked")) })
                }
              >
                <Lock size={15} /> {t("diagrams.revokeLink")}
              </DropdownItem>
            ) : (
              <DropdownItem
                onSelect={() =>
                  share.mutate(diagram.id, { onSuccess: () => toast(t("diagrams.created")) })
                }
              >
                <Link2 size={15} /> {t("diagrams.makePublic")}
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem
              className="text-(--color-danger) data-highlighted:text-(--color-danger)"
              onSelect={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} /> {t("diagrams.delete")}
            </DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent title={t("diagrams.renameTitle")}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && rename()}
            className="h-10 w-full rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-surface) px-3 text-sm outline-none focus:border-(--color-accent)"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("save.cancel")}</Button>
            </DialogClose>
            <Button variant="primary" onClick={rename} disabled={update.isPending}>
              {t("diagrams.rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={t("diagrams.deleteTitle")}
          description={t("diagrams.deleteDesc", { title: diagram.title })}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("save.cancel")}</Button>
            </DialogClose>
            <Button
              variant="primary"
              className="bg-(--color-danger) hover:bg-(--color-danger)"
              onClick={() =>
                del.mutate(diagram.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    toast(t("diagrams.deleted"));
                  },
                })
              }
              disabled={del.isPending}
            >
              {t("diagrams.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

/** Galeria dos diagramas salvos do usuário (privados por padrão). */
export function DiagramsPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: authConfig } = useAuthConfig();
  const diagrams = useDiagrams(!!me);
  const { t } = useI18n();

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-(--color-text)">
                {t("diagrams.title")}
              </h1>
              <p className="mt-2 max-w-xl text-(--color-text-body)">{t("diagrams.subtitle")}</p>
            </div>
            <Link to="/">
              <Button variant="primary" size="md">
                <FilePlus2 size={15} /> {t("diagrams.new")}
              </Button>
            </Link>
          </div>

          {me && diagrams.data?.length ? (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-(--color-text-muted)">
              <Lock size={12} /> {t("diagrams.privacyNote")}
            </p>
          ) : null}

          <div className="mt-8">
            {meLoading ? null : !me ? (
              <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-10 text-center">
                {authConfig?.google_login ? (
                  <>
                    <p className="text-(--color-text-body)">{t("diagrams.signInCta")}</p>
                    <Button
                      variant="primary"
                      className="mt-4"
                      onClick={() => {
                        window.location.href = loginUrl("/diagramas");
                      }}
                    >
                      <LogIn size={15} /> {t("diagrams.signInButton")}
                    </Button>
                  </>
                ) : (
                  <p className="text-(--color-text-body)">{t("diagrams.loginUnavailable")}</p>
                )}
              </div>
            ) : diagrams.isLoading ? (
              <p className="p-6 text-sm text-(--color-text-muted)">{t("diagrams.loading")}</p>
            ) : diagrams.data?.length ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {diagrams.data.map((d) => (
                  <DiagramCard key={d.id} diagram={d} />
                ))}
              </div>
            ) : (
              <div className="rounded-(--radius-lg) border border-dashed border-(--color-border-strong) p-10 text-center text-(--color-text-body)">
                {t("diagrams.empty")}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
