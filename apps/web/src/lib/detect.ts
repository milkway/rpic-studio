// Detecção automática de recursos a partir do código pic:
// - biblioteca de circuitos: chamada a qualquer macro pública da std
//   (extraídas de rpic/crates/core/src/std/circuits.pic)
// - texlabels: rótulo inteiramente delimitado por $…$ (math TeX)

const CIRCUIT_MACROS = [
  "ac_source",
  "ammeter",
  "and_gate",
  "antenna",
  "battery",
  "bell",
  "buffer",
  "bus",
  "capacitor",
  "chassis_ground",
  "clabel",
  "crystal",
  "current",
  "current_source",
  "diode",
  "ebox",
  "fuse",
  "generator",
  "ground",
  "hop",
  "ic_block",
  "iec_resistor",
  "iecgate",
  "ieee_and",
  "ieee_buf",
  "ieee_or",
  "ieee_xor",
  "inductor",
  "isource",
  "isource_ctrl",
  "lamp",
  "ldr",
  "led",
  "meter",
  "microphone",
  "motor",
  "mux",
  "nand_gate",
  "njfet",
  "nmos",
  "nor_gate",
  "not_gate",
  "npn",
  "ohmmeter",
  "opamp",
  "or_gate",
  "photodiode",
  "phototransistor",
  "pjfet",
  "pmos",
  "pnp",
  "polcap",
  "potentiometer",
  "pushbutton",
  "relay",
  "resistor",
  "schottky",
  "signal_ground",
  "solar_cell",
  "spark_gap",
  "spdt",
  "speaker",
  "switch",
  "terminal",
  "thermistor",
  "thermocouple",
  "tline",
  "transformer",
  "varcap",
  "varind",
  "varistor",
  "vdd",
  "voltage",
  "voltage_source",
  "voltmeter",
  "vsource_ctrl",
  "wire",
  "xnor_gate",
  "xor_gate",
  "zener",
] as const;

const CIRCUIT_CALL = new RegExp(`\\b(?:${CIRCUIT_MACROS.join("|")})\\s*\\(`);
const STRING_RE = /"(?:\\.|[^"\\])*"/g;

/** Remove strings e comentários — evita falso positivo em rótulos e notas. */
function stripStringsAndComments(source: string): string {
  return source.replace(STRING_RE, '""').replace(/#[^\n]*/g, "");
}

/** O código chama alguma macro da biblioteca de circuitos? */
export function detectCircuits(source: string): boolean {
  // um `define nome` próprio do usuário vence a biblioteca; ainda assim,
  // habilitar circuits é inofensivo (a lib só define macros)
  return CIRCUIT_CALL.test(stripStringsAndComments(source));
}

/** Existe rótulo inteiramente delimitado por $…$ (math TeX)? */
export function detectTexLabels(source: string): boolean {
  for (const match of source.matchAll(STRING_RE)) {
    const content = match[0].slice(1, -1).trim();
    if (/^\$[^$]+\$$/.test(content)) return true;
  }
  return false;
}

const SPICE_MARK = /(?:^|;)[ \t]*spice[ \t]*=[ \t]*1(?![\w.])/m;

/** A figura está marcada para simulação (`spice = 1`, convenção do dune)?
 *  Detecção barata, como `detectTexLabels`: ignora strings e comentários; o
 *  extrator do dune é quem decide de verdade (diagnóstico `not-marked`). */
export function detectSpice(source: string): boolean {
  return SPICE_MARK.test(stripStringsAndComments(source));
}
