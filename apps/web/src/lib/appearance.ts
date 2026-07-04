// Aparência de render aplicada ao SVG já compilado (não muda a geometria):
// hoje, a família da fonte. "Assamos" no atributo do <svg> raiz para que
// preview, thumbnails e exports (.svg/.png) fiquem idênticos, e para que um
// SVG aberto fora do studio caia numa família genérica segura.

/** Opções de fonte — cada stack termina numa família genérica universal. */
export const FONT_OPTIONS: { id: string; label: string; stack: string }[] = [
  { id: "", label: "Sans (padrão)", stack: "" },
  { id: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  {
    id: "mono",
    label: "Monoespaçada",
    stack: "'IBM Plex Mono', ui-monospace, monospace",
  },
  {
    id: "instrument",
    label: "Instrument Sans",
    stack: "'Instrument Sans Variable', 'Instrument Sans', sans-serif",
  },
  {
    id: "bricolage",
    label: "Bricolage",
    stack: "'Bricolage Grotesque Variable', 'Bricolage Grotesque', sans-serif",
  },
];

export function fontStack(id: string): string {
  return FONT_OPTIONS.find((f) => f.id === id)?.stack ?? "";
}

/** Reescreve a font-family do <svg> raiz. `id` vazio mantém o padrão do rpic. */
export function bakeAppearance(svg: string, fontId: string): string {
  const stack = fontStack(fontId);
  if (!stack) return svg;
  // Escapa aspas duplas para não quebrar o atributo (as stacks usam aspas simples).
  const safe = stack.replace(/"/g, "'");
  return svg.replace(/(<svg\b[^>]*?)\sfont-family="[^"]*"/, `$1 font-family="${safe}"`);
}
