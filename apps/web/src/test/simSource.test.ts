// Escrita de volta dos sliders (issue #22): posições do argumento de valor a
// partir da cena do rpic REAL com o prelude do dune (re-baseadas), a troca de
// texto que preserva o resto da linha, e `.ac` → `acmag`.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import prelude from "virtual:dune-prelude";
import { compileWithPrelude } from "@/lib/dunePrelude";
import {
  applySourceEdit,
  hasAcAnalysis,
  rewriteNumber,
  spiceLiteral,
  VALUE_ARG,
  valueEdit,
  type ElementCall,
} from "@/lib/simSource";
import { sessionControls } from "@/lib/simProtocol";
import { ensureDune, extractPic, openSession } from "@/lib/dune";
import { DIVIDER_FIGURE, RC_FIGURE, RLC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ready(readFileSync(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm")));
  await ensureDune(
    readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
  );
});

const opts = { circuits: true, texlabels: false };
const callsOf = (source: string): ElementCall[] =>
  compileWithPrelude(source, prelude, opts).calls ?? [];

/** Escreve e devolve o fonte novo (falha o teste se não deu). */
function write(source: string, refdes: string, param: string, value: number): string {
  const r = valueEdit(source, callsOf(source), refdes, param, value);
  if (!r.ok) throw new Error(`${refdes}: ${r.reason}`);
  return applySourceEdit(source, r.edit);
}

const lineOf = (source: string, prefix: string) =>
  source.split("\n").find((l) => l.startsWith(prefix));

describe("posições do argumento de valor (cena + prelude)", () => {
  it("chamadas rotuladas do usuário, com raw_args no referencial do usuário", () => {
    const calls = callsOf(RC_FIGURE);
    const r1 = calls.find((c) => c.label === "R1")!;
    expect(r1.macro).toBe("resistor");
    // `R1: resistor(Vin, Vout, 1k)` é a linha 6 do fonte do usuário (não 6 + prelude)
    const lines = RC_FIGURE.split("\n");
    const ln = lines.findIndex((l) => l.startsWith("R1:")) + 1;
    expect(r1.args[2]).toMatchObject({ text: "1k", line: ln, end_line: ln });
    expect(lines[ln - 1].slice(r1.args[2].col - 1, r1.args[2].end_col - 1)).toBe("1k");
    // `ground(...)` não tem rótulo: fora
    expect(calls.some((c) => c.macro === "ground")).toBe(false);
    // nada do prelude (macros internas __dn_*) vaza
    expect(calls.every((c) => !c.macro.startsWith("__"))).toBe(true);
  });

  it("a tabela cobre as macros de dois terminais com valor numérico do prelude", () => {
    for (const m of ["resistor", "capacitor", "inductor", "vsource", "isource"]) {
      expect(prelude).toMatch(new RegExp(`define ${m}\\b`));
      expect(VALUE_ARG[m]?.index).toBe(2);
    }
  });
});

describe("valueEdit: o texto escrito", () => {
  it("R/C/L: troca só o número, o resto da linha fica", () => {
    let s = write(RC_FIGURE, "R1", "resistance", 2200);
    expect(lineOf(s, "R1:")).toBe("R1: resistor(Vin, Vout, 2.2k)");
    s = write(s, "C1", "capacitance", 4.7e-7);
    expect(lineOf(s, "C1:")).toBe("C1: capacitor(Vout, (2.5,0), 470n)");
    s = write(RLC_FIGURE, "L1", "inductance", 0.022);
    expect(lineOf(s, "L1:")).toBe("L1: inductor(In, A, 22m)");
    // o resto do fonte é idêntico
    expect(s.replace("22m)", "10m)")).toBe(RLC_FIGURE);
  });

  it("espaços, aspas, comentário e cauda de unidade preservados; valor fino não arredonda", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
V1: vsource(A, (0,0), DC 5)
R1: resistor(A, B,   1kohm  ) # carga
R2: resistor(B, (1.5,0), "10k")
.op
.PE
`;
    let s = write(src, "R1", "resistance", 4753);
    expect(lineOf(s, "R1:")).toBe("R1: resistor(A, B,   4.753kohm  ) # carga");
    s = write(src, "R2", "resistance", 22000);
    expect(lineOf(s, "R2:")).toBe('R2: resistor(B, (1.5,0), "22k")');
    expect(spiceLiteral(1e6)).toBe("1meg");
    expect(spiceLiteral(4.7e-6)).toBe("4.7u");
  });

  it("fontes: só o sub-trecho do parâmetro (AC sob acmag, DC sob dc)", () => {
    const ac = write(DIVIDER_FIGURE, "V1", "acmag", 1.5);
    expect(lineOf(ac, "V1:")).toBe("V1: vsource(A, (0,0), DC 10 AC 1.5)");
    const dc = write(DIVIDER_FIGURE, "V1", "dc", 4.7);
    expect(lineOf(dc, "V1:")).toBe("V1: vsource(A, (0,0), DC 4.7 AC 1)");
    const rlc = write(RLC_FIGURE, "V1", "acmag", 2);
    expect(lineOf(rlc, "V1:")).toBe("V1: vsource(In, (0,0), AC 2)");
    // número nu = DC
    const bare = `.PS\nspice = 1\nV1: vsource((0,1), (0,0), 5)\nR1: resistor((0,1), (0,0), 1k)\n.op\n.PE\n`;
    expect(lineOf(write(bare, "V1", "dc", 12), "V1:")).toBe("V1: vsource((0,1), (0,0), 12)");
  });

  it("argumento em várias linhas: a posição re-baseada acha a linha certa", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
V1: vsource(A, (0,0), DC 1)
C1: capacitor(B, (1.5,0),
  1u)
R1: resistor(A, B, 1k)
.op
.PE
`;
    const s = write(src, "C1", "capacitance", 2.2e-6);
    expect(s).toContain("C1: capacitor(B, (1.5,0),\n  2.2u)");
  });

  it("sem posição confiável: não escreve e diz por quê", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
X = 1000
V1: vsource(A, (0,0), PULSE(0 5 0 1u 1u 10m 20m))
R1: resistor(A, B, X)
D1: diode(B, (1.5,0), DMOD)
.tran 1u 1m
.PE
`;
    const calls = callsOf(src);
    expect(valueEdit(src, calls, "R1", "resistance", 2)).toMatchObject({
      ok: false,
      reason: "not-literal",
    });
    expect(valueEdit(src, calls, "V1", "dc", 2)).toMatchObject({
      ok: false,
      reason: "not-literal",
    });
    expect(valueEdit(src, calls, "D1", "area", 2)).toMatchObject({
      ok: false,
      reason: "unknown-macro",
      macro: "diode",
    });
    expect(valueEdit(src, calls, "R9", "resistance", 2)).toMatchObject({
      ok: false,
      reason: "no-call",
    });
    // fonte editado depois do compile: as posições não batem → `stale`
    const edited = src.replace("A: (0,1)", "A: (0,1) # mexi\n");
    expect(valueEdit(edited, calls, "R1", "resistance", 2)).toMatchObject({ ok: false });
  });

  it("duas escritas seguidas sem recompilar: as posições ajustadas seguem valendo", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
V1: vsource(A, (0,0), DC 1); R1: resistor(A, B, 1k); R2: resistor(B, (1.5,0), 1k)
.op
.PE
`;
    const first = valueEdit(src, callsOf(src), "R1", "resistance", 12345);
    if (!first.ok) throw new Error(first.reason);
    const s1 = applySourceEdit(src, first.edit);
    const second = valueEdit(s1, first.calls, "R2", "resistance", 47);
    if (!second.ok) throw new Error(second.reason);
    const s2 = applySourceEdit(s1, second.edit);
    expect(lineOf(s2, "V1:")).toBe(
      "V1: vsource(A, (0,0), DC 1); R1: resistor(A, B, 12.345k); R2: resistor(B, (1.5,0), 47)",
    );
    // e coincidem com um compile fresco do texto novo
    expect(first.calls.find((c) => c.label === "R2")).toEqual(
      callsOf(s1).find((c) => c.label === "R2"),
    );
  });
});

