import { useEffect, useMemo, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Copy } from "lucide-react";
import { cn } from "@rpic/design-system";
import type { Anim, Interaction, ObjectGeometry } from "@/lib/rpic";
import type { PicMapping } from "@/lib/picCoords";
import type { CanvasSettings } from "@/lib/storage";
import type { SourceEdit } from "@/lib/simSource";
import { copyText, formatXml, toMarkdownSnippet } from "@/lib/exports";
import { toPythonSnippet, toRSnippet } from "@/lib/bindings";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { PreviewPane } from "./PreviewPane";
import { SimulatePanel } from "@/components/simulate/SimulatePanel";
import { MapPane } from "@/components/map/MapPane";
import { detectGeo } from "@/lib/detect";
import { ReadOnlyCode, type CodeLanguage } from "./ReadOnlyCode";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type TabValue = "imagem" | "svg" | "markdown" | "python" | "r" | "simulate" | "map";

const TAB_LANGUAGE: Record<Exclude<TabValue, "imagem" | "simulate" | "map">, CodeLanguage> = {
  svg: "xml",
  markdown: "markdown",
  python: "python",
  r: "r",
};

interface PreviewTabsProps {
  /** SVG já "assado" com a fonte escolhida. */
  svg: string;
  /** Código pic atual — vai nos snippets Markdown/Python/R. */
  source: string;
  /** Biblioteca de circuitos ligada — reflete nos snippets dos bindings. */
  circuits: boolean;
  /** Rótulos `$…$` (texlabels) — repassado ao georreferenciamento. */
  texlabels?: boolean;
  /** Incrementa quando o documento é TROCADO (exemplo, link, diagrama salvo):
   *  a aba Mapa abre sozinha p/ fonte geo e o mapa reenquadra. */
  docEpoch?: number;
  animations: Anim[];
  version: number;
  error: string | null;
  loading: boolean;
  compileMs: number | null;
  canvas: CanvasSettings;
  onCanvasChange: (next: CanvasSettings) => void;
  /** Edição visual de ESTILO sobre o render (aba imagem): clicar num objeto →
   *  cores/hatch/… escritos na sua linha de código. */
  objects?: ObjectGeometry[];
  onJumpToLine?: (line: number, col?: number) => void;
  onSourceChange?: (s: string) => void;
  /** Escrita de volta do Simular: UMA edição desfazível no editor. */
  onSourceEdit?: (edit: SourceEdit, base: string) => boolean;
  /** `animate scroll` no fonte — o PreviewPane troca autoplay por scrubber. */
  scroll?: boolean;
  /** Alvos da diretiva `draggable` (0.10.0) — o PreviewPane liga o Draggable. */
  interactions?: Interaction[];
  /** Mapeamento SVG→pic sob demanda (coordenadas do cursor no rodapé). */
  getPicMap?: () => PicMapping | null;
}

const MD_LABELS = {
  en: {
    image: "Option 1 — embedded image (paste into any Markdown)",
    sourceBlock: "Option 2 — rpic source (for pipelines that render .pic)",
    title: "diagram",
  },
  pt: {
    image: "Opção 1 — imagem embutida (cole em qualquer Markdown)",
    sourceBlock: "Opção 2 — código rpic (para pipelines que renderizam .pic)",
    title: "diagrama",
  },
};

function TabButton({ value, short, children }: { value: TabValue; short?: string; children: string }) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "shrink-0 cursor-pointer rounded-(--radius-sm) px-2.5 py-1 font-mono text-[11px] tracking-wide uppercase max-sm:px-1.5",
        "text-(--color-text-muted) transition-colors hover:text-(--color-text)",
        "data-[state=active]:bg-(--color-surface-muted) data-[state=active]:text-(--color-text)",
      )}
    >
      {/* rótulo curto no mobile (MD/PY) — senão as abas empurram os controles
          de zoom/ajuste/grade p/ fora da tela */}
      {short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="max-sm:hidden">{children}</span>
        </>
      ) : (
        children
      )}
    </Tabs.Trigger>
  );
}

