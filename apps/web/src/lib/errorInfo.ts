// Camada de UX sobre os diagnósticos ESTRUTURADOS do compilador rpic
// (rpic-lang#178): o compilador entrega posição com span (line/col/end_col),
// kind, found/expected e hint; aqui só localizamos o texto e complementamos a
// sugestão quando o compilador não tem o vocabulário em escopo (ex.: macro de
// circuitos digitada errado sem a biblioteca carregada).
import type { Diagnostic as RpicDiagnostic } from "@strategicprojects/rpic";
import type { Locale } from "./i18n";
import { errorPosition } from "./rpic";

// Vocabulário para o fallback de sugestão (o compilador cobre o que está em
// escopo; isto cobre macros de circuito quando a biblioteca está desligada).
const PRIMITIVES = "box circle ellipse line arrow arc spline move brace dot".split(" ");
const CONTROL = "define undef if then else for do copy print reset animate".split(" ");
const COMMON_CIRCUITS =
  "resistor capacitor inductor battery diode ground wire lamp fuse switch opamp and_gate or_gate xor_gate nand_gate nor_gate not_gate transformer relay motor led".split(
    " ",
  );

// Damerau-Levenshtein (OSA): transposição adjacente custa 1 — é o typo mais
// comum ("bxo" → "box") e o Levenshtein puro cobraria 2.
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

