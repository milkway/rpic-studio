// Linguagem rpic para CodeMirror 6 — porte fiel das 17 regras da gramática
// TextMate oficial (rpic/tools/highlight/rpic.tmLanguage.json).
import { LanguageSupport, StreamLanguage, StringStream } from "@codemirror/language";
import { tags as t, Tag } from "@lezer/highlight";

// Regexes na mesma ordem de precedência da gramática TextMate.
const RE = {
  comment: /^#.*/,
  string: /^"(?:\\.|[^"\\])*"?/,
  directive: /^\.(PS|PE|PF)\b/,
  label: /^[A-Z][A-Za-z0-9_]*(?=\s*:(?!=))/,
  ordinal: /^(?:\d+(?:st|nd|rd|th)(?:\s+last)?|last|here)\b/,
  control: /^(?:define|undef|if|then|else|for|do|copy|print|reset|exec|sh|command|animate)\b/,
  extension:
    /^(?:fit|behind|close|crosshatch|hatchangle|hatchsep|hatchwidth|hatchwid|hatchcolor|hatch|opacity|gradientangle|gradient|class|texlabels|bracepos|labeloffset|topmargin|rightmargin|bottommargin|leftmargin|margin|dotrad)\b/,
  primitive: /^(?:box|circle|ellipse|line|arrow|arc|spline|move|brace|dot)\b/,
  attribute:
    /^(?:at|with|after|from|to|by|chop|fill|same|invis|invisible|solid|dashed|dotted|thick|up|down|left|right|ljust|rjust|above|below|between|of|the|way|heading|wid|width|ht|height|rad|radius|diam|diameter|shaded|outlined|colored|coloured|color|colour|cw|ccw|dotstart|dotend)\b/,
  envvar:
    /^(?:scale|boxwid|boxht|boxrad|circlerad|linewid|lineht|movewid|moveht|arcrad|ellipsewid|ellipseht|textwid|textht|textoffset|arrowwid|arrowht|arrowhead|dashwid|fillval|maxpswid|maxpsht|linethick)\b/,
  builtin: /^(?:sqrt|sin|cos|atan2|log|exp|int|max|min|rand|srand|sprintf)\b/,
  macrocall: /^[A-Za-z_][A-Za-z0-9_]*(?=\s*\()/,
  corner: /^\.(?:nw|ne|sw|se|n|e|s|w|c|t|b|l|r|center|start|end|top|bottom|left|right)\b/,
  number: /^(?:\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|\.\d+)/,
  arrowop: /^(?:<->|<-|->)/,
  operator: /^(?:==|!=|<=|>=|&&|\|\||[-+*/%^=<>!])/,
} as const;

/** Tags customizadas para escopos sem equivalente 1:1 no @lezer/highlight. */
export const rpicTags = {
  primitive: Tag.define(t.keyword),
  attribute: Tag.define(t.keyword),
  extension: Tag.define(t.annotation),
  envvar: Tag.define(t.variableName),
  corner: Tag.define(t.propertyName),
  ordinal: Tag.define(t.atom),
  directive: Tag.define(t.meta),
  arrowop: Tag.define(t.operator),
};

function token(stream: StringStream): string | null {
  if (stream.eatSpace()) return null;
  if (stream.match(RE.comment)) return "comment";
  if (stream.match(RE.string)) return "string";
  if (stream.match(RE.directive)) return "directive";
  if (stream.match(RE.label)) return "labelName";
  if (stream.match(RE.ordinal)) return "ordinal";
  if (stream.match(RE.control)) return "controlKeyword";
  if (stream.match(RE.extension)) return "extension";
  if (stream.match(RE.primitive)) return "primitive";
  if (stream.match(RE.attribute)) return "attribute";
  if (stream.match(RE.envvar)) return "envvar";
  if (stream.match(RE.builtin)) return "builtinFunction";
  if (stream.match(RE.macrocall)) return "macroName";
  if (stream.match(RE.corner)) return "corner";
  if (stream.match(RE.number)) return "number";
  if (stream.match(RE.arrowop)) return "arrowop";
  if (stream.match(RE.operator)) return "operator";
  stream.next();
  return null;
}

const parser = StreamLanguage.define({
  name: "rpic",
  token,
  languageData: {
    commentTokens: { line: "#" },
  },
  tokenTable: {
    comment: t.lineComment,
    string: t.string,
    directive: rpicTags.directive,
    labelName: t.labelName,
    ordinal: rpicTags.ordinal,
    controlKeyword: t.controlKeyword,
    extension: rpicTags.extension,
    primitive: rpicTags.primitive,
    attribute: rpicTags.attribute,
    envvar: rpicTags.envvar,
    builtinFunction: t.function(t.variableName),
    macroName: t.macroName,
    corner: rpicTags.corner,
    number: t.number,
    arrowop: rpicTags.arrowop,
    operator: t.operator,
  },
});

export function rpicLanguage(): LanguageSupport {
  return new LanguageSupport(parser);
}

/** Tokeniza uma linha isolada — usado nos testes da gramática. */
export function tokenizeLine(line: string): { text: string; style: string | null }[] {
  const stream = new StringStream(line, 4, 2);
  const out: { text: string; style: string | null }[] = [];
  while (!stream.eol()) {
    stream.start = stream.pos;
    const style = token(stream);
    const text = line.slice(stream.start, stream.pos);
    if (text.trim()) out.push({ text, style });
  }
  return out;
}
