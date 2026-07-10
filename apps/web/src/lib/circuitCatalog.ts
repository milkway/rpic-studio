// Paleta de circuitos: catálogo COMPLETO dos elementos da biblioteca nativa de
// circuitos (`rpic -c` / `copy "circuits"`) e a lógica de inserção no código
// pic — as ~80 macros públicas de `crates/core/src/std/circuits.pic` no repo
// rpic-lang (as `__privadas` ficam de fora). Assinaturas por convenção da
// biblioteca: DOIS pontos (`resistor(A,B)`), UM ponto central (`ground(P)`,
// gates, transistores), TRÊS pontos (`spdt(comum, fechado, aberto)`) e as que
// levam uma STRING final (`meter(A,B,"V")`, `ic_block(C,"nome")`,
// `iecgate(C,"&")`, `clabel(P,"v1")`). O teste `circuitCatalog.test.ts`
// compila TODO snippet no WASM real — se a biblioteca mudar, ele acusa.
//
// Os pontos inseridos usam o prefixo `Ckt{n}` (n crescente, lido do próprio
// código-fonte) para nunca colidir com nomes que o usuário já tenha definido,
// e para empilhar elementos sucessivos em linhas diferentes em vez de
// desenhar todos em cima uns dos outros.

export type CircuitGroup =
  | "passive"
  | "source"
  | "semiconductor"
  | "logic"
  | "measure"
  | "electromech"
  | "connector";

export interface CircuitElement {
  id: string;
  group: CircuitGroup;
  label: { en: string; pt: string };
  /** Nome do macro pic da biblioteca `circuits` (= id). */
  macro: string;
  /** 2 = dois terminais (A,B); 1 = centrado num ponto; 3 = comum + 2 saídas (spdt). */
  terminals: 1 | 2 | 3;
  /** Argumento string final, quando o macro pede (ex.: `"V"` do meter). */
  extra?: string;
}

export const CIRCUIT_GROUPS: CircuitGroup[] = [
  "passive",
  "source",
  "semiconductor",
  "logic",
  "measure",
  "electromech",
  "connector",
];

function el(
  group: CircuitGroup,
  macro: string,
  en: string,
  pt: string,
  terminals: 1 | 2 | 3 = 2,
  extra?: string,
): CircuitElement {
  return { id: macro, group, label: { en, pt }, macro, terminals, ...(extra !== undefined ? { extra } : {}) };
}

