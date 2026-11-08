// Cartões de análise do deck (`.tran`/`.ac`/`.dc`) no painel Simular (issue
// #33): o EDITOR de análise (campos de faixa/densidade escritos de volta no
// fonte pic) e a GRADE DE EXIBIÇÃO (re-run só do gráfico num deck mais denso,
// sem tocar o fonte). Puro — sem DOM, sem wasm.
import type { SourceEdit } from "./simSource";
import { parseSpiceNumber } from "./simValues";

/** Linhas lógicas de um deck: continuação SPICE (`+` no início) junta-se à
 *  anterior. */
export function logicalLines(netlist: string): string[] {
  const out: string[] = [];
  for (const raw of netlist.split(/\r?\n/)) {
    const cont = /^\s*\+(.*)$/.exec(raw);
    if (cont && out.length) out[out.length - 1] += ` ${cont[1]}`;
    else out.push(raw);
  }
  return out;
}

// ---- grade de exibição (port de dune tools/gen-examples.mjs, milkway/dune@5bbfb9a) ----

/** O número do INPevaluate: mantissa + UM sufixo de escala, o resto ignorado
 *  (`10ms` = 10m). Sem número no início → `NaN`. Port literal do dune — NÃO é
 *  o `parseSpiceNumber` do Studio (que exige o token inteiro como número). */
export function spiceNum(tok: string): number {
  const m = /^([+-]?(?:[0-9]*\.)?[0-9]+(?:e[+-]?[0-9]+)?)(meg|mil|[tgkmunpf])?/i.exec(tok);
  if (!m) return NaN;
  const scale: Readonly<Record<string, number>> = {
    "": 1,
    t: 1e12,
    g: 1e9,
    meg: 1e6,
    k: 1e3,
    mil: 25.4e-6,
    m: 1e-3,
    u: 1e-6,
    n: 1e-9,
    p: 1e-12,
    f: 1e-15,
  };
  return parseFloat(m[1]) * scale[(m[2] || "").toLowerCase()];
}

/** Pontos mínimos de todo gráfico varrido na grade de exibição. */
export const DISPLAY_PTS = 600;

/** A grade de exibição: cada varredura desenha exatamente os pontos que o
 *  cartão pede — o `.tran` cai nos pontos internos (teto TMAX =
 *  `min(tstep, span/50)` por padrão), o `.ac` na contagem dec/oct/lin, o
 *  `.dc` no passo — muitas vezes ~50 segmentos, anguloso e cortando picos. Só
 *  para o GRÁFICO, refina cada cartão para ≥ `DISPLAY_PTS` pontos (mesma
 *  engine, mesmo contrato, só mais pontos):
 *  - `.tran`: TMAX = span/600 quando o TMAX efetivo é mais grosso;
 *  - `.ac`: contagem para ≥ 600 pontos (dec/oct = por década/oitava);
 *  - `.dc`: passo da 1ª fonte = span/600 (a 2ª multiplica curvas, não pontos).
 *  Deck já denso, e cartão que não dá para ler, ficam como estão. */
