import { useMemo, useState } from "react";
import { Check, Copy, Link2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { buildShareUrl } from "@/lib/share";
import { copyText } from "@/lib/exports";
import { useToast } from "@/components/ui/Toast";
import { useMe, useShareDiagram, useUnshareDiagram } from "@/lib/queries";

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
          toast("Link copiado");
          window.setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

/** Compartilhar: link com o código embutido e, para diagramas salvos, link curto. */
export function ShareDialog({ source, circuits, diagramId, shareSlug }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const share = useShareDiagram();
  const unshare = useUnshareDiagram();
  const toast = useToast();

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
          Compartilhar
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Compartilhar diagrama"
        description="Quem abrir o link vê o diagrama e o código."
      >
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 font-mono text-[11px] tracking-widest text-(--color-text-muted) uppercase">
              Link com o código embutido
            </h3>
            <CopyRow value={url} testid="share-url" />
            <p className="mt-2 text-xs text-(--color-text-muted)">
              {tooLong
                ? "Diagrama grande: este link pode não caber em alguns aplicativos — prefira o link curto abaixo."
                : "O código viaja comprimido dentro do próprio link — nada é enviado a servidor algum."}
            </p>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] tracking-widest text-(--color-text-muted) uppercase">
              <Sparkles size={12} className="text-(--color-accent)" />
              Link curto
            </h3>
            {shortUrl ? (
              <>
                <CopyRow value={shortUrl} testid="short-url" />
                <button
                  className="mt-2 cursor-pointer text-xs text-(--color-danger) underline underline-offset-2"
                  onClick={() =>
                    diagramId &&
                    unshare.mutate(diagramId, {
                      onSuccess: () => toast("Link curto revogado"),
                    })
                  }
                >
                  Revogar link curto
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
                    onError: () => toast("Não foi possível gerar o link", "error"),
                  })
                }
              >
                Gerar link curto público
              </Button>
            ) : (
              <p className="text-xs text-(--color-text-muted)">
                {me
                  ? "Salve o diagrama na sua conta para gerar um link curto."
                  : "Entre com sua conta e salve o diagrama para gerar um link curto."}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