/** Palavra mais próxima no vocabulário (distância ≤ 2; ≤ 1 para palavras curtas). */
export function suggestWord(word: string, source: string): string | null {
  const userMacros = [...source.matchAll(/\bdefine\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map(
    (m) => m[1],
  );
  const vocabulary = [...PRIMITIVES, ...CONTROL, ...COMMON_CIRCUITS, ...userMacros];
  const maxDistance = word.length <= 4 ? 1 : 2;
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of vocabulary) {
    if (candidate === word) continue;
    const d = editDistance(word.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

export interface ErrorInfo {
  severity: "error" | "warning";
  /** 1-based; null quando desconhecida. */
  line: number | null;
  col: number | null;
  /** Comprimento do token ofensor (sublinhado preciso), quando conhecido. */
  tokenLength: number | null;
  /** Mensagem humana localizada. */
  friendly: string;
  /** Sugestão de correção ("você quis dizer…?"), quando houver. */
  suggestion: string | null;
  /** Mensagem original do compilador. */
  raw: string;
}

const M = {
  unknownCommand: {
    en: (w: string) => `“${w}” is not an rpic command, attribute or macro.`,
    pt: (w: string) => `“${w}” não é um comando, atributo ou macro do rpic.`,
  },
  didYouMean: {
    en: (s: string) => `Did you mean “${s}”?`,
    pt: (s: string) => `Você quis dizer “${s}”?`,
  },
  expectedFound: {
    en: (e: string, f: string) => `Expected ${e}, but found ${f}.`,
    pt: (e: string, f: string) => `Esperava ${e}, mas encontrou ${f}.`,
  },
  unterminatedString: {
    en: () => 'Unclosed string — this quote (") is never closed.',
    pt: () => 'String sem fechar — esta aspa (") nunca é fechada.',
  },
  unterminatedBrace: {
    en: () => "The “{ … }” block of this define was never closed — add the missing “}”.",
    pt: () => "O bloco “{ … }” deste define não foi fechado — falta o “}”.",
  },
  unknownLabel: {
    en: (l: string) =>
      `The label “${l}” doesn't exist. Labels must be defined before use, e.g. ${l}: box`,
    pt: (l: string) =>
      `O rótulo “${l}” não existe. Rótulos precisam ser definidos antes do uso, ex.: ${l}: box`,
  },
  ordinalOutOfRange: {
    en: (n: string, range: string) =>
      `The ordinal “${n}” points past what was drawn (available: ${range}).`,
    pt: (n: string, range: string) =>
      `A referência ordinal “${n}” aponta além do que foi desenhado (disponível: ${range}).`,
  },
  ignoredAttribute: {
    en: (w: string) => `“${w}” is not a valid attribute here and was ignored.`,
    pt: (w: string) => `“${w}” não é um atributo válido aqui e foi ignorado.`,
  },
  unknownEffect: {
    en: (w: string, ok: string) => `Unknown animation effect “${w}”. Available: ${ok}.`,
    pt: (w: string, ok: string) => `Efeito de animação desconhecido: “${w}”. Disponíveis: ${ok}.`,
  },
  inFile: {
    en: (f: string, n: number | null) =>
      `Inside “${f}”${n !== null ? ` (line ${n})` : ""}: `,
    pt: (f: string, n: number | null) =>
      `Dentro de “${f}”${n !== null ? ` (linha ${n})` : ""}: `,
  },
};

/** Frases do compilador → linguagem do usuário (campos expected/found). */
const PHRASES: Record<string, { en: string; pt: string }> = {
  "an object": { en: "a drawing command (box, circle, line…)", pt: "um comando de desenho (box, circle, line…)" },
  "an expression": { en: "an expression (a number or formula)", pt: "uma expressão (número ou fórmula)" },
  "end of line": { en: "the end of the line", pt: "o fim da linha" },
  "end of file": { en: "the end of the file", pt: "o fim do arquivo" },
};

function phrase(raw: string, locale: Locale): string {
  const clean = raw.replace(/`/g, "");
  const known = PHRASES[clean];
  if (known) return known[locale];
  // token literal citado pelo compilador: `bxo` → “bxo”; ")" fica como está
  const quoted = /^`(.+)`$/.exec(raw);
  if (quoted) return `“${quoted[1]}”`;
  return `“${clean}”`;
}

function localizeHint(hint: string | null, locale: Locale): string | null {
  if (!hint) return null;
  const m = /did you mean `(.+)`\?/.exec(hint);
  return m ? M.didYouMean[locale](m[1]) : hint;
}

/** Interpreta um diagnóstico estruturado do compilador (erro ou warning). */
export function explainDiagnostic(
  d: RpicDiagnostic,
  source: string,
  locale: Locale,
  severity: "error" | "warning" = "error",
): ErrorInfo {
  const info = classifyDiagnostic(d, source, locale, severity);
  // Erro dentro de um arquivo incluído (`copy`, biblioteca de circuitos):
  // a posição é DO INCLUÍDO — não aponte no editor do usuário; contextualize.
  if (d.file !== null && d.file !== undefined) {
    return {
      ...info,
      line: null,
      col: null,
      tokenLength: null,
      friendly: M.inFile[locale](d.file, d.line) + info.friendly,
    };
  }
  return info;
}

function classifyDiagnostic(
  d: RpicDiagnostic,
  source: string,
  locale: Locale,
  severity: "error" | "warning",
): ErrorInfo {
  const tokenLength = d.col !== null && d.end_col !== null ? Math.max(d.end_col - d.col, 1) : null;
  const base: ErrorInfo = {
    severity,
    line: d.line,
    col: d.col,
    tokenLength,
    friendly: d.message,
    suggestion: localizeHint(d.hint, locale),
    raw: d.message,
  };
  const word = d.found ? d.found.replace(/^`|`$/g, "") : null;

  switch (d.kind) {
    case "expected_token": {
      if (d.expected === "an object" && word && /^[A-Za-z_]/.test(word)) {
        const suggestion = base.suggestion ?? maybeSuggest(word, source, locale);
        return { ...base, friendly: M.unknownCommand[locale](word), suggestion };
      }
      return {
        ...base,
        friendly: M.expectedFound[locale](phrase(d.expected ?? "?", locale), phrase(d.found ?? "?", locale)),
      };
    }
    case "unterminated_string":
      return { ...base, friendly: M.unterminatedString[locale]() };
    case "unknown_label":
      return { ...base, friendly: M.unknownLabel[locale](word ?? "?") };
    case "ordinal_out_of_range":
      return { ...base, friendly: M.ordinalOutOfRange[locale](word ?? "?", d.expected ?? "?") };
    case "ignored_attribute": {
      const suggestion = base.suggestion ?? maybeSuggest(word ?? "", source, locale);
      return { ...base, friendly: M.ignoredAttribute[locale](word ?? "?"), suggestion };
    }
    case "unknown_animation_effect":
      return { ...base, friendly: M.unknownEffect[locale](word ?? "?", d.expected ?? "…") };
    case "parse":
      if (/unterminated `\{` body/.test(d.message)) {
        return { ...base, friendly: M.unterminatedBrace[locale]() };
      }
      return base;
    default:
      return base;
  }
}

function maybeSuggest(word: string, source: string, locale: Locale): string | null {
  const suggestion = suggestWord(word, source);
  return suggestion ? M.didYouMean[locale](suggestion) : null;
}

/** Fallback para erros sem diagnóstico estruturado (mensagem crua). */
export function explainRawError(raw: string, locale: Locale): ErrorInfo {
  const pos = errorPosition(raw);
  void locale;
  return {
    severity: "error",
    line: pos?.line ?? null,
    col: pos?.col ?? null,
    tokenLength: null,
    friendly: raw.replace(/^\d+:\d+:\s*/, ""),
    suggestion: null,
    raw,
  };
}