export function displayDeck(deck: string): string {
  deck = deck.replace(
    /^([ \t]*)\.ac\s+(dec|oct|lin)\s+(\S+)\s+(\S+)\s+(\S+)[ \t]*$/gim,
    (line, ind: string, kind: string, n: string, f1: string, f2: string) => {
      const [np, a, b] = [spiceNum(n), spiceNum(f1), spiceNum(f2)];
      if (![np, a, b].every(Number.isFinite) || !(a > 0) || !(b > a)) return line;
      const k = kind.toLowerCase();
      const spans = k === "dec" ? Math.log10(b / a) : k === "oct" ? Math.log2(b / a) : 1;
      if (!(spans > 0) || np * spans >= DISPLAY_PTS) return line;
      return `${ind}.ac ${kind} ${Math.ceil(DISPLAY_PTS / spans)} ${f1} ${f2}`;
    },
  );
  deck = deck.replace(
    /^([ \t]*)\.dc\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)([^\r\n]*)/gim,
    (line, ind: string, src: string, s0: string, s1: string, st: string, rest: string) => {
      const [a, b, step] = [spiceNum(s0), spiceNum(s1), spiceNum(st)];
      if (![a, b, step].every(Number.isFinite) || !((b - a) / step > 0)) return line;
      if (Math.abs((b - a) / step) >= DISPLAY_PTS) return line;
      return `${ind}.dc ${src} ${s0} ${s1} ${((b - a) / DISPLAY_PTS).toExponential(6)}${rest}`;
    },
  );
  return deck.replace(/^([ \t]*)\.tran\b([^\r\n]*)/gim, (line, ind: string, rest: string) => {
    const toks = rest.trim().split(/\s+/).filter(Boolean);
    const uic = toks.length && /^uic$/i.test(toks[toks.length - 1]) ? toks.pop() : "";
    if (toks.length < 2 || toks.length > 4 || toks.some((t) => !Number.isFinite(spiceNum(t)))) {
      return line;
    }
    const [tstep, tstop] = [spiceNum(toks[0]), spiceNum(toks[1])];
    const tstart = toks.length > 2 ? spiceNum(toks[2]) : 0;
    const span = tstop - tstart;
    if (!(span > 0)) return line;
    const effTmax = toks.length > 3 ? spiceNum(toks[3]) : Math.min(tstep, span / 50);
    if (!(effTmax > span / DISPLAY_PTS)) return line; // já denso
    const tmax = (span / DISPLAY_PTS).toExponential(6);
    return `${ind}.tran ${toks[0]} ${toks[1]} ${toks.length > 2 ? toks[2] : "0"} ${tmax}${uic ? " uic" : ""}`;
  });
}

// ---- editor de análise: os cartões como campos ----

/** Campo editável de um cartão. `range` = faixa, `density` = densidade. */
export type CardFieldKey =
  "tstart" | "tstop" | "tstep" | "tmax" | "fstart" | "fstop" | "points" | "start" | "stop" | "step";

export interface CardField {
  key: CardFieldKey;
  group: "range" | "density";
  /** Índice do argumento (após a palavra-chave) no cartão. */
  arg: number;
  /** O argumento está escrito? (`tstart` ausente = 0, inserido ao editar.) */
  present: boolean;
  /** Como está escrito (`"0"` quando ausente). */
  text: string;
  value: number;
}

/** Um cartão de análise do netlist. `fields` vazio = só leitura. */
export interface AnalysisCard {
  /** `tran`, `ac`, `dc`, `op`… (minúsculo). */
  type: string;
  /** Ordem do cartão entre os do MESMO tipo no netlist (0 = o 1º). */
  ordinal: number;
  /** A linha lógica como está no netlist (continuações juntadas). */
  text: string;
  /** Tokens após a palavra-chave. */
  args: string[];
  /** Rótulo curto: `.tran`, `.ac dec`, `.dc V1`. */
  chip: string;
  fields: CardField[];
  /** Por que um `.tran`/`.ac`/`.dc` não é editável (`form`: argumentos que não
   *  são números SPICE simples — `{param}`, forma exótica); `analysis`: tipo
   *  sem editor (`.op`, `.tf`, `.noise`…). `null` = editável. */
  readonly: null | "form" | "analysis";
}

/** Análises que o painel lista (as outras diretivas — `.model`, `.measure`,
 *  `.options`… — não são análises). */
const ANALYSES = new Set([
  "tran",
  "ac",
  "dc",
  "op",
  "tf",
  "noise",
  "pss",
  "sens",
  "pz",
  "disto",
  "sp",
]);
const EDITABLE = new Set(["tran", "ac", "dc"]);

/** Número SPICE SIMPLES (o token inteiro: `1u`, `5meg`, `10ms`); `{p}`,
 *  variável, expressão → `null`. */
const plain = (tok: string | undefined): number | null =>
  tok === undefined ? null : parseSpiceNumber(tok);

