// Exports do diagrama: arquivos .pic/.svg/.png/.pdf e área de transferência.
// PNG/PDF preferem o render server-side (/api/render — TeX de verdade, igual ao
// CLI); PNG cai para a rasterização no cliente se a API não responder.
import { apiUrl } from "./api";

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

export interface RenderOpts {
  scale?: number;
  circuits?: boolean;
  texlabels?: boolean;
  /** Google Font a casar no PNG/PDF (nome da família). */
  googleFont?: string;
}

/** Render server-side: POST do código pic → Blob (svg/png/pdf). Lança em erro. */
export async function renderViaApi(
  source: string,
  format: "svg" | "png" | "pdf",
  opts: RenderOpts = {},
): Promise<Blob> {
  const params = new URLSearchParams({ format });
  if (opts.scale) params.set("scale", String(opts.scale));
  if (opts.circuits) params.set("circuits", "true");
  if (opts.texlabels) params.set("texlabels", "true");
  if (opts.googleFont) params.set("google_font", opts.googleFont);
  const res = await fetch(apiUrl(`/api/render?${params}`), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: source,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // corpo não-JSON
    }
    throw new Error(message);
  }
  return res.blob();
}

/** PNG: tenta o servidor (TeX real); cai para a rasterização no cliente. */
export async function downloadPng(
  source: string,
  clientSvg: string,
  name = "diagrama",
  opts: RenderOpts = {},
): Promise<void> {
  try {
    downloadBlob(await renderViaApi(source, "png", { scale: 2, ...opts }), `${name}.png`);
  } catch {
    // API indisponível (app anônimo/sem backend) → rasteriza o SVG no cliente
    downloadBlob(await svgToPngBlob(clientSvg), `${name}.png`);
  }
}

/** PDF: só server-side (não há PDF no cliente). */
export async function downloadPdf(source: string, name = "diagrama", opts: RenderOpts = {}): Promise<void> {
  downloadBlob(await renderViaApi(source, "pdf", opts), `${name}.pdf`);
}

/** Rasteriza o SVG num canvas com `scale`x de densidade. */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  // Espera fontes pendentes (Google/empacotadas) antes de rasterizar.
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // segue mesmo assim — cai na fonte genérica
    }
  }
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

/** Imagem markdown com o SVG embutido em data URI. */
export function toMarkdownImage(svg: string, title = "diagram"): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(svg)));
  return `![${title}](data:image/svg+xml;base64,${b64})`;
}

/** Documento markdown estruturado: imagem embutida + código-fonte em bloco. */
export function toMarkdownSnippet(
  svg: string,
  source: string,
  labels: { image: string; sourceBlock: string; title: string },
): string {
  return [
    `<!-- ${labels.image} -->`,
    "",
    toMarkdownImage(svg, labels.title),
    "",
    `<!-- ${labels.sourceBlock} -->`,
    "",
    "```pic",
    source.trim(),
    "```",
    "",
  ].join("\n");
}

/** Reindenta um SVG/XML por profundidade de tags (legibilidade na aba SVG). */
export function formatXml(xml: string): string {
  const lines = xml
    .replace(/>\s*</g, ">\n<")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let depth = 0;
  const out: string[] = [];
  for (const line of lines) {
    const isClosing = /^<\//.test(line);
    const isSelfClosing = /\/>$/.test(line) || /^<[!?]/.test(line);
    const opensAndCloses = /<\//.test(line) && !isClosing;
    if (isClosing) depth = Math.max(depth - 1, 0);
    out.push("  ".repeat(depth) + line);
    if (!isClosing && !isSelfClosing && !opensAndCloses && /^<[A-Za-z]/.test(line)) {
      depth += 1;
    }
  }
  return out.join("\n");
}
