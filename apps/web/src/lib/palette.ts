// Catálogos curados para o painel de estilo visual (clicar num elemento do
// render → escolher cor/fonte). São nomes/valores aceitos pelo rpic; o color
// picker livre complementa com `#rrggbb`.

// 10 cores por paleta: com "nenhuma" + o color picker, o grid do `Swatches`
// (6 colunas) fecha exatamente DUAS linhas cheias (6 + 6), picker por último.
/** Cores de preenchimento (nomes X11/CSS claros — bons p/ `shaded`). */
export const FILL_COLORS = [
  "white",
  "lightyellow",
  "lightblue",
  "lightgreen",
  "lightpink",
  "lavender",
  "wheat",
  "gainsboro",
  "peachpuff",
  "lightcyan",
] as const;

/** Cores de contorno/hachura (tons escuros — bons p/ `outlined`/`hatchcolor`). */
export const STROKE_COLORS = [
  "black",
  "gray",
  "dimgray",
  "steelblue",
  "seagreen",
  "firebrick",
  "goldenrod",
  "darkorange",
  "purple",
  "teal",
] as const;

/** Os 68 nomes dvips/xcolor (CamelCase) que o rpic 0.9 resolve p/ RGB real
 *  (`dvipsnam.def`) — o corpus dpic/circuit_macros usa (`shaded "Dandelion"`).
 *  Lista espelhada de `XCOLOR_NAMED` no rpic-lang (crates/core/src/color.rs). */
export const XCOLOR_NAMES = [
  "Apricot", "Aquamarine", "Bittersweet", "Black", "Blue", "BlueGreen",
  "BlueViolet", "BrickRed", "Brown", "BurntOrange", "CadetBlue",
  "CarnationPink", "Cerulean", "CornflowerBlue", "Cyan", "Dandelion",
  "DarkOrchid", "Emerald", "ForestGreen", "Fuchsia", "Goldenrod", "Gray",
  "Green", "GreenYellow", "JungleGreen", "Lavender", "LimeGreen", "Magenta",
  "Mahogany", "Maroon", "Melon", "MidnightBlue", "Mulberry", "NavyBlue",
  "OliveGreen", "Orange", "OrangeRed", "Orchid", "Peach", "Periwinkle",
  "PineGreen", "Plum", "ProcessBlue", "Purple", "RawSienna", "Red",
  "RedOrange", "RedViolet", "Rhodamine", "RoyalBlue", "RoyalPurple",
  "RubineRed", "Salmon", "SeaGreen", "Sepia", "SkyBlue", "SpringGreen",
  "Tan", "TealBlue", "Thistle", "Turquoise", "Violet", "VioletRed", "White",
  "WildStrawberry", "Yellow", "YellowGreen", "YellowOrange",
] as const;

/** Famílias de fonte por objeto (genéricas/sistema, sem carregamento). */
export const FONT_FAMILIES = [
  "serif",
  "sans-serif",
  "monospace",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Arial",
  "Verdana",
] as const;

export const FONT_SIZES = [8, 10, 12, 14, 18, 24] as const;