function fieldsOf(type: string, args: string[]): CardField[] | null {
  const f = (key: CardFieldKey, group: CardField["group"], arg: number): CardField | null => {
    const v = plain(args[arg]);
    return v === null ? null : { key, group, arg, present: true, text: args[arg], value: v };
  };
  const all = (xs: (CardField | null)[]) =>
    xs.every((x) => x !== null) ? (xs as CardField[]) : null;
  if (type === "tran") {
    const nums = /^uic$/i.test(args.at(-1) ?? "") ? args.slice(0, -1) : args;
    if (nums.length < 2 || nums.length > 4) return null;
    const out = all([f("tstep", "density", 0), f("tstop", "range", 1)]);
    if (!out) return null;
    const tstart: CardField | null =
      nums.length > 2
        ? f("tstart", "range", 2)
        : { key: "tstart", group: "range", arg: 2, present: false, text: "0", value: 0 };
    const tmax = nums.length > 3 ? f("tmax", "density", 3) : null;
    if (!tstart || (nums.length > 3 && !tmax)) return null;
    return [tstart, out[1], out[0], ...(tmax ? [tmax] : [])];
  }
  if (type === "ac") {
    if (args.length !== 4 || !/^(dec|oct|lin)$/i.test(args[0])) return null;
    return all([f("fstart", "range", 2), f("fstop", "range", 3), f("points", "density", 1)]);
  }
  if (type === "dc") {
    // `SRC START STOP STEP [SRC2 START2 STOP2 STEP2]`: só a 1ª fonte; a 2ª
    // (e o que vier depois) fica como está
    if (args.length !== 4 && args.length !== 8) return null;
    if (/^list$/i.test(args[1] ?? "")) return null;
    return all([f("start", "range", 1), f("stop", "range", 2), f("step", "density", 3)]);
  }
  return null;
}

/** Os cartões de análise do netlist, na ordem, com os campos editáveis. */
export function analysisCards(netlist: string): AnalysisCard[] {
  const out: AnalysisCard[] = [];
  const seen = new Map<string, number>();
  for (const line of logicalLines(netlist)) {
    const toks = line.trim().split(/\s+/);
    const m = /^\.([a-z]+)$/i.exec(toks[0] ?? "");
    if (!m) continue;
    const type = m[1].toLowerCase();
    if (!ANALYSES.has(type)) continue;
    const ordinal = seen.get(type) ?? 0;
    seen.set(type, ordinal + 1);
    const args = toks.slice(1);
    const fields = EDITABLE.has(type) ? fieldsOf(type, args) : null;
    const chip =
      type === "ac" && /^(dec|oct|lin)$/i.test(args[0] ?? "")
        ? `.ac ${args[0].toLowerCase()}`
        : type === "dc" && args[0]
          ? `.dc ${args[0]}`
          : `.${type}`;
    out.push({
      type,
      ordinal,
      text: line.trim(),
      args,
      chip,
      fields: fields ?? [],
      readonly: fields ? null : EDITABLE.has(type) ? "form" : "analysis",
    });
  }
  return out;
}

/** O valor de um campo é aceitável junto com os outros campos do cartão?
 *  (tran: passo > 0, 0 ≤ início < fim, TMAX > 0; ac: pontos inteiros ≥ 1,
 *  0 < fstart < fstop; dc: passo ≠ 0 andando de start a stop.) */
export function validField(card: AnalysisCard, key: CardFieldKey, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const v = (k: CardFieldKey) =>
    k === key ? value : (card.fields.find((f) => f.key === k)?.value ?? NaN);
  switch (card.type) {
    case "tran":
      if (key === "tmax") return value > 0;
      return v("tstep") > 0 && v("tstart") >= 0 && v("tstop") > v("tstart");
    case "ac":
      return (
        Number.isInteger(v("points")) &&
        v("points") >= 1 &&
        v("fstart") > 0 &&
        v("fstop") > v("fstart")
      );
    case "dc": {
      const step = v("step");
      return step !== 0 && (v("stop") - v("start")) / step >= 0;
    }
    default:
      return false;
  }
}

/** Por que o cartão não pode ser escrito no fonte. */
export type CardWriteFailure =
  | "not-found" // não há o n-ésimo cartão desse tipo no fonte (gerado por macro?)
  | "mismatch" // o texto no fonte difere do do netlist (macro, fonte mudou)
  | "count" // nº de cartões desse tipo difere entre fonte e netlist
  | "readonly" // cartão sem campos editáveis
  | "invalid"; // valor que não é número SPICE / fora da faixa

interface SourceToken {
  text: string;
  from: number;
  to: number;
}

/** Os cartões lógicos `.<tipo>` do FONTE pic, em ordem, com os tokens e
 *  offsets UTF-16 (a palavra-chave inclusa; o `+` das continuações não). O
 *  netlist copia as linhas `.` da coluna 1 verbatim e na ordem do fonte. */
