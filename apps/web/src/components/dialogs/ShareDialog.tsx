import { useMemo, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { buildShareUrl } from "@/lib/share";
import { copyText } from "@/lib/exports";
import { useToast } from "@/components/ui/Toast";

interface ShareDialogProps {
  source: string;
  circuits: boolean;
}

/** Compartilhar por link: o código vai comprimido no fragment da URL. */
export function ShareDialog({ source, circuits }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  // Só monta a URL com o dialog aberto (evita recomprimir a cada tecla).
  const url = useMemo(
    () => (open ? buildShareUrl({ source, circuits }) : ""),
    [open, source, circuits],
  );
  const tooLong = url.length > 10_000;

  const copy = async () => {
    await copyText(url);
    setCopied(true);
    toast("Link copiado");
    window.setTimeout(() => setCopied(false), 1800);
  };

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
        description="Quem abrir este link vê o código e o diagrama — nada é enviado a servidor algum."
      >
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="share-url"
            className="h-9 min-w-0 flex-1 rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-surface-muted) px-3 font-mono text-xs text-(--color-text-body) outline-none focus:border-(--color-accent)"
          />
          <Button variant="primary" size="md" onClick={copy} data-testid="share-copy">
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-(--color-text-muted)">
          {tooLong
            ? "Este diagrama é grande e o link pode não caber em alguns aplicativos de mensagem. Em breve: entre com sua conta para gerar um link curto."
            : `${url.length.toLocaleString("pt-BR")} caracteres — o código viaja comprimido dentro do próprio link.`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
