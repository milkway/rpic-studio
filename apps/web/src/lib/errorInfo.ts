// Interpreta as mensagens de erro do compilador rpic para UX: posição e
// extensão precisas, texto humano localizado e sugestões de "você quis
// dizer…?" por distância de edição. Formatos catalogados do compilador real:
//   1:1: expected an object, found Name("bxo")
//   1:13: expected Rparen, found Newline
//   2:1: unterminated string literal
//   1:1: define: unterminated `{` body
//   unknown label `A`             (sem posição — fase de avaliação)
//   ordinal out of range          (sem posição)
//   1:2: unexpected character `@`
import type { Locale } from "./i18n";
import { errorPosition } from "./rpic";

// Vocabulário da linguagem (mesmas listas da gramática) para sugestões.
const PRIMITIVES = "box circle ellipse line arrow arc spline move brace dot".split(" ");
const CONTROL = "define undef if then else for do copy print reset animate".split(" ");
const COMMON_CIRCUITS =
  "resistor capacitor inductor battery diode ground wire lamp fuse switch opamp and_gate or_gate xor_gate nand_gate nor_gate not_gate transformer relay motor led".split(
    " ",
  );

/** Tokens internos do parser → como o usuário os digita. */
const TOKEN_NAMES: Record<string, { en: string; pt: string }> = {
  Rparen: { en: "a closing “)”", pt: "um “)” de fechamento" },
  Lparen: { en: "an opening “(”", pt: "um “(” de abertura" },
  RightBrace: { en: "a closing “}”", pt: "um “}” de fechamento" },
  LeftBrace: { en: "an opening “{”", pt: "um “{” de abertura" },
  Newline: { en: "the end of the line", pt: "o fim da linha" },
  Eof: { en: "the end of the file", pt: "o fim do arquivo" },
  Do: { en: "the keyword “do”", pt: "a palavra-chave “do”" },
  Then: { en: "the keyword “then”", pt: "a palavra-chave “then”" },
  Comma: { en: "a comma", pt: "uma vírgula" },
};

function tokenLabel(raw: string, locale: Locale): string {
  const known = TOKEN_NAMES[raw];
  if (known) return known[locale];
  const name = /^Name\("(.+)"\)$/.exec(raw);
  if (name) return `“${name[1]}”`;
  const str = /^Str\("(.+)"\)$/.exec(raw);
  if (str) return `"${str[1]}"`;
  return `“${raw}”`;
}

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
  /** 1-based; null quando o compilador não informa (fase de avaliação). */
  line: number | null;
  col: number | null;
  /** Comprimento do token ofensor (sublinhado preciso), quando conhecido. */
  tokenLength: number | null;
  /** Mensagem humana localizada. */
  friendly: string;
  /** Sugestão de correção ("você quis dizer…?"), quando houver. */
  suggestion: string | null;
  /** Mensagem original do compilador (para quem quiser o detalhe). */
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
    en: () => "Unclosed string — a closing quote (\") is missing on the previous line.",
    pt: () => 'String sem fechar — falta a aspa (") de fechamento na linha anterior.',
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
    en: () => "An ordinal reference points past what was drawn (e.g. “3rd box” with only 2).",
    pt: () =>
      "Uma referência ordinal aponta além do que foi desenhado (ex.: “3rd box” com só 2).",
  },
  unexpectedChar: {
    en: (c: string) => `Unexpected character “${c}”.`,
    pt: (c: string) => `Caractere inesperado: “${c}”.`,
  },
};

/** Interpreta a mensagem crua do compilador. */
export function explainError(raw: string, source: string, locale: Locale): ErrorInfo {
  const pos = errorPosition(raw);
  const base: ErrorInfo = {
    line: pos?.line ?? null,
    col: pos?.col ?? null,
    tokenLength: null,
    friendly: raw.replace(/^\d+:\d+:\s*/, ""),
    suggestion: null,
    raw,
  };
  const body = raw.replace(/^\d+:\d+:\s*/, "");

  let m = /^expected an object, found Name\("(.+)"\)$/.exec(body);
  if (m) {
    const word = m[1];
    const suggestion = suggestWord(word, source);
    return {
      ...base,
      tokenLength: word.length,
      friendly: M.unknownCommand[locale](word),
      suggestion: suggestion ? M.didYouMean[locale](suggestion) : null,
    };
  }

  m = /^expected (.+?), found (.+)$/.exec(body);
  if (m) {
    const found = /^Name\("(.+)"\)$/.exec(m[2]);
    return {
      ...base,
      tokenLength: found ? found[1].length : null,
      friendly: M.expectedFound[locale](
        tokenLabel(m[1].replace(/^an? /, "").replace(/`/g, ""), locale),
        tokenLabel(m[2], locale),
      ),
    };
  }

  if (/unterminated string literal/.test(body)) {
    return { ...base, friendly: M.unterminatedString[locale]() };
  }

  if (/unterminated `\{` body/.test(body)) {
    return { ...base, friendly: M.unterminatedBrace[locale]() };
  }

  m = /^unknown label `(.+)`$/.exec(body);
  if (m) {
    const label = m[1];
    // O compilador não informa a posição — localiza a primeira ocorrência.
    const found = findWord(source, label);
    return {
      ...base,
      line: found?.line ?? base.line,
      col: found?.col ?? base.col,
      tokenLength: label.length,
      friendly: M.unknownLabel[locale](label),
    };
  }

  if (/ordinal out of range/.test(body)) {
    const found = findOrdinal(source);
    return {
      ...base,
      line: found?.line ?? base.line,
      col: found?.col ?? base.col,
      tokenLength: found?.length ?? null,
      friendly: M.ordinalOutOfRange[locale](),
    };
  }

  m = /^unexpected character `(.+)`$/.exec(body);
  if (m) {
    return { ...base, tokenLength: 1, friendly: M.unexpectedChar[locale](m[1]) };
  }

  return base;
}

function findWord(source: string, word: string): { line: number; col: number } | null {
  const lines = source.split("\n");
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) return { line: i + 1, col: m.index + 1 };
  }
  return null;
}

function findOrdinal(source: string): { line: number; col: number; length: number } | null {
  const lines = source.split("\n");
  const re = /\b(\d+(?:st|nd|rd|th)(?:\s+last)?|last)\s+\w+/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) return { line: i + 1, col: m.index + 1, length: m[0].length };
  }
  return null;
}