function sourceCards(source: string, type: string): SourceToken[][] {
  const head = new RegExp(String.raw`^[ \t]*\.${type}\b`, "i");
  const lines: { text: string; from: number }[] = [];
  let at = 0;
  for (const text of source.split("\n")) {
    lines.push({ text, from: at });
    at += text.length + 1;
  }
  const tokensOf = (text: string, base: number, skip = 0): SourceToken[] =>
    [...text.slice(skip).matchAll(/\S+/g)].map((m) => ({
      text: m[0],
      from: base + skip + m.index,
      to: base + skip + m.index + m[0].length,
    }));
  const out: SourceToken[][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!head.test(lines[i].text)) continue;
    const toks = tokensOf(lines[i].text, lines[i].from);
    while (i + 1 < lines.length && /^[ \t]*\+/.test(lines[i + 1].text)) {
      i++;
      const plus = lines[i].text.indexOf("+");
      toks.push(...tokensOf(lines[i].text, lines[i].from, plus + 1));
    }
    out.push(toks);
  }
  return out;
}

/** Acha no fonte o cartão do netlist: o n-ésimo `.<tipo>` lógico, CONFERIDO
 *  token a token (espaços normalizados) — e o fonte tem de ter tantos
 *  cartões desse tipo quanto o netlist (`total`). */
export function locateCard(
  source: string,
  card: AnalysisCard,
  total: number,
): { ok: true; tokens: SourceToken[] } | { ok: false; reason: CardWriteFailure } {
  const cards = sourceCards(source, card.type);
  const toks = cards[card.ordinal];
  if (!toks) return { ok: false, reason: "not-found" };
  if (cards.length !== total) return { ok: false, reason: "count" };
  if (toks.map((t) => t.text).join(" ") !== card.text.split(/\s+/).join(" ")) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, tokens: toks };
}

/** Por que o cartão é só leitura neste fonte (`null` = editável). */
export function cardReadOnly(
  source: string,
  card: AnalysisCard,
  cards: readonly AnalysisCard[],
): CardWriteFailure | null {
  if (card.readonly) return "readonly";
  const r = locateCard(source, card, cards.filter((c) => c.type === card.type).length);
  return r.ok ? null : r.reason;
}

export type CardEditResult =
  | { ok: true; edit: SourceEdit; written: string; card: string }
  | { ok: false; reason: CardWriteFailure };

/** A grafia escrita: a do usuário (sem espaços), `µ` → `u` (o SPICE não lê `µ`). */
const spelling = (text: string) => text.trim().replace(/[µμ]/g, "u");

/** A edição que escreve `text` no campo `key` do cartão, no fonte. UMA troca
 *  de texto: o token do campo (ou, `tstart` ausente, a inserção logo após o
 *  TSTOP — `uic` e o resto ficam). Os outros tokens ficam como escritos. */
export function cardEdit(
  source: string,
  card: AnalysisCard,
  cards: readonly AnalysisCard[],
  key: CardFieldKey,
  text: string,
): CardEditResult {
  const field = card.fields.find((f) => f.key === key);
  if (!field) return { ok: false, reason: "readonly" };
  const written = spelling(text);
  const value = parseSpiceNumber(written);
  if (value === null || /\s/.test(written) || !validField(card, key, value)) {
    return { ok: false, reason: "invalid" };
  }
  const loc = locateCard(source, card, cards.filter((c) => c.type === card.type).length);
  if (!loc.ok) return loc;
  // tokens[0] = `.tran`; o argumento i é tokens[i + 1]
  let edit: SourceEdit;
  if (field.present) {
    const tok = loc.tokens[field.arg + 1];
    edit = { from: tok.from, to: tok.to, insert: written };
  } else {
    const prev = loc.tokens[field.arg]; // o argumento anterior (TSTOP)
    edit = { from: prev.to, to: prev.to, insert: ` ${written}` };
  }
  const args = [...card.args];
  if (field.present) args[field.arg] = written;
  else args.splice(field.arg, 0, written);
  return { ok: true, edit, written, card: [card.text.split(/\s+/)[0], ...args].join(" ") };
}
