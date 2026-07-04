import {
  Columns2,
  Download,
  FileCode2,
  FileImage,
  FileText,
  FileType2,
  ImageDown,
  Rows2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tip } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n";
import {
  copyDiagramToClipboard,
  downloadPdf,
  downloadPic,
  downloadPng,
  downloadSvg,
} from "@/lib/exports";
import { ShareDialog } from "@/components/dialogs/ShareDialog";

interface EditorToolbarProps {
  source: string;
  svg: string;
  circuits: boolean;
  texlabels: boolean;
  layout: "horizontal" | "vertical";
  onToggleLayout: () => void;
  /** Nome do arquivo dos exports (título do diagrama salvo, se houver). */
  exportName?: string;
  /** Botão Salvar: presente quando o usuário pode salvar. */
  onSave?: () => void;
  saveDirty?: boolean;
  /** Diagrama salvo (habilita link curto no ShareDialog). */
  diagramId?: string;
  shareSlug?: string | null;
}

/** Ações da topbar na página do editor: salvar, exportar, layout, compartilhar. */
export function EditorToolbar({
  source,
  svg,
  circuits,
  texlabels,
  layout,
  onToggleLayout,
  exportName = "diagrama",
  onSave,
  saveDirty,
  diagramId,
  shareSlug,
}: EditorToolbarProps) {
  const toast = useToast();
  const { t } = useI18n();
  const renderOpts = { circuits, texlabels };

  return (
    <>
      {onSave && (
        <Tip label={t("toolbar.saveTip")}>
          <Button
            variant={saveDirty ? "primary" : "ghost"}
            size="sm"
            onClick={onSave}
            data-testid="save-button"
          >
            <Save size={14} />
            {t("toolbar.save")}
          </Button>
        </Tip>
      )}

      <DropdownMenu>
        <Tip label={t("toolbar.exportTip")}>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="export-button">
              <Download size={14} />
              {t("toolbar.export")}
            </Button>
          </DropdownTrigger>
        </Tip>
        <DropdownContent>
          <DropdownLabel>{t("toolbar.download")}</DropdownLabel>
          <DropdownItem onSelect={() => downloadPic(source, exportName)} data-testid="export-pic">
            <FileText size={15} /> {t("toolbar.sourcePic")}
          </DropdownItem>
          <DropdownItem onSelect={() => downloadSvg(svg, exportName)} data-testid="export-svg">
            <FileCode2 size={15} /> {t("toolbar.vectorSvg")}
          </DropdownItem>
          <DropdownItem
            onSelect={() =>
              downloadPng(source, svg, exportName, renderOpts).catch(() =>
                toast(t("toast.pngError"), "error"),
              )
            }
          >
            <FileImage size={15} /> {t("toolbar.imagePng")}
          </DropdownItem>
          <DropdownItem
            data-testid="export-pdf"
            onSelect={() =>
              downloadPdf(source, exportName, renderOpts).catch(() =>
                toast(t("toast.pdfError"), "error"),
              )
            }
          >
            <FileType2 size={15} /> {t("toolbar.filePdf")}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownLabel>{t("toolbar.copySection")}</DropdownLabel>
          <DropdownItem
            onSelect={async () => {
              try {
                const kind = await copyDiagramToClipboard(svg);
                toast(kind === "png" ? t("toast.imageCopied") : t("toast.svgCopiedText"));
              } catch {
                toast(t("toast.copyError"), "error");
              }
            }}
          >
            <ImageDown size={15} /> {t("toolbar.copyImage")}
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu>

      <Tip label={layout === "horizontal" ? t("toolbar.layoutStack") : t("toolbar.layoutSideBySide")}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleLayout}
          aria-label={t("toolbar.layoutAria")}
          className="max-lg:hidden"
        >
          {layout === "horizontal" ? <Rows2 size={15} /> : <Columns2 size={15} />}
        </Button>
      </Tip>

      <ShareDialog
        source={source}
        circuits={circuits}
        diagramId={diagramId}
        shareSlug={shareSlug}
      />
    </>
  );
}
