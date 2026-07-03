import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Cpu } from "lucide-react";
import { motion } from "@rpic/design-system";
import { AppShell } from "@/components/app-shell/AppShell";
import { RpicThumb } from "@/components/preview/RpicThumb";
import { examples, type Example } from "@/lib/examples";
import { saveDraft } from "@/lib/storage";

function ExampleCard({ example }: { example: Example }) {
  const navigate = useNavigate();

  const open = () => {
    saveDraft(example.source, example.circuits);
    navigate("/");
  };

  return (
    <button
      onClick={open}
      data-card
      className="group flex cursor-pointer flex-col overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) text-left shadow-(--shadow-sm) transition-all duration-200 hover:-translate-y-0.5 hover:border-(--color-border-strong) hover:shadow-(--shadow-card)"
    >
      <div className="paper-grid flex h-44 items-center justify-center overflow-hidden border-b border-(--color-border) p-5">
        <RpicThumb
          source={example.source}
          circuits={example.circuits}
          className="flex max-h-full max-w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-h-36 [&_svg]:w-auto [&_svg]:max-w-full"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-display flex items-center gap-2 font-semibold text-(--color-text)">
          {example.title}
          {example.circuits && (
            <span className="flex items-center gap-1 rounded-full bg-(--color-surface-muted) px-2 py-0.5 font-mono text-[10px] font-normal tracking-wide text-(--color-text-muted)">
              <Cpu size={10} /> circuitos
            </span>
          )}
        </h3>
        <p className="text-sm text-(--color-text-body)">{example.description}</p>
        <span className="mt-2 flex items-center gap-1.5 text-sm font-medium text-(--color-accent) opacity-0 transition-opacity group-hover:opacity-100">
          Abrir no editor <ArrowRight size={14} />
        </span>
      </div>
    </button>
  );
}

/** Galeria de exemplos — cada cartão compila e mostra o diagrama de verdade. */
export function ExamplesPage() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cards = gridRef.current?.querySelectorAll("[data-card]");
    if (cards?.length) motion.fadeUp(cards);
  }, []);

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-(--color-text)">
            Exemplos
          </h1>
          <p className="mt-2 max-w-xl text-(--color-text-body)">
            Do pipeline clássico do Kernighan a circuitos completos — clique para abrir qualquer um
            no editor e partir dele.
          </p>
          <div ref={gridRef} className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((ex) => (
              <ExampleCard key={ex.id} example={ex} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
