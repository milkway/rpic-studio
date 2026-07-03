import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BookOpen, ChevronDown, Eraser } from "lucide-react";
import { cn } from "@rpic/design-system";
import { AppShell } from "@/components/app-shell/AppShell";
import { CodePane } from "@/components/editor/CodePane";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { DiagnosticsPanel } from "@/components/preview/DiagnosticsPanel";
import { PreviewTabs } from "@/components/preview/PreviewTabs";
import { SaveDialog } from "@/components/dialogs/SaveDialog";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
} from "@/components/ui/DropdownMenu";
import { Switch } from "@/components/ui/Switch";
import { Tip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { useRpic } from "@/lib/useRpic";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { decodeShareHash } from "@/lib/share";
import { loadDraft, loadSettings, saveDraft, saveSettings } from "@/lib/storage";
import { examples, WELCOME_SOURCE } from "@/lib/examples";
import { useDiagram, useMe, useUpdateDiagram } from "@/lib/queries";

interface DocState {
  source: string;
  circuits: boolean;
}

function initialDoc(): DocState & { fromHash: boolean } {
  const shared = decodeShareHash(window.location.hash);
  if (shared) return { ...shared, fromHash: true };
  const draft = loadDraft();
  if (draft) return { source: draft.source, circuits: draft.circuits, fromHash: false };
  return { source: WELCOME_SOURCE, circuits: false, fromHash: false };
}

/** Página principal: editor nanquim à esquerda, papel técnico à direita.
 *  Em `/` edita o rascunho local; em `/e/:id` edita um diagrama salvo. */
export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const savedMode = !!id;
  const navigate = useNavigate();
  const toast = useToast();

  const [initial] = useState(initialDoc);
  const [doc, setDoc] = useState<DocState>({ source: initial.source, circuits: initial.circuits });
  const [layout, setLayout] = useState(() => loadSettings().layout);
  const [split, setSplit] = useState(0.42);
  const [saveOpen, setSaveOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const narrow = useMediaQuery("(max-width: 1023px)");
  const vertical = narrow || layout === "vertical";

  const { data: me } = useMe();
  const diagram = useDiagram(id);
  const update = useUpdateDiagram();

  const rpic = useRpic(doc.source, doc.circuits);

  // Modo salvo: carrega o diagrama no editor quando a query resolve.
  const loadedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (savedMode && diagram.data && loadedIdRef.current !== diagram.data.id) {
      loadedIdRef.current = diagram.data.id;
      setDoc({ source: diagram.data.source, circuits: diagram.data.circuits });
    }
    if (!savedMode) loadedIdRef.current = null;
  }, [savedMode, diagram.data]);

  // Diagrama inexistente/sem acesso → volta ao rascunho.
  useEffect(() => {
    if (savedMode && diagram.isError) {
      toast("Diagrama não encontrado", "error");
      navigate("/", { replace: true });
    }
  }, [savedMode, diagram.isError, navigate, toast]);

  const dirty =
    savedMode && diagram.data
      ? doc.source !== diagram.data.source || doc.circuits !== diagram.data.circuits
      : true;

  // Link importado: limpa o fragment para a URL voltar a ser "do usuário".
  useEffect(() => {
    if (initial.fromHash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [initial.fromHash]);

  // Colar um novo link de compartilhamento com o app aberto também funciona.
  useEffect(() => {
    const onHashChange = () => {
      const shared = decodeShareHash(window.location.hash);
      if (shared) {
        setDoc(shared);
        history.replaceState(null, "", window.location.pathname + window.location.search);
        if (savedMode) navigate("/", { replace: true });
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [savedMode, navigate]);

  // Autosave do rascunho — apenas no modo rascunho (não sobrescreve com
  // conteúdo de diagramas salvos).
  const debouncedDoc = useDebouncedValue(doc, 500);
  useEffect(() => {
    if (!savedMode) saveDraft(debouncedDoc.source, debouncedDoc.circuits);
  }, [debouncedDoc, savedMode]);

  const save = useCallback(() => {
    if (savedMode && diagram.data) {
      update.mutate(
        {
          id: diagram.data.id,
          title: diagram.data.title,
          source: doc.source,
          circuits: doc.circuits,
        },
        {
          onSuccess: () => toast("Diagrama salvo"),
          onError: () => toast("Não foi possível salvar", "error"),
        },
      );
    } else if (me) {
      setSaveOpen(true);
    }
  }, [savedMode, diagram.data, doc, me, update, toast]);

  // Atalho ⌘S / Ctrl+S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const toggleLayout = useCallback(() => {
    setLayout((l) => {
      const next = l === "horizontal" ? "vertical" : "horizontal";
      saveSettings({ layout: next });
      return next;
    });
  }, []);

  // Divisor arrastável entre os painéis.
  const onDividerPointerDown = useCallback(
    (down: React.PointerEvent) => {
      down.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const move = (e: PointerEvent) => {
        const frac = vertical
          ? (e.clientY - rect.top) / rect.height
          : (e.clientX - rect.left) / rect.width;
        setSplit(Math.min(Math.max(frac, 0.2), 0.75));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [vertical],
  );

  const setSource = useCallback((source: string) => setDoc((d) => ({ ...d, source })), []);

  return (
    <AppShell
      actions={
        <EditorToolbar
          source={doc.source}
          svg={rpic.svg}
          circuits={doc.circuits}
          layout={layout}
          onToggleLayout={toggleLayout}
          exportName={diagram.data?.title ?? "diagrama"}
          onSave={savedMode || me ? save : undefined}
          saveDirty={dirty && (savedMode ? !update.isPending : true)}
          diagramId={diagram.data?.id}
          shareSlug={diagram.data?.share_slug}
        />
      }
    >
      <SaveDialog
        source={doc.source}
        circuits={doc.circuits}
        open={saveOpen}
        onOpenChange={setSaveOpen}
      />
      <div
        ref={containerRef}
        className="grid h-full min-h-0"
        style={
          vertical
            ? { gridTemplateRows: `minmax(120px, ${split * 100}%) 6px minmax(0, 1fr)` }
            : { gridTemplateColumns: `minmax(280px, ${split * 100}%) 6px minmax(0, 1fr)` }
        }
      >
        {/* Painel nanquim: o código */}
        <section className="flex min-h-0 min-w-0 flex-col bg-(--color-ink)">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-(--color-ink-border) px-3">
            <span
              className="max-w-44 truncate font-mono text-[11px] tracking-widest text-(--color-ink-muted) uppercase"
              data-testid="doc-title"
            >
              {savedMode ? (diagram.data?.title ?? "…") : "rascunho"}
              {savedMode && dirty && <span className="ml-1 text-(--color-accent)">●</span>}
            </span>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button variant="ink-ghost" size="sm" data-testid="examples-menu">
                  <BookOpen size={13} />
                  Exemplos
                  <ChevronDown size={12} />
                </Button>
              </DropdownTrigger>
              <DropdownContent align="start">
                <DropdownLabel>Carregar exemplo</DropdownLabel>
                {examples.map((ex) => (
                  <DropdownItem
                    key={ex.id}
                    onSelect={() => setDoc({ source: ex.source, circuits: ex.circuits })}
                  >
                    {ex.title}
                  </DropdownItem>
                ))}
              </DropdownContent>
            </DropdownMenu>
            <div className="ml-auto flex items-center gap-3">
              <Tip label="Habilita resistor(), lamp(), and_gate()…">
                <span>
                  <Switch
                    ink
                    id="circuits-switch"
                    checked={doc.circuits}
                    onCheckedChange={(circuits) => setDoc((d) => ({ ...d, circuits }))}
                    label="circuitos"
                  />
                </span>
              </Tip>
              <Tip label="Limpar editor">
                <Button
                  variant="ink-ghost"
                  size="icon-sm"
                  aria-label="Limpar editor"
                  onClick={() => setDoc((d) => ({ ...d, source: "" }))}
                >
                  <Eraser size={14} />
                </Button>
              </Tip>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodePane value={doc.source} onChange={setSource} error={rpic.error} autoFocus />
          </div>
          <DiagnosticsPanel error={rpic.error} prints={rpic.prints} />
        </section>

        {/* Divisor arrastável */}
        <div
          role="separator"
          aria-orientation={vertical ? "horizontal" : "vertical"}
          onPointerDown={onDividerPointerDown}
          className={cn(
            "group flex items-center justify-center bg-(--color-border)",
            vertical ? "cursor-row-resize" : "cursor-col-resize",
          )}
        >
          <div
            className={cn(
              "rounded-full bg-(--color-border-strong) transition-colors group-hover:bg-(--color-accent)",
              vertical ? "h-1 w-8" : "h-8 w-1",
            )}
          />
        </div>

        {/* Papel técnico: o diagrama */}
        <section className="min-h-0 min-w-0 bg-(--color-paper)">
          <PreviewTabs
            svg={rpic.svg}
            animations={rpic.animations}
            version={rpic.version}
            error={rpic.error}
            loading={rpic.loading}
            compileMs={rpic.compileMs}
          />
        </section>
      </div>
    </AppShell>
  );
}