/** Painel direito: imagem ao vivo ou código pronto (SVG, Markdown, Python, R). */
export function PreviewTabs({
  source,
  circuits,
  texlabels = false,
  docEpoch = 0,
  canvas,
  onCanvasChange,
  ...props
}: PreviewTabsProps) {
  // Fonte georreferenciada (geopic)? Só então existe a aba Mapa — e ela abre
  // SOZINHA quando o documento chega (1º render, exemplo, link `#pic=`).
  const geo = useMemo(() => detectGeo(source), [source]);
  const [selected, setTab] = useState<TabValue>(() => (detectGeo(source) ? "map" : "imagem"));
  const epochRef = useRef(docEpoch);
  useEffect(() => {
    if (epochRef.current === docEpoch) return;
    epochRef.current = docEpoch;
    if (geo) setTab("map");
    // `geo` é lido no momento da troca de documento, não a cada tecla
  }, [docEpoch]);
  // a fonte deixou de ser geo com a aba Mapa aberta → volta à imagem
  const tab: TabValue = selected === "map" && !geo ? "imagem" : selected;
  const [mapVisited, setMapVisited] = useState(false);
  if (tab === "map" && !mapVisited) setMapVisited(true);
  // O painel Simular fica MONTADO depois da 1ª visita (resultado e worker
  // sobrevivem à troca de aba); só a figura dele desmonta quando oculto.
  const [simVisited, setSimVisited] = useState(false);
  if (tab === "simulate" && !simVisited) setSimVisited(true);
  const toast = useToast();
  const { t, locale } = useI18n();
  const { dark } = useTheme();

  const tabsList = (
    <Tabs.List className="flex items-center gap-1 max-sm:gap-0.5">
      <TabButton value="imagem" short="IMG">{t("preview.tabImage")}</TabButton>
      <TabButton value="svg">SVG</TabButton>
      <TabButton value="markdown" short="MD">Markdown</TabButton>
      <TabButton value="python" short="PY">Python</TabButton>
      <TabButton value="r">R</TabButton>
      <TabButton value="simulate" short={t("sim.tabShort")}>{t("sim.tab")}</TabButton>
      {geo && (
        <TabButton value="map" short={t("map.tabShort")}>{t("map.tab")}</TabButton>
      )}
    </Tabs.List>
  );

  // Formata só quando a aba está aberta (o SVG muda a cada compilação).
  const codeContent = useMemo(() => {
    switch (tab) {
      case "svg":
        return formatXml(props.svg);
      case "markdown":
        return toMarkdownSnippet(props.svg, source, MD_LABELS[locale]);
      case "python":
        return toPythonSnippet(source, circuits, locale);
      case "r":
        return toRSnippet(source, circuits, locale);
      default:
        return "";
    }
  }, [tab, props.svg, source, circuits, locale]);

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(v) => setTab(v as TabValue)}
      className="h-full min-h-0"
      asChild
    >
      <div>
        {tab === "imagem" ? (
          <PreviewPane
            {...props}
            source={source}
            canvas={canvas}
            onCanvasChange={onCanvasChange}
            tabs={tabsList}
          />
        ) : tab === "simulate" || tab === "map" ? null : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-10 min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-(--color-border) bg-(--color-surface) px-3">
              {tabsList}
              <div className="ml-auto shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await copyText(codeContent);
                    toast(t("preview.copiedToClipboard"));
                  }}
                >
                  <Copy size={13} />
                  {t("preview.copy")}
                </Button>
              </div>
            </div>
            <ReadOnlyCode
              content={codeContent}
              language={TAB_LANGUAGE[tab]}
              dark={dark}
              testid={`code-view-${tab}`}
            />
          </div>
        )}
        {/* Fica MONTADO após a 1ª visita (como o Simular): `detectGeo` pisca
            false enquanto se redigita `geo_lon = …`, e desmontar mataria o
            worker e o mapa (e a vista do usuário). Só esconde. */}
        {mapVisited && (
          <div className={cn("h-full min-h-0", tab !== "map" && "hidden")}>
            <MapPane
              source={source}
              circuits={circuits}
              texlabels={texlabels}
              active={tab === "map"}
              fitKey={docEpoch}
              tabs={tab === "map" ? tabsList : null}
              onJumpToLine={props.onJumpToLine}
            />
          </div>
        )}
        {simVisited && (
          <div className={cn("h-full min-h-0", tab !== "simulate" && "hidden")}>
            <SimulatePanel
              source={source}
              active={tab === "simulate"}
              tabs={tab === "simulate" ? tabsList : null}
              onJumpToLine={props.onJumpToLine}
              onSourceEdit={props.onSourceEdit}
            />
          </div>
        )}
      </div>
    </Tabs.Root>
  );
}
