import { useNavigate, useParams } from "react-router-dom";
import { PencilLine } from "lucide-react";
import { AppShell } from "@/components/app-shell/AppShell";
import { RpicThumb } from "@/components/preview/RpicThumb";
import { Button } from "@/components/ui/Button";
import { useSharedDiagram } from "@/lib/queries";
import { saveDraft } from "@/lib/storage";

/** Visualização pública de um diagrama compartilhado por link curto. */
export function SharedPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useSharedDiagram(slug);
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-10">
          {isLoading ? (
            <p className="text-sm text-(--color-text-muted)">carregando…</p>
          ) : isError || !data ? (
            <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-10 text-center">
              <h1 className="font-display text-xl font-semibold text-(--color-text)">
                Diagrama não encontrado
              </h1>
              <p className="mt-2 text-(--color-text-body)">
                O link pode ter sido revogado pelo autor.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1
                    className="font-display text-3xl font-semibold tracking-tight text-(--color-text)"
                    data-testid="shared-title"
                  >
                    {data.title}
                  </h1>
                  <p className="mt-1 font-mono text-xs text-(--color-text-muted)">
                    diagrama compartilhado · somente leitura
                  </p>
                </div>
                <Button
                  variant="primary"
                  data-testid="open-in-editor"
                  onClick={() => {
                    saveDraft(data.source, data.circuits);
                    navigate("/");
                  }}
                >
                  <PencilLine size={15} /> Abrir no editor
                </Button>
              </div>

              <div className="paper-grid mt-6 flex min-h-64 items-center justify-center rounded-(--radius-lg) border border-(--color-border) bg-(--color-paper) p-8">
                <RpicThumb
                  source={data.source}
                  circuits={data.circuits}
                  className="[&_svg]:h-auto [&_svg]:max-w-full"
                />
              </div>

              <pre className="mt-6 overflow-auto rounded-(--radius-lg) bg-(--color-ink) p-5 font-mono text-[13px] leading-relaxed text-(--color-ink-text)">
                {data.source}
              </pre>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
