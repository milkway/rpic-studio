// Forma de onda de uma fonte independente (`PULSE(…)`, `SIN(…)`, `EXP(…)`,
// `SFFM(…)`, `PWL(…)`): os argumentos como campos editáveis. Uma fonte só com
// forma de onda não tem valor escalar — o slider (`sessionControls`) a deixa
// de fora —, então o painel a edita NO FONTE: cada campo reescreve o seu
// argumento dentro do valor da chamada (`V1: vsource(…, PULSE(0 5 …))`) e a
// sessão reabre no texto novo, como o editor de análise. Puro — sem DOM, sem
// wasm.
//
// Posições: o `value = {span, text}` do `OverlayMap` (o argumento de valor
// como escrito no fonte do usuário), conferido contra o texto antes de
// qualquer leitura ou troca — span velho = nada, nunca uma troca no lugar
// errado.
import type { OverlayMap } from "./dune";
import { LITERAL, locate, shiftMap, type SourceEdit } from "./simSource";
import { parseSpiceNumber } from "./simValues";

export type WaveFn = "pulse" | "sin" | "exp" | "sffm" | "pwl";

/** O que um argumento mede: a grandeza da fonte (V ou A), tempo, frequência,
 *  amortecimento (1/s), ângulo (°) ou adimensional. */
export type WaveQuantity = "level" | "time" | "freq" | "damping" | "angle" | "none";

/** Argumentos de cada função, na ordem do SPICE (ngspice): nome e grandeza. */
const SPEC: Readonly<Record<Exclude<WaveFn, "pwl">, readonly (readonly [string, WaveQuantity])[]>> = {
  pulse: [
    ["v1", "level"],
    ["v2", "level"],
    ["td", "time"],
    ["tr", "time"],
    ["tf", "time"],
    ["pw", "time"],
    ["per", "time"],
    ["np", "none"],
  ],
  sin: [
    ["vo", "level"],
    ["va", "level"],
    ["freq", "freq"],
    ["td", "time"],
    ["theta", "damping"],
    ["phase", "angle"],
  ],
  exp: [
    ["v1", "level"],
    ["v2", "level"],
    ["td1", "time"],
    ["tau1", "time"],
    ["td2", "time"],
    ["tau2", "time"],
  ],
  sffm: [
    ["vo", "level"],
    ["va", "level"],
    ["fc", "freq"],
    ["mdi", "none"],
    ["fs", "freq"],
    ["phasec", "angle"],
    ["phases", "angle"],
  ],
};

export interface WaveArg {
  index: number;
  /** Nome SPICE do argumento (`v1`, `td`, `per`…; no PWL `t1`, `v1`, `t2`…). */
  name: string;
  quantity: WaveQuantity;
  /** Como escrito no fonte. */
  text: string;
  /** Valor numérico; `null` = não é número literal (variável, expressão). */
  value: number | null;
  /** Offsets UTF-16 `[from, to)` do argumento no fonte. */
  from: number;
  to: number;
}

export interface SourceWaveform {
  refdes: string;
  fn: WaveFn;
  /** Unidade da grandeza da fonte: `V` (fonte de tensão) ou `A` (de corrente). */
  unit: "V" | "A";
  args: WaveArg[];
}

const CALL = /\b(pulse|sin|exp|sffm|pwl)\s*\(([^()]*)\)/i;

/** Nome e grandeza do argumento `index` de `fn`. */
function argSpec(fn: WaveFn, index: number): readonly [string, WaveQuantity] {
  if (fn === "pwl") {
    const n = Math.floor(index / 2) + 1;
    return index % 2 === 0 ? [`t${n}`, "time"] : [`v${n}`, "level"];
  }
  return SPEC[fn][index] ?? [`#${index + 1}`, "none"];
}

/** A forma de onda grafada no valor da fonte `refdes` (V ou I), com os
 *  argumentos localizados em `source`. `null`: não é fonte, o mapa não dá o
 *  valor, o span não bate com o texto (fonte mudou) ou não há função. */
export function waveformOf(source: string, map: OverlayMap, refdes: string): SourceWaveform | null {
  const kind = refdes[0]?.toUpperCase();
  if (kind !== "V" && kind !== "I") return null;
  const lower = refdes.toLowerCase();
  const el = map.elements.find((e) => e.refdes.toLowerCase() === lower);
  if (!el?.value) return null;
  const at = locate(source, el.value);
  if (!at) return null;
  const call = CALL.exec(el.value.text);
  if (!call) return null;
  const fn = call[1].toLowerCase() as WaveFn;
  // início da lista de argumentos dentro do texto do valor
  const listStart = call.index + call[0].indexOf("(") + 1;
  const args: WaveArg[] = [];
  for (const m of call[2].matchAll(/[^\s,]+/g)) {
    const [name, quantity] = argSpec(fn, args.length);
    const from = at.from + listStart + m.index;
    args.push({
      index: args.length,
      name,
      quantity,
      text: m[0],
      value: LITERAL.test(m[0]) ? parseSpiceNumber(m[0]) : null,
      from,
      to: from + m[0].length,
    });
  }
  if (args.length === 0) return null;
  return { refdes: el.refdes, fn, unit: kind === "V" ? "V" : "A", args };
}

/** As fontes com forma de onda do mapa (na ordem dos elementos). */
export function waveformSources(source: string, map: OverlayMap): SourceWaveform[] {
  const out: SourceWaveform[] = [];
  for (const el of map.elements) {
    const w = waveformOf(source, map, el.refdes);
    if (w) out.push(w);
  }
  return out;
}

export type WaveEditFailure =
  | "no-wave" // a fonte não tem (mais) forma de onda localizável neste texto
  | "no-arg" // o argumento não existe
  | "not-literal" // o argumento no fonte não é um número literal
  | "invalid"; // o texto digitado não é um número SPICE

export type WaveEditResult =
  | { ok: true; edit: SourceEdit; written: string; map: OverlayMap }
  | { ok: false; reason: WaveEditFailure };

/** (linha, coluna em codepoints), 1-based, de um offset UTF-16. */
function lineColOf(source: string, offset: number): { line: number; col: number } {
  const before = source.slice(0, offset);
  const start = before.lastIndexOf("\n") + 1;
  return {
    line: before.split("\n").length,
    col: Array.from(before.slice(start)).length + 1,
  };
}

/** A edição que escreve `text` no argumento `index` da forma de onda de
 *  `refdes`. O texto digitado vai como está (`3`, `2.5m`, `1meg`) se for um
 *  número SPICE; o `map` devolvido vale para o texto novo até a próxima
 *  execução. */
export function waveEdit(
  source: string,
  map: OverlayMap,
  refdes: string,
  index: number,
  text: string,
): WaveEditResult {
  const wave = waveformOf(source, map, refdes);
  if (!wave) return { ok: false, reason: "no-wave" };
  const arg = wave.args[index];
  if (!arg) return { ok: false, reason: "no-arg" };
  if (arg.value === null) return { ok: false, reason: "not-literal" };
  const written = text.trim().replace("−", "-");
  if (!LITERAL.test(written) || parseSpiceNumber(written) === null) {
    return { ok: false, reason: "invalid" };
  }
  const { line, col } = lineColOf(source, arg.from);
  return {
    ok: true,
    edit: { from: arg.from, to: arg.to, insert: written },
    written,
    map: shiftMap(map, line, col, arg.text, written),
  };
}
