import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogClose, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useCreateDiagram } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n";

interface SaveDialogProps {
  source: string;
  circuits: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Nomear e salvar o diagrama atual na conta (cria e navega para /e/:id). */
export function SaveDialog({ source, circuits, open, onOpenChange }: SaveDialogProps) {
  const [title, setTitle] = useState("");
  const create = useCreateDiagram();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();

  const save = () => {
    const trimmed = title.trim() || t("save.untitled");
    create.mutate(
      { title: trimmed, source, circuits },
      {
        onSuccess: (diagram) => {
          onOpenChange(false);
          toast(t("save.saved"));
          navigate(`/e/${diagram.id}`);
        },
        onError: () => toast(t("save.error"), "error"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("save.title")} description={t("save.desc")}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={t("save.placeholder")}
          data-testid="save-title"
          className="h-10 w-full rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-surface) px-3 text-sm text-(--color-text) outline-none focus:border-(--color-accent)"
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("save.cancel")}</Button>
          </DialogClose>
          <Button variant="primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? t("save.saving") : t("save.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