describe("rewriteNumber: a cauda de unidade nunca vira sufixo", () => {
  it("número sem sufixo + cauda que começa por sufixo: a cauda cai (F = femto)", () => {
    expect(rewriteNumber("10mF", 1)).toBe("1");
    expect(rewriteNumber("100nF", 470)).toBe("470");
    expect(rewriteNumber("2kF", 5)).toBe("5");
    expect(rewriteNumber("1TOhm", 5)).toBe("5Ohm"); // O não é sufixo
  });
  it("com sufixo no número escrito, ou cauda que não é sufixo, a cauda fica", () => {
    expect(rewriteNumber("10mF", 0.0022)).toBe("2.2mF");
    expect(rewriteNumber("100nF", 4.7e-7)).toBe("470nF");
    expect(rewriteNumber("5V", 4.7)).toBe("4.7V");
    expect(rewriteNumber("1ohm", 2)).toBe("2ohm");
    expect(rewriteNumber("1kΩ", 2200)).toBe("2.2kΩ");
  });
  it("sem cauda: só o sufixo muda", () => {
    expect(rewriteNumber("4.7k", 2200)).toBe("2.2k");
    expect(rewriteNumber("1meg", 5e5)).toBe("500k");
  });
});

describe(".ac → acmag", () => {
  it("hasAcAnalysis lê o deck", () => {
    expect(hasAcAnalysis(extractPic(DIVIDER_FIGURE).netlist)).toBe(true);
    expect(hasAcAnalysis(extractPic(RC_FIGURE).netlist)).toBe(false);
  });

  it("sob .ac a fonte com AC vira slider de acmag; sob .tran fica dc (ou fora)", () => {
    const rlc = openSession(RLC_FIGURE);
    const v1 = sessionControls(rlc, rlc.pic!).find((c) => c.refdes === "V1");
    // `AC 1` só: sem .ac o dc = 0 deixaria a fonte sem slider
    expect(v1).toMatchObject({ param: "acmag", value: 1, unit: "V" });
    rlc.free();
    const div = openSession(DIVIDER_FIGURE);
    expect(sessionControls(div, div.pic!).find((c) => c.refdes === "V1")).toMatchObject({
      param: "acmag",
      value: 1,
    });
    div.free();
    const tran = `.PS\nspice = 1\nV1: vsource((0,1), (0,0), DC 5 AC 1)\nR1: resistor((0,1), (0,0), 1k)\n.tran 1u 1m\n.PE\n`;
    const s = openSession(tran);
    expect(sessionControls(s, s.pic!).find((c) => c.refdes === "V1")).toMatchObject({
      param: "dc",
      value: 5,
    });
    s.free();
  });
});
