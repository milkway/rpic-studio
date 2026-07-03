import {
  Columns2,
  Download,
  FileCode2,
  FileImage,
  FileText,
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
import { copyDiagramToClipboard, downloadPic, downloadPng, downloadSvg } from "@/lib/exports";
import { ShareDialog } from "@/components/dialogs/ShareDialog";

interface EditorToolbarProps {
  source: string;
  svg: string;
  circuits: boolean;
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
  layout,
  onToggleLayout,
  exportName = "diagrama",
  onSave,
  saveDirty,
  diagramId,
  shareSlug,
}: EditorToolbarProps) {
  const toast = useToast();

  return (
    <>
      {onSave && (
        <Tip label="Salvar (⌘S)">
          <Button
            variant={saveDirty ? "primary" : "ghost"}
            size="sm"
            onClick={onSave}
            data-testid="save-button"
          >
            <Save size={14} />
            Salvar
          </Button>
        </Tip>
      )}

      <DropdownMenu>
        <Tip label="Exportar e copiar">
          <DropdownTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="export-button">
              <Download size={14} />
              Exportar
            </Button>
          </DropdownTrigger>
        </Tip>
        <DropdownContent>
          <DropdownLabel>Baixar</DropdownLabel>
          <DropdownItem onSelect={() => downloadPic(source, exportName)} data-testid="export-pic">
            <FileText size={15} /> Código (.pic)
          </DropdownItem>
          <DropdownItem onSelect={() => downloadSvg(svg, exportName)} data-testid="export-svg">
            <FileCode2 size={15} /> Vetor (.svg)
          </DropdownItem>
          <DropdownItem
            onSelect={() =>
              downloadPng(svg, exportName).catch(() =>
                toast("Não foi possível gerar o PNG", "error"),
              )
            }
          >
            <FileImage size={15} /> Imagem (.png, 2x)
          </DropdownItem>
          <DropdownSeparator />
          <DropdownLabel>Copiar</DropdownLabel>
          <DropdownItem
            onSelect={async () => {
              try {
                const kind = await copyDiagramToClipboard(svg);
                toast(kind === "png" ? "Imagem copiada" : "SVG copiado como texto");
              } catch {
                toast("Não foi possível copiar", "error");
              }
            }}
          >
            <ImageDown size={15} /> Imagem para a área de transferência
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu>

      <Tip label={layout === "horizontal" ? "Empilhar painéis" : "Painéis lado a lado"}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleLayout}
          aria-label="Alternar layout"
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
