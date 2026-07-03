// Exports do diagrama: arquivos .pic/.svg/.png e área de transferência.
// O PNG é rasterizado no cliente (SVG → <img> → canvas 2x) — sem servidor.

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPic(source: string, name = "diagrama"): void {
  downloadBlob(new Blob([source], { type: "text/plain;charset=utf-8" }), `${name}.pic`);
}

export function downloadSvg(svg: string, name = "diagrama"): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
}

/** Rasteriza o SVG num canvas com `scale`x de densidade. */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar o SVG para rasterizar"));
      img.src = url;
    });
    const width = img.naturalWidth || 800;
    const height = img.naturalHeight || 600;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    // fundo branco: PNGs de diagrama circulam melhor sem transparência
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar o PNG"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPng(svg: string, name = "diagrama"): Promise<void> {
  downloadBlob(await svgToPngBlob(svg), `${name}.png`);
}

/** Copia o diagrama como imagem PNG; cai para o texto do SVG se o browser não suportar. */
export async function copyDiagramToClipboard(svg: string): Promise<"png" | "svg-text"> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      const blob = await svgToPngBlob(svg);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "png";
    } catch {
      // segue para o fallback de texto
    }
  }
  await navigator.clipboard.writeText(svg);
  return "svg-text";
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Markdown com o SVG embutido em data URI (paridade com a aba Markdown do pikup). */
export function toMarkdownSnippet(svg: string, title = "diagrama"): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(svg)));
  return `![${title}](data:image/svg+xml;base64,${b64})`;
}
