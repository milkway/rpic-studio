// Aparência de render aplicada ao SVG já compilado (não muda a geometria):
// a família da fonte. "Assamos" no atributo do <svg> raiz para que preview,
// thumbnails e exports fiquem idênticos.
//
// Duas origens de fonte:
//  - builtin: fontes do sistema ou já empacotadas (instantâneas, offline).
//  - Google Fonts: catálogo curado, carregado sob demanda pelo endpoint CSS
//    (`fonts.googleapis.com/css2`, sem API key). O valor guardado é `g:Família`.

interface Builtin {
  id: string;
  label: string;
  stack: string;
}

/** Fontes instantâneas (sistema + empacotadas via @fontsource). */
export const BUILTIN_FONTS: Builtin[] = [
  { id: "", label: "Sans (padrão)", stack: "" },
  { id: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Mono", stack: "'IBM Plex Mono', ui-monospace, monospace" },
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

type GoogleCategory = "sans" | "serif" | "mono" | "display" | "hand";

export interface GoogleFont {
  family: string;
  category: GoogleCategory;
}

const GENERIC: Record<GoogleCategory, string> = {
  sans: "sans-serif",
  serif: "serif",
  mono: "monospace",
  display: "sans-serif",
  hand: "cursive",
};

/** Catálogo curado das Google Fonts mais usadas (diagramas, UI, docs). */
export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans
  ...[
    "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Inter", "Nunito",
    "Nunito Sans", "Work Sans", "Source Sans 3", "Noto Sans", "Raleway", "Ubuntu",
    "Rubik", "Mulish", "DM Sans", "Manrope", "Barlow", "Kanit", "Oswald",
    "Fira Sans", "PT Sans", "Karla", "Josefin Sans", "Quicksand", "Cabin",
    "Assistant", "Titillium Web", "Archivo", "Space Grotesk",
  ].map((family) => ({ family, category: "sans" as const })),
  // Serif
  ...[
    "Merriweather", "Playfair Display", "Lora", "PT Serif", "Noto Serif",
    "Source Serif 4", "Bitter", "Crimson Text", "EB Garamond", "Cormorant",
    "Libre Baskerville", "Zilla Slab", "Roboto Slab", "Vollkorn", "Spectral",
  ].map((family) => ({ family, category: "serif" as const })),
  // Mono
  ...[
    "Roboto Mono", "Source Code Pro", "JetBrains Mono", "Fira Code", "Space Mono",
    "Inconsolata", "Ubuntu Mono", "Cousine", "IBM Plex Mono",
  ].map((family) => ({ family, category: "mono" as const })),
  // Display / manuscrita
  ...[
    "Bebas Neue", "Righteous", "Archivo Black", "Abril Fatface", "Comfortaa",
  ].map((family) => ({ family, category: "display" as const })),
  ...[
    "Pacifico", "Caveat", "Dancing Script", "Lobster", "Satisfy",
    "Shadows Into Light", "Permanent Marker", "Indie Flower",
  ].map((family) => ({ family, category: "hand" as const })),
];

const GOOGLE_PREFIX = "g:";

/** Constrói o valor guardado para uma Google Font. */
export function googleValue(family: string): string {
  return GOOGLE_PREFIX + family;
}

/** Se `fontFamily` for uma Google Font, retorna a família; senão null. */
export function googleFamilyOf(fontFamily: string): string | null {
  return fontFamily.startsWith(GOOGLE_PREFIX) ? fontFamily.slice(GOOGLE_PREFIX.length) : null;
}

/** Resolve o valor guardado numa font-family stack CSS (""=padrão do rpic). */
export function resolveFontStack(fontFamily: string): string {
  const family = googleFamilyOf(fontFamily);
  if (family) {
    const cat = GOOGLE_FONTS.find((f) => f.family === family)?.category ?? "sans";
    return `'${family}', ${GENERIC[cat]}`;
  }
  return BUILTIN_FONTS.find((f) => f.id === fontFamily)?.stack ?? "";
}

/** Rótulo legível do valor atual (para o botão/UI). */
export function fontLabel(fontFamily: string): string {
  const family = googleFamilyOf(fontFamily);
  if (family) return family;
  return BUILTIN_FONTS.find((f) => f.id === fontFamily)?.label ?? "Sans (padrão)";
}

/** Reescreve a font-family do <svg> raiz. Valor vazio mantém o padrão do rpic. */
export function bakeAppearance(svg: string, fontFamily: string): string {
  const stack = resolveFontStack(fontFamily);
  if (!stack) return svg;
  const safe = stack.replace(/"/g, "'");
  return svg.replace(/(<svg\b[^>]*?)\sfont-family="[^"]*"/, `$1 font-family="${safe}"`);
}

// ---- Carregamento sob demanda das Google Fonts (endpoint CSS, sem API key) ----

const loaded = new Map<string, Promise<void>>();

/** Injeta o <link> da Google Font uma vez e resolve quando o arquivo carrega. */
export function ensureGoogleFont(family: string): Promise<void> {
  if (typeof document === "undefined" || !family) return Promise.resolve();
  const cached = loaded.get(family);
  if (cached) return cached;

  const href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&display=swap`;
  const linkReady = new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.gfont = family;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // offline/CSP: cai na fonte genérica
    document.head.appendChild(link);
  });
  // Espera também o arquivo de fonte estar pronto (importante p/ export PNG).
  const ready = linkReady.then(() =>
    (document.fonts?.load(`16px '${family}'`) ?? Promise.resolve())
      .then(() => undefined)
      .catch(() => undefined),
  );
  loaded.set(family, ready);
  return ready;
}

/** Garante a fonte do valor guardado (Google), se for o caso. */
export function ensureFontLoaded(fontFamily: string): Promise<void> {
  const family = googleFamilyOf(fontFamily);
  return family ? ensureGoogleFont(family) : Promise.resolve();
}