export const CIRCUIT_ELEMENTS: CircuitElement[] = [
  // --- Passivos ------------------------------------------------------------
  el("passive", "resistor", "Resistor", "Resistor"),
  el("passive", "iec_resistor", "Resistor (IEC box)", "Resistor (caixa IEC)"),
  el("passive", "capacitor", "Capacitor", "Capacitor"),
  el("passive", "polcap", "Polarized capacitor", "Capacitor polarizado"),
  el("passive", "varcap", "Variable capacitor", "Capacitor variável"),
  el("passive", "inductor", "Inductor", "Indutor"),
  el("passive", "varind", "Variable inductor", "Indutor variável"),
  el("passive", "potentiometer", "Potentiometer", "Potenciômetro"),
  el("passive", "thermistor", "Thermistor", "Termistor"),
  el("passive", "ldr", "Photoresistor (LDR)", "Fotoresistor (LDR)"),
  el("passive", "varistor", "Varistor (VDR)", "Varistor (VDR)"),
  el("passive", "crystal", "Quartz crystal", "Cristal de quartzo"),
  el("passive", "fuse", "Fuse", "Fusível"),
  el("passive", "tline", "Transmission line", "Linha de transmissão"),
  el("passive", "ebox", "Generic element (box)", "Elemento genérico (caixa)"),
  // --- Fontes ----------------------------------------------------------------
  el("source", "battery", "Battery", "Bateria"),
  el("source", "ac_source", "AC source", "Fonte CA"),
  el("source", "voltage_source", "Voltage source", "Fonte de tensão"),
  el("source", "current_source", "Current source", "Fonte de corrente"),
  el("source", "isource", "Current source (arrow)", "Fonte de corrente (seta)"),
  el("source", "vsource_ctrl", "Controlled voltage source", "Fonte de tensão controlada"),
  el("source", "isource_ctrl", "Controlled current source", "Fonte de corrente controlada"),
  el("source", "solar_cell", "Solar cell", "Célula solar"),
  el("source", "generator", "Generator", "Gerador"),
  el("source", "vdd", "Supply rail (Vdd)", "Alimentação (Vdd)", 1),
  el("source", "ground", "Ground", "Terra", 1),
  el("source", "chassis_ground", "Chassis ground", "Terra de chassi", 1),
  el("source", "signal_ground", "Signal ground", "Terra de sinal", 1),
  // --- Semicondutores --------------------------------------------------------
  el("semiconductor", "diode", "Diode", "Diodo"),
  el("semiconductor", "led", "LED", "LED"),
  el("semiconductor", "zener", "Zener diode", "Diodo zener"),
  el("semiconductor", "schottky", "Schottky diode", "Diodo Schottky"),
  el("semiconductor", "photodiode", "Photodiode", "Fotodiodo"),
  el("semiconductor", "npn", "NPN transistor", "Transistor NPN", 1),
  el("semiconductor", "pnp", "PNP transistor", "Transistor PNP", 1),
  el("semiconductor", "nmos", "NMOS (enhancement)", "NMOS (enriquecimento)", 1),
  el("semiconductor", "pmos", "PMOS (enhancement)", "PMOS (enriquecimento)", 1),
  el("semiconductor", "njfet", "N-channel JFET", "JFET canal N", 1),
  el("semiconductor", "pjfet", "P-channel JFET", "JFET canal P", 1),
  el("semiconductor", "phototransistor", "Phototransistor", "Fototransistor", 1),
  el("semiconductor", "spark_gap", "Spark gap", "Centelhador"),
  // --- Lógica e CIs ----------------------------------------------------------
  el("logic", "buffer", "Buffer", "Buffer", 1),
  el("logic", "not_gate", "NOT (inverter)", "NOT (inversor)", 1),
  el("logic", "and_gate", "AND", "AND", 1),
  el("logic", "nand_gate", "NAND", "NAND", 1),
  el("logic", "or_gate", "OR", "OR", 1),
  el("logic", "nor_gate", "NOR", "NOR", 1),
  el("logic", "xor_gate", "XOR", "XOR", 1),
  el("logic", "xnor_gate", "XNOR", "XNOR", 1),
  el("logic", "ieee_buf", "Buffer (IEEE)", "Buffer (IEEE)", 1),
  el("logic", "ieee_and", "AND (IEEE)", "AND (IEEE)", 1),
  el("logic", "ieee_or", "OR (IEEE)", "OR (IEEE)", 1),
  el("logic", "ieee_xor", "XOR (IEEE)", "XOR (IEEE)", 1),
  el("logic", "iecgate", "IEC gate (label)", "Porta IEC (rótulo)", 1, "&"),
  el("logic", "opamp", "Op-amp", "Amp. operacional", 1),
  el("logic", "mux", "Multiplexer (2:1)", "Multiplexador (2:1)", 1),
  el("logic", "ic_block", "IC block", "Bloco de CI", 1, "IC1"),
  // --- Medidores e anotações ---------------------------------------------------
  el("measure", "voltmeter", "Voltmeter", "Voltímetro"),
  el("measure", "ammeter", "Ammeter", "Amperímetro"),
  el("measure", "ohmmeter", "Ohmmeter", "Ohmímetro"),
  el("measure", "meter", "Meter (letter)", "Medidor (letra)", 2, "X"),
  el("measure", "current", "Current arrow", "Seta de corrente"),
  el("measure", "voltage", "Voltage arrow", "Seta de tensão"),
  el("measure", "clabel", "Text label", "Rótulo de texto", 1, "v1"),
  // --- Eletromecânicos e transdutores -----------------------------------------
  el("electromech", "relay", "Relay", "Relé"),
  el("electromech", "motor", "Motor", "Motor"),
  el("electromech", "transformer", "Transformer", "Transformador", 1),
  el("electromech", "lamp", "Lamp", "Lâmpada"),
  el("electromech", "bell", "Bell", "Campainha"),
  el("electromech", "speaker", "Speaker", "Alto-falante"),
  el("electromech", "microphone", "Microphone", "Microfone"),
  el("electromech", "thermocouple", "Thermocouple", "Termopar"),
  // --- Conectores e chaves ------------------------------------------------------
  el("connector", "wire", "Wire", "Fio"),
  el("connector", "bus", "Bus", "Barramento"),
  el("connector", "hop", "Wire hop (crossover)", "Salto de fio (cruzamento)"),
  el("connector", "terminal", "Open terminal", "Terminal aberto", 1),
  el("connector", "antenna", "Antenna", "Antena", 1),
  el("connector", "switch", "Switch (SPST)", "Chave (SPST)"),
  el("connector", "pushbutton", "Pushbutton", "Botão de pressão"),
  el("connector", "spdt", "Switch (SPDT)", "Chave (SPDT)", 3),
];

const POINT_PREFIX = "Ckt";
const STEP_Y = 0.9;
const SPAN_X = 1.3;

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** Próximo índice livre: lê o maior sufixo `Ckt<n>` já usado no código. */
function nextIndex(source: string): number {
  const re = new RegExp(`${POINT_PREFIX}(\\d+)[abc]?\\s*:`, "g");
  let max = 0;
  for (const m of source.matchAll(re)) max = Math.max(max, Number(m[1]));
  return max + 1;
}

/** Gera o trecho pic do elemento: pontos novos + chamada do macro. */
function buildSnippet(el: CircuitElement, n: number): string {
  const y = 0 - (n - 1) * STEP_Y;
  const a = `${POINT_PREFIX}${n}a`;
  const extra = el.extra !== undefined ? `, "${el.extra}"` : "";
  const head = `# ${el.macro} (circuit palette)\n`;
  if (el.terminals === 1) {
    return `${head}${a}: (0, ${num(y)})\n${el.macro}(${a}${extra})`;
  }
  const b = `${POINT_PREFIX}${n}b`;
  if (el.terminals === 3) {
    // spdt(comum, fechado, aberto): comum à esquerda, saídas em leque à direita
    const c = `${POINT_PREFIX}${n}c`;
    return (
      `${head}${a}: (0, ${num(y)})\n` +
      `${b}: (${num(SPAN_X)}, ${num(y + 0.25)})\n${c}: (${num(SPAN_X)}, ${num(y - 0.25)})\n` +
      `${el.macro}(${a}, ${b}, ${c})`
    );
  }
  return `${head}${a}: (0, ${num(y)})\n${b}: (${num(SPAN_X)}, ${num(y)})\n${el.macro}(${a}, ${b}${extra})`;
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
