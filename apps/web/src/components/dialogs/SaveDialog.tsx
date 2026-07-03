import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogClose, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useCreateDiagram } from "@/lib/queries";
import { useToast } from "@/components/ui/Toast";

interface SaveDialogProps {
  source: string;
  circuits: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
}

/** Nomear e salvar o diagrama atual na conta (cria e navega para /e/:id). */
export function SaveDialog({ source, circuits, open, onOpenChange }: SaveDialogProps) {
  const [title, setTitle] = useState("");
  const create = useCreateDiagram();
  const navigate = useNavigate();
  const toast = useToast();

  const save = () => {
    const trimmed = title.trim() || "Sem título";
    create.mutate(
      { title: trimmed, source, circuits },
      {
        onSuccess: (diagram) => {
          onOpenChange(false);
          toast("Diagrama salvo");
          navigate(`/e/${diagram.id}`);
        },
        onError: () => toast("Não foi possível salvar", "error"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Salvar diagrama"
        description="O diagrama fica na sua conta e pode ganhar um link curto público."
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Nome do diagrama"
          data-testid="save-title"
          className="h-10 w-full rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-surface) px-3 text-sm text-(--color-text) outline-none focus:border-(--color-accent)"
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button variant="primary" onClick={save} disabled={create.isPending}>
            {create.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
