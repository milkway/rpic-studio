// Autocomplete do rpic (pic) para o CodeMirror. Sugere primitivas, direções,
// atributos, cores, diretivas, nomes de objetos JÁ definidos no documento
// (p/ `from N1.e`) e macros de circuito quando `copy "circuits"` está presente.
import { type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { CIRCUIT_ELEMENTS } from "@/lib/circuitCatalog";
import { FILL_COLORS, STROKE_COLORS, XCOLOR_NAMES } from "@/lib/palette";

function group(labels: string[], type: string, detail: string): Completion[] {
  return labels.map((label) => ({ label, type, detail }));
}

// Estáticas — não dependem do documento (montadas uma vez).
const STATIC: Completion[] = [
  ...group(["box", "circle", "ellipse", "line", "arrow", "spline", "arc", "move", "dot", "text"], "keyword", "forma"),
  ...group(["right", "left", "up", "down", "then", "same"], "keyword", "direção"),
  // pikchr-compat (rpic 0.7.1)
  ...group(["previous", "aligned", "big", "small"], "keyword", "pikchr-compat"),
  ...group(["wid", "ht", "rad", "diam", "at", "from", "to", "with", "chop", "fit", "invis"], "property", "atributo"),
  ...group(
    ["shaded", "outlined", "colored", "color", "fill", "hatch", "crosshatch", "hatchangle", "hatchsep", "hatchcolor", "hatchwid", "dashed", "dotted", "thick", "thin", "opacity"],
    "property",
    "estilo",
  ),
  ...group(["bold", "italic", "font", "fontsize", "ljust", "rjust", "above", "below", "rotated"], "property", "texto"),
  // hyperlink em objeto (rpic 0.11.0): atributo inline ou statement `link A "url"`
  { label: "link", type: "property", detail: "hyperlink (SVG)" },
  // animação (extensão animate — rpic 0.8.x; type/scramble/wiggle e draw from/to — 0.10.0)
  { label: "animate", type: "keyword", detail: "animação" },
  ...group(
    ["with", "along", "into", "out", "stagger", "for", "at", "after", "delay", "repeat", "yoyo", "ease", "scroll", "by", "wiggles"],
    "property",
    "animação",
  ),
  ...(["pop", "fade", "draw", "slide", "move", "highlight", "morph", "type", "scramble", "wiggle"] as const).map((e) => ({
    label: `"${e}"`,
    type: "constant",
    detail: "efeito de animação",
    apply: `"${e}"`,
  })),
  // interação (diretiva draggable — rpic 0.10.0)
  { label: "draggable", type: "keyword", detail: "arrastável (GSAP Draggable)" },
  ...group(["inertia", "bounds"], "property", "draggable"),
  { label: ".PS", type: "keyword", detail: "início do diagrama" },
  { label: ".PE", type: "keyword", detail: "fim do diagrama" },
  { label: "canvas", type: "keyword", detail: "página de tamanho fixo" },
  { label: 'copy "circuits"', type: "keyword", detail: "carrega a biblioteca de circuitos" },
  { label: "define", type: "keyword", detail: "macro reutilizável" },
  ...group(["scale", "boxwid", "boxht", "circlerad", "linethick", "arrowht", "arrowwid"], "variable", "variável pic"),
  ...group([...FILL_COLORS, ...STROKE_COLORS], "constant", "cor"),
  // nomes dvips/xcolor (rpic 0.9 resolve p/ o RGB do dvipsnam.def)
  ...group([...XCOLOR_NAMES], "constant", "cor (xcolor)"),
];

const CIRCUIT: Completion[] = CIRCUIT_ELEMENTS.map((e) => ({
  label: e.id,
  type: "function",
  detail: `circuito · ${e.label.en}`,
  apply: `${e.id}(`,
}));

/** Fonte de completions (registrada via `autocompletion({ override })`). */
export function rpicCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w.]+/);
  if (!context.explicit && (!word || word.from === word.to)) return null;

  const text = context.state.doc.toString();
  // nomes de objetos já rotulados (`Nome:`) — p/ referências `from Nome.lado`
  const names = new Set<string>();
  for (const m of text.matchAll(/^\s*([A-Za-z]\w*)\s*:/gm)) names.add(m[1]);
  const nameOpts: Completion[] = [...names].map((n) => ({ label: n, type: "variable", detail: "objeto" }));

  const circuitsOn = /copy\s+"circuits"/.test(text);
  const options = [...STATIC, ...nameOpts, ...(circuitsOn ? CIRCUIT : [])];

  return { from: word ? word.from : context.pos, options, validFor: /^[\w.]*$/ };
}
