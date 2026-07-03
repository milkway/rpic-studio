import { Columns2, Download, FileCode2, FileImage, FileText, ImageDown, Rows2 } from "lucide-react";
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
import {
  copyDiagramToClipboard,
  downloadPic,
  downloadPng,
  downloadSvg,
} from "@/lib/exports";
import { ShareDialog } from "@/components/dialogs/ShareDialog";

interface EditorToolbarProps {
  source: string;
  svg: string;
  circuits: boolean;
  layout: "horizontal" | "vertical";
  onToggleLayout: () => void;
}

/** Ações da topbar na página do editor: exportar, layout e compartilhar. */
export function EditorToolbar({ source, svg, circuits, layout, onToggleLayout }: EditorToolbarProps) {
  const toast = useToast();

  return (
    <>
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
          <DropdownItem onSelect={() => downloadPic(source)} data-testid="export-pic">
            <FileText size={15} /> Código (.pic)
          </DropdownItem>
          <DropdownItem onSelect={() => downloadSvg(svg)} data-testid="export-svg">
            <FileCode2 size={15} /> Vetor (.svg)
          </DropdownItem>
          <DropdownItem
            onSelect={() =>
              downloadPng(svg).catch(() => toast("Não foi possível gerar o PNG", "error"))
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

      <ShareDialog source={source} circuits={circuits} />
    </>
  );
}
