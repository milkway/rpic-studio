// Paleta de circuitos: catálogo dos elementos da biblioteca nativa de
// circuitos (`rpic -c` / `copy "circuits"`) e a lógica de inserção no código
// pic. Cada elemento é um macro de DOIS pontos (ex.: `resistor(A,B)`) ou
// centrado num único ponto (`ground`, `npn`, `pnp`) — ver
// `crates/core/src/std/circuits.pic` no repo rpic-lang. Sintaxe de cada
// macro conferida compilando no WASM real (ver relatório da tarefa).
//
// Os pontos inseridos usam o prefixo `Ckt{n}` (n crescente, lido do próprio
// código-fonte) para nunca colidir com nomes que o usuário já tenha definido,
// e para empilhar elementos sucessivos em linhas diferentes em vez de
// desenhar todos em cima uns dos outros.

export type CircuitGroup = "passive" | "source" | "semiconductor" | "connector";

export interface CircuitElement {
  id: string;
  group: CircuitGroup;
  label: { en: string; pt: string };
  /** Nome do macro pic da biblioteca `circuits` (ex.: "resistor"). */
  macro: string;
  /** 2 = dois terminais (A,B); 1 = centrado num único ponto. */
  terminals: 1 | 2;
}

export const CIRCUIT_GROUPS: CircuitGroup[] = ["passive", "source", "semiconductor", "connector"];

export const CIRCUIT_ELEMENTS: CircuitElement[] = [
  // --- Passivos --------------------------------------------------------
  {
    id: "resistor",
    group: "passive",
    label: { en: "Resistor", pt: "Resistor" },
    macro: "resistor",
    terminals: 2,
  },
  {
    id: "capacitor",
    group: "passive",
    label: { en: "Capacitor", pt: "Capacitor" },
    macro: "capacitor",
    terminals: 2,
  },
  {
    id: "inductor",
    group: "passive",
    label: { en: "Inductor", pt: "Indutor" },
    macro: "inductor",
    terminals: 2,
  },
  {
    id: "potentiometer",
    group: "passive",
    label: { en: "Potentiometer", pt: "Potenciômetro" },
    macro: "potentiometer",
    terminals: 2,
  },
  // --- Fontes ------------------------------------------------------------
  {
    id: "battery",
    group: "source",
    label: { en: "Battery", pt: "Bateria" },
    macro: "battery",
    terminals: 2,
  },
  {
    id: "ac_source",
    group: "source",
    label: { en: "AC source", pt: "Fonte CA" },
    macro: "ac_source",
    terminals: 2,
  },
  {
    id: "ground",
    group: "source",
    label: { en: "Ground", pt: "Terra" },
    macro: "ground",
    terminals: 1,
  },
  // --- Semicondutores ------------------------------------------------------
  {
    id: "diode",
    group: "semiconductor",
    label: { en: "Diode", pt: "Diodo" },
    macro: "diode",
    terminals: 2,
  },
  {
    id: "led",
    group: "semiconductor",
    label: { en: "LED", pt: "LED" },
    macro: "led",
    terminals: 2,
  },
  {
    id: "zener",
    group: "semiconductor",
    label: { en: "Zener diode", pt: "Diodo zener" },
    macro: "zener",
    terminals: 2,
  },
  {
    id: "npn",
    group: "semiconductor",
    label: { en: "NPN transistor", pt: "Transistor NPN" },
    macro: "npn",
    terminals: 1,
  },
  {
    id: "pnp",
    group: "semiconductor",
    label: { en: "PNP transistor", pt: "Transistor PNP" },
    macro: "pnp",
    terminals: 1,
  },
  // --- Conectores ----------------------------------------------------------
  {
    id: "wire",
    group: "connector",
    label: { en: "Wire", pt: "Fio" },
    macro: "wire",
    terminals: 2,
  },
  {
    id: "switch",
    group: "connector",
    label: { en: "Switch", pt: "Chave" },
    macro: "switch",
    terminals: 2,
  },
];

const POINT_PREFIX = "Ckt";
const STEP_Y = 0.9;
const SPAN_X = 1.3;

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** Próximo índice livre: lê o maior sufixo `Ckt<n>` já usado no código. */
function nextIndex(source: string): number {
  const re = new RegExp(`${POINT_PREFIX}(\\d+)[ab]?\\s*:`, "g");
  let max = 0;
  for (const m of source.matchAll(re)) max = Math.max(max, Number(m[1]));
  return max + 1;
}

/** Gera o trecho pic do elemento: pontos novos + chamada do macro. */
function buildSnippet(el: CircuitElement, n: number): string {
  const y = num(0 - (n - 1) * STEP_Y);
  const a = `${POINT_PREFIX}${n}a`;
  if (el.terminals === 1) {
    return `# ${el.macro} (circuit palette)\n${a}: (0, ${y})\n${el.macro}(${a})`;
  }
  const b = `${POINT_PREFIX}${n}b`;
  return (
    `# ${el.macro} (circuit palette)\n` +
    `${a}: (0, ${y})\n${b}: (${num(SPAN_X)}, ${y})\n${el.macro}(${a}, ${b})`
  );
}

/** Garante (idempotente) `copy "circuits"` logo após `.PS`. É a grafia do
 *  código-fonte equivalente ao flag `-c`/`circuits` — o compilador aceita os
 *  dois juntos sem carregar a biblioteca em dobro. */
export function ensureCircuitsCopy(source: string): string {
  if (/copy\s+"circuits"/.test(source)) return source;
  const psMatch = /^[^\n]*\.PS[^\n]*\n/m.exec(source);
  if (psMatch) {
    const at = psMatch.index + psMatch[0].length;
    return `${source.slice(0, at)}copy "circuits"\n${source.slice(at)}`;
  }
  // Sem `.PS` ainda (ex.: código apagado) — escreve o cabeçalho mínimo.
  return `.PS\ncopy "circuits"\n${source.replace(/^\n+/, "")}`;
}

/** Insere o elemento escolhido: garante `copy "circuits"` e adiciona o
 *  snippet logo antes de `.PE` (ou cria a diretiva, se ainda não existir). */
export function insertCircuitElement(source: string, el: CircuitElement): string {
  const withCopy = ensureCircuitsCopy(source);
  const snippet = buildSnippet(el, nextIndex(withCopy));

  const peMatch = /\.PE\s*$/m.exec(withCopy);
  if (peMatch) {
    const at = peMatch.index;
    const before = withCopy.slice(0, at).replace(/\n*$/, "\n\n");
    return `${before}${snippet}\n${withCopy.slice(at)}`;
  }
  return `${withCopy.replace(/\n*$/, "\n")}\n${snippet}\n.PE\n`;
}
