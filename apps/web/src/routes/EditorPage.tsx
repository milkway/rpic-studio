import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BookOpen, ChevronDown, Eraser, SlidersHorizontal } from "lucide-react";
import { cn } from "@rpic/design-system";
import { AppShell } from "@/components/app-shell/AppShell";
import { CodePane, type CodePaneHandle } from "@/components/editor/CodePane";
import { explainDiagnostic, explainRawError } from "@/lib/errorInfo";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { DiagnosticsPanel } from "@/components/preview/DiagnosticsPanel";
import { PreviewTabs } from "@/components/preview/PreviewTabs";
import { SaveDialog } from "@/components/dialogs/SaveDialog";
import { DefaultsBar } from "@/components/editor/DefaultsBar";
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
import {
  loadCanvasSettings,
  loadDraft,
  loadSettings,
  saveCanvasSettings,
  saveDraft,
  saveSettings,
  type CanvasSettings,
} from "@/lib/storage";
import { bakeAppearance } from "@/lib/appearance";
import { useEnsureFont } from "@/hooks/useEnsureFont";
import { examples, WELCOME_SOURCES } from "@/lib/examples";
import { useDiagram, useMe, useUpdateDiagram } from "@/lib/queries";
import { useI18n, type Locale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { PREFS_EVENT, pushPrefsSoon } from "@/lib/prefs";
import { detectCircuits, detectTexLabels } from "@/lib/detect";
import { mathActive, rememberMathPreference } from "@/lib/rpic";

interface DocState {
  source: string;
  circuits: boolean;
}

function initialDoc(locale: Locale): DocState & { fromHash: boolean } {
  const shared = decodeShareHash(window.location.hash);
  const doc = shared
    ? { ...shared, fromHash: true }
    : (() => {
        const draft = loadDraft();
        return draft
          ? { source: draft.source, circuits: draft.circuits, fromHash: false }
          : { source: WELCOME_SOURCES[locale], circuits: false, fromHash: false };
      })();
  // Documento inicial já usa $…$? Fixa o build math ANTES do primeiro ready().
  if (detectTexLabels(doc.source)) rememberMathPreference();
  return doc;
}

/** Página principal: editor nanquim à esquerda, papel técnico à direita.
 *  Em `/` edita o rascunho local; em `/e/:id` edita um diagrama salvo. */
export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const savedMode = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const { t, locale } = useI18n();
  const { dark } = useTheme();

  const [initial] = useState(() => initialDoc(locale));
  const [doc, setDoc] = useState<DocState>({ source: initial.source, circuits: initial.circuits });
  const [layout, setLayout] = useState(() => loadSettings().layout);
  const [split, setSplit] = useState(0.42);
  const [saveOpen, setSaveOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [canvas, setCanvas] = useState<CanvasSettings>(loadCanvasSettings);
  const containerRef = useRef<HTMLDivElement>(null);
  const narrow = useMediaQuery("(max-width: 1023px)");
  const vertical = narrow || layout === "vertical";

  const { data: me } = useMe();
  const diagram = useDiagram(id);
  const update = useUpdateDiagram();

  // Circuitos e texlabels ligam sozinhos quando o código os usa; o
  // interruptor continua servindo de override manual quando nada é detectado.
  const autoCircuits = useMemo(() => detectCircuits(doc.source), [doc.source]);
  const texlabels = useMemo(() => detectTexLabels(doc.source), [doc.source]);
  const circuits = doc.circuits || autoCircuits;

  const rpic = useRpic(doc.source, { circuits, texlabels });
  const codeRef = useRef<CodePaneHandle>(null);

  // Carrega a Google Font escolhida (no-op para builtin) e assa no SVG.
  useEnsureFont(canvas.fontFamily);
  const bakedSvg = useMemo(
    () => bakeAppearance(rpic.svg, canvas.fontFamily),
    [rpic.svg, canvas.fontFamily],
  );

  const changeCanvas = useCallback((next: CanvasSettings) => {
    setCanvas(next);
    saveCanvasSettings(next);
    pushPrefsSoon();
  }, []);

  // Prefs da conta aplicadas ao storage → relê a aparência.
  useEffect(() => {
    const onPrefs = () => setCanvas(loadCanvasSettings());
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, []);

  // Diagnósticos interpretados: posição precisa, texto humano e sugestões.
  const errorInfo = useMemo(
    () =>
      rpic.errorDiag
        ? explainDiagnostic(rpic.errorDiag, doc.source, locale, "error")
        : rpic.error
          ? explainRawError(rpic.error, locale)
          : null,
    [rpic.error, rpic.errorDiag, doc.source, locale],
  );
  const warningInfos = useMemo(
    () => rpic.warnings.map((w) => explainDiagnostic(w, doc.source, locale, "warning")),
    [rpic.warnings, doc.source, locale],
  );
  const allDiagnostics = useMemo(
    () => (errorInfo ? [errorInfo] : warningInfos),
    [errorInfo, warningInfos],
  );

  // Math digitado com o build lean carregado: fixa a preferência e avisa que
  // um reload ativa a tipografia (a troca de build exige reinicializar o wasm).
  const mathHintShown = useRef(false);
  useEffect(() => {
    if (texlabels && !mathActive() && !mathHintShown.current) {
      mathHintShown.current = true;
      rememberMathPreference();
      toast(t("math.reloadHint"));
    }
  }, [texlabels, toast, t]);

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
      toast(t("editor.notFound"), "error");
      navigate("/", { replace: true });
    }
  }, [savedMode, diagram.isError, navigate, toast, t]);

  const dirty =
    savedMode && diagram.data
      ? doc.source !== diagram.data.source || circuits !== diagram.data.circuits
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
          circuits,
        },
        {
          onSuccess: () => toast(t("save.saved")),
          onError: () => toast(t("save.error"), "error"),
        },
      );
    } else if (me) {
      setSaveOpen(true);
    }
  }, [savedMode, diagram.data, doc, me, update, toast, t]);

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
    pushPrefsSoon();
  }, []);

  // Prefs da conta aplicadas ao storage → relê o layout.
  useEffect(() => {
    const onPrefs = () => setLayout(loadSettings().layout);
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
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
          svg={bakedSvg}
          circuits={circuits}
          layout={layout}
          onToggleLayout={toggleLayout}
          exportName={diagram.data?.title ?? (locale === "pt" ? "diagrama" : "diagram")}
          onSave={savedMode || me ? save : undefined}
          saveDirty={dirty && (savedMode ? !update.isPending : true)}
          diagramId={diagram.data?.id}
          shareSlug={diagram.data?.share_slug}
        />
      }
    >
      <SaveDialog
        source={doc.source}
        circuits={circuits}
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
              {savedMode ? (diagram.data?.title ?? "…") : t("editor.draft")}
              {savedMode && dirty && <span className="ml-1 text-(--color-accent)">●</span>}
            </span>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button variant="ink-ghost" size="sm" data-testid="examples-menu">
                  <BookOpen size={13} />
                  {t("editor.examples")}
                  <ChevronDown size={12} />
                </Button>
              </DropdownTrigger>
              <DropdownContent align="start">
                <DropdownLabel>{t("editor.loadExample")}</DropdownLabel>
                {examples.map((ex) => (
                  <DropdownItem
                    key={ex.id}
                    onSelect={() => setDoc({ source: ex.source, circuits: ex.circuits })}
                  >
                    {ex.title[locale]}
                  </DropdownItem>
                ))}
              </DropdownContent>
            </DropdownMenu>
            <Tip label={t("defaults.tip")}>
              <Button
                variant="ink-ghost"
                size="sm"
                data-testid="defaults-button"
                onClick={() => setDefaultsOpen((v) => !v)}
                className={cn(defaultsOpen && "bg-(--color-ink-raised) text-(--color-ink-text)")}
              >
                <SlidersHorizontal size={13} />
                {t("defaults.button")}
              </Button>
            </Tip>
            <div className="ml-auto flex items-center gap-3">
              <Tip label={autoCircuits ? t("editor.circuitsAuto") : t("editor.circuitsTip")}>
                <span>
                  <Switch
                    ink
                    id="circuits-switch"
                    checked={circuits}
                    disabled={autoCircuits}
                    onCheckedChange={(on) => setDoc((d) => ({ ...d, circuits: on }))}
                    label={autoCircuits ? `${t("editor.circuits")} ✦` : t("editor.circuits")}
                  />
                </span>
              </Tip>
              <Tip label={t("editor.clear")}>
                <Button
                  variant="ink-ghost"
                  size="icon-sm"
                  aria-label={t("editor.clear")}
                  onClick={() => setDoc((d) => ({ ...d, source: "" }))}
                >
                  <Eraser size={14} />
                </Button>
              </Tip>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodePane
              ref={codeRef}
              value={doc.source}
              onChange={setSource}
              diagnostics={allDiagnostics}
              dark={dark}
              autoFocus
            />
          </div>
          <DefaultsBar
            open={defaultsOpen}
            source={doc.source}
            onApply={setSource}
            onClose={() => setDefaultsOpen(false)}
          />
          <DiagnosticsPanel
            error={errorInfo}
            warnings={warningInfos}
            prints={rpic.prints}
            onJump={(line, col) => codeRef.current?.focusAt(line, col)}
          />
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
            svg={bakedSvg}
            source={doc.source}
            circuits={circuits}
            animations={rpic.animations}
            version={rpic.version}
            error={rpic.error}
            loading={rpic.loading}
            compileMs={rpic.compileMs}
            canvas={canvas}
            onCanvasChange={changeCanvas}
          />
        </section>
      </div>
    </AppShell>
  );
}
