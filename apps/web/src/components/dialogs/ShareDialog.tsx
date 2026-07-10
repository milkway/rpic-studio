import { useMemo, useState } from "react";
import { Check, Copy, Link2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { buildShareUrl } from "@/lib/share";
import { copyText } from "@/lib/exports";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n";
import { useAuthConfig, useMe, useShareDiagram, useUnshareDiagram } from "@/lib/queries";

interface ShareDialogProps {
  source: string;
  circuits: boolean;
  /** Presentes quando o diagrama está salvo na conta (habilita link curto). */
  diagramId?: string;
  shareSlug?: string | null;
}

function CopyRow({ value, testid }: { value: string; testid: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        data-testid={testid}
        className="h-9 min-w-0 flex-1 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-surface-muted) px-3 font-mono text-xs text-(--color-text-body) outline-none focus:border-(--color-accent)"
      />
      <Button
        variant="primary"
        size="md"
        data-testid={`${testid}-copy`}
        onClick={async () => {
          await copyText(value);
          setCopied(true);
          toast(t("share.linkCopied"));
          window.setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? t("share.copied") : t("share.copy")}
      </Button>
    </div>
  );
}

/** Compartilhar: link com o código embutido e, para diagramas salvos, link curto. */
export function ShareDialog({ source, circuits, diagramId, shareSlug }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const { data: authConfig } = useAuthConfig();
  const share = useShareDiagram();
  const unshare = useUnshareDiagram();
  const toast = useToast();
  const { t } = useI18n();

  // Só monta a URL com o dialog aberto (evita recomprimir a cada tecla).
  const url = useMemo(
    () => (open ? buildShareUrl({ source, circuits }) : ""),
    [open, source, circuits],
  );
  const tooLong = url.length > 10_000;

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const shortUrl = shareSlug ? `${window.location.origin}${base}/d/${shareSlug}` : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" data-testid="share-button">
          <Link2 size={14} />
          <span className="max-sm:hidden">{t("share.button")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent title={t("share.title")} description={t("share.desc")}>
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 font-mono text-[11px] tracking-widest text-(--color-text-muted) uppercase">
              {t("share.embedHeader")}
            </h3>
            <CopyRow value={url} testid="share-url" />
            <p className="mt-2 text-xs text-(--color-text-muted)">
              {tooLong ? t("share.tooLong") : t("share.embedNote")}
            </p>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-(--color-text-muted) uppercase">
              <Sparkles size={12} className="text-(--color-accent)" />
              {t("share.shortHeader")}
            </h3>
            {shortUrl ? (
              <>
                <CopyRow value={shortUrl} testid="short-url" />
                <button
                  className="mt-2 cursor-pointer text-xs text-(--color-danger) underline underline-offset-2"
                  onClick={() =>
                    diagramId &&
                    unshare.mutate(diagramId, {
                      onSuccess: () => toast(t("share.revoked")),
                    })
                  }
                >
                  {t("share.revoke")}
                </button>
              </>
            ) : diagramId ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="create-short-link"
                disabled={share.isPending}
                onClick={() =>
                  share.mutate(diagramId, {
                    onError: () => toast(t("share.genError"), "error"),
                  })
                }
              >
                {t("share.generate")}
              </Button>
            ) : (
              <p className="text-xs text-(--color-text-muted)">
                {me
                  ? t("share.saveFirst")
                  : authConfig?.google_login
                    ? t("share.signInFirst")
                    : t("share.comingWithLogin")}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
