// Escrita de volta dos sliders (issue #22): os spans AUTORITATIVOS do
// `OverlayMap` do dune-sim ≥ 0.3.4 (`value`/`params`, milkway/dune#17) — com
// mapas montados à mão (casos de borda: codepoints, continuação `\`, sem
// span, texto velho) e com o extrator REAL — a troca de texto que preserva o
// resto da linha, e `.ac` → `acmag`.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  applySourceEdit,
  hasAcAnalysis,
  rewriteNumber,
  spiceLiteral,
  valueEdit,
} from "@/lib/simSource";
import { sessionControls } from "@/lib/simProtocol";
import { ensureDune, extractPic, openSession, type OverlayMap } from "@/lib/dune";
import { DIVIDER_FIGURE, RC_FIGURE, RLC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ensureDune(
    readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
  );
});

type Range = { line: number; col: number; end_line: number; end_col: number };
type Spanned = { span: Range; text: string };

/** Span (1-based, fim exclusivo, colunas em CODEPOINTS) da `n`-ésima
 *  ocorrência de `needle` em `source` a partir do offset `from` — o que o
 *  dune reporta. */
function spanOf(source: string, needle: string, n = 1, from = 0): Spanned {
  let at = from - 1;
  for (let i = 0; i < n; i++) at = source.indexOf(needle, at + 1);
  if (at < 0) throw new Error(`sem "${needle}"`);
  const pos = (off: number) => {
    const before = source.slice(0, off);
    const line = before.split("\n").length;
    return { line, col: Array.from(before.slice(before.lastIndexOf("\n") + 1)).length + 1 };
  };
  const a = pos(at);
  const b = pos(at + needle.length);
  return { span: { line: a.line, col: a.col, end_line: b.line, end_col: b.col }, text: needle };
}

/** Um elemento do mapa feito à mão: `value` (1ª ocorrência no fonte) +
 *  params `[nome, texto, ocorrência DENTRO do valor]`. */
function el(
  source: string,
  refdes: string,
  value: string | null,
  params: [name: string, text: string, n?: number][] = [],
  principal: string | null = null,
) {
  return {
    refdes,
    shapes: { start: 0, end: 0 },
    pins: [],
    value: value === null ? null : spanOf(source, value),
    params: params.map(([name, text, n]) => ({
      name,
      ...spanOf(source, text, n, source.indexOf(value!)),
    })),
    principal,
  };
}

const mapOf = (elements: ReturnType<typeof el>[]): OverlayMap => ({
  elements,
  nets: [],
  canvas: { w: 1, h: 1, origin: [0, 0], rescale: 1 },
});

/** Escreve e devolve o fonte novo (falha o teste se não deu). */
function write(source: string, map: OverlayMap, refdes: string, param: string, value: number) {
  const r = valueEdit(source, map, refdes, param, value);
  if (!r.ok) throw new Error(`${refdes}: ${r.reason}`);
  return applySourceEdit(source, r.edit);
}
/** Idem, com o mapa do extrator REAL do dune. */
const writeReal = (source: string, refdes: string, param: string, value: number) =>
  write(source, extractPic(source).map, refdes, param, value);

const lineOf = (source: string, prefix: string) =>
  source.split("\n").find((l) => l.startsWith(prefix));

describe("valueEdit: mapas feitos à mão", () => {
  it("número simples: troca só o número, o resto da linha fica", () => {
    const src = ".PS\nspice = 1\nR1: resistor(A, B, 1k) # carga\n.PE\n";
    const map = mapOf([el(src, "R1", "1k", [["resistance", "1k"]], "resistance")]);
    expect(lineOf(write(src, map, "R1", "resistance", 2200), "R1:")).toBe(
      "R1: resistor(A, B, 2.2k) # carga",
    );
  });

  it("valor entre aspas: o span é o miolo, as aspas ficam", () => {
    const src = '.PS\nspice = 1\nR2: resistor(B, C, "10k")\n.PE\n';
    const map = mapOf([el(src, "R2", "10k", [["resistance", "10k"]], "resistance")]);
    expect(lineOf(write(src, map, "R2", "resistance", 22000), "R2:")).toBe(
      'R2: resistor(B, C, "22k")',
    );
  });

  it("DC 10 AC 1: dc e acmag são sub-trechos independentes", () => {
    const src = ".PS\nspice = 1\nV1: vsource(A, (0,0), DC 10 AC 1)\n.PE\n";
    const map = mapOf([
      el(
        src,
        "V1",
        "DC 10 AC 1",
        [
          ["dc", "10"],
          ["acmag", "1", 2],
        ],
        "dc",
      ),
    ]);
    // o `1` de `AC 1` é a 2ª ocorrência de "1" no valor (a 1ª está em `10`)
    expect(map.elements[0].params[1].span.col).toBe(32);
    expect(lineOf(write(src, map, "V1", "dc", 4.7), "V1:")).toBe(
      "V1: vsource(A, (0,0), DC 4.7 AC 1)",
    );
    expect(lineOf(write(src, map, "V1", "acmag", 1.5), "V1:")).toBe(
      "V1: vsource(A, (0,0), DC 10 AC 1.5)",
    );
  });

  it("PULSE(…): o slider de dc recusa (não grafado), o de pulse também (não é número)", () => {
    const src = ".PS\nspice = 1\nV2: vsource(B, (0,0), PULSE(0 5 0 1u 1u 10m 20m))\n.PE\n";
    const pulse = "PULSE(0 5 0 1u 1u 10m 20m)";
    const map = mapOf([el(src, "V2", pulse, [["pulse", pulse]], "dc")]);
    expect(valueEdit(src, map, "V2", "dc", 2)).toEqual({ ok: false, reason: "no-param" });
    expect(valueEdit(src, map, "V2", "pulse", 2)).toEqual({ ok: false, reason: "not-literal" });
  });

  it("colunas em CODEPOINTS: um caractere fora do BMP antes do valor, na mesma linha", () => {
    const src = '.PS\nspice = 1\n"𝛀 x"; R3: resistor(A, (0,0), 2k)\n.PE\n';
    // escrito à mão: `"𝛀 x"; R3: resistor(A, (0,0), ` = 30 codepoints (31 UTF-16)
    const span = { line: 3, col: 31, end_line: 3, end_col: 33 };
    const map = mapOf([
      {
        refdes: "R3",
        shapes: { start: 0, end: 0 },
        pins: [],
        value: { span, text: "2k" },
        params: [{ name: "resistance", span, text: "2k" }],
        principal: "resistance",
      },
    ]);
    expect(spanOf(src, "2k").span).toEqual(span);
    expect(lineOf(write(src, map, "R3", "resistance", 4700), '"𝛀')).toBe(
      '"𝛀 x"; R3: resistor(A, (0,0), 4.7k)',
    );
  });

  it("valor em várias linhas (continuação `\\`): o parâmetro na 2ª linha", () => {
    const src = ".PS\nspice = 1\nV1: vsource(A, (0,0), DC 5 \\\n  AC 1)\n.PE\n";
    const value = "DC 5 \\\n  AC 1";
    const map = mapOf([
      el(
        src,
        "V1",
        value,
        [
          ["dc", "5"],
          ["acmag", "1"],
        ],
        "dc",
      ),
    ]);
    expect(map.elements[0].value!.span).toMatchObject({ line: 3, end_line: 4 });
    const r = valueEdit(src, map, "V1", "acmag", 2.5);
    if (!r.ok) throw new Error(r.reason);
    const s = applySourceEdit(src, r.edit);
    expect(s).toContain("DC 5 \\\n  AC 2.5)");
    // o mapa devolvido segue valendo para o texto novo (o valor ganhou o texto novo)
    expect(r.map.elements[0].value!.text).toBe("DC 5 \\\n  AC 2.5");
    expect(lineOf(write(s, r.map, "V1", "dc", 7), "V1:")).toBe("V1: vsource(A, (0,0), DC 7 \\");
  });

  it("value: null (wrapper do usuário, bloco inline, K): não escreve, diz por quê", () => {
    const src = ".PS\nspice = 1\nR4: myr(A, (0,0), 3k)\nK1: coupling(L1, L2, 0.9)\n.PE\n";
    const map = mapOf([el(src, "R4", null, [], "resistance"), el(src, "K1", null)]);
    expect(valueEdit(src, map, "R4", "resistance", 2)).toEqual({ ok: false, reason: "no-span" });
    expect(valueEdit(src, map, "K1", "coupling", 0.5)).toEqual({ ok: false, reason: "no-span" });
    expect(valueEdit(src, map, "R9", "resistance", 2)).toEqual({ ok: false, reason: "no-element" });
  });

  it("texto velho (fonte mudou depois do mapa): `stale`, nunca uma troca no lugar errado", () => {
    const src = ".PS\nspice = 1\nR1: resistor(A, B, 1k)\n.PE\n";
    const map = mapOf([el(src, "R1", "1k", [["resistance", "1k"]], "resistance")]);
    // linha a mais acima: o span cai em outra linha
    const moved = src.replace("spice = 1\n", "spice = 1\n# mexi\n");
    expect(valueEdit(moved, map, "R1", "resistance", 2)).toEqual({ ok: false, reason: "stale" });
    // mesmo lugar, outro texto
    const changed = src.replace("1k)", "2k)");
    expect(valueEdit(changed, map, "R1", "resistance", 2)).toEqual({ ok: false, reason: "stale" });
  });

  it("refdes sem caixa; parâmetro repetido → a última grafia", () => {
    const src = ".PS\nspice = 1\nV1: vsource(A, (0,0), DC 1 DC 2)\n.PE\n";
    const map = mapOf([
      el(
        src,
        "V1",
        "DC 1 DC 2",
        [
          ["dc", "1"],
          ["dc", "2"],
        ],
        "dc",
      ),
    ]);
    expect(lineOf(write(src, map, "v1", "dc", 3), "V1:")).toBe("V1: vsource(A, (0,0), DC 1 DC 3)");
  });

  it("duas escritas seguidas na mesma linha: o mapa ajustado segue valendo", () => {
    const src = ".PS\nspice = 1\nR1: resistor(A, B, 1k); R2: resistor(B, (1.5,0), 1k)\n.PE\n";
    const r2 = spanOf(src, "1k", 2);
    const map = mapOf([
      el(src, "R1", "1k", [["resistance", "1k"]], "resistance"),
      {
        ...el(src, "R2", null, [], "resistance"),
        value: r2,
        params: [{ name: "resistance", ...r2 }],
      },
    ]);
    const first = valueEdit(src, map, "R1", "resistance", 12345);
    if (!first.ok) throw new Error(first.reason);
    const s1 = applySourceEdit(src, first.edit);
    expect(first.map.elements[1].value).toEqual(spanOf(s1, "1k"));
    const s2 = write(s1, first.map, "R2", "resistance", 47);
    expect(lineOf(s2, "R1:")).toBe("R1: resistor(A, B, 12.345k); R2: resistor(B, (1.5,0), 47)");
  });
});

describe("valueEdit: mapa do extrator REAL do dune", () => {
  it("R/C/L: troca só o número, o resto do fonte é idêntico", () => {
    let s = writeReal(RC_FIGURE, "R1", "resistance", 2200);
    expect(lineOf(s, "R1:")).toBe("R1: resistor(Vin, Vout, 2.2k)");
    s = writeReal(s, "C1", "capacitance", 4.7e-7);
    expect(lineOf(s, "C1:")).toBe("C1: capacitor(Vout, (2.5,0), 470n)");
    s = writeReal(RLC_FIGURE, "L1", "inductance", 0.022);
    expect(lineOf(s, "L1:")).toBe("L1: inductor(In, A, 22m)");
    expect(s.replace("22m)", "10m)")).toBe(RLC_FIGURE);
  });

  it("espaços, aspas, comentário, cauda de unidade e codepoints; valor fino não arredonda", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
V1: vsource(A, (0,0), DC 5)
R1: resistor(A, B,   1kohm  ) # carga
R2: resistor(B, (1.5,0), "10k")
"𝛀 x" at (0.75,1.5); R3: resistor(A, (0,0), 2k)
.op
.PE
`;
    let s = writeReal(src, "R1", "resistance", 4753);
    expect(lineOf(s, "R1:")).toBe("R1: resistor(A, B,   4.753kohm  ) # carga");
    s = writeReal(src, "R2", "resistance", 22000);
    expect(lineOf(s, "R2:")).toBe('R2: resistor(B, (1.5,0), "22k")');
    s = writeReal(src, "R3", "resistance", 4700);
    expect(lineOf(s, '"𝛀')).toBe('"𝛀 x" at (0.75,1.5); R3: resistor(A, (0,0), 4.7k)');
    expect(spiceLiteral(1e6)).toBe("1meg");
    expect(spiceLiteral(4.7e-6)).toBe("4.7u");
  });

  it("fontes: só o sub-trecho do parâmetro (AC sob acmag, DC sob dc; número nu = dc)", () => {
    const ac = writeReal(DIVIDER_FIGURE, "V1", "acmag", 1.5);
    expect(lineOf(ac, "V1:")).toBe("V1: vsource(A, (0,0), DC 10 AC 1.5)");
    const dc = writeReal(DIVIDER_FIGURE, "V1", "dc", 4.7);
    expect(lineOf(dc, "V1:")).toBe("V1: vsource(A, (0,0), DC 4.7 AC 1)");
    const rlc = writeReal(RLC_FIGURE, "V1", "acmag", 2);
    expect(lineOf(rlc, "V1:")).toBe("V1: vsource(In, (0,0), AC 2)");
    const bare = `.PS\nspice = 1\nV1: vsource((0,1), (0,0), 5)\nR1: resistor((0,1), (0,0), 1k)\n.op\n.PE\n`;
    expect(lineOf(writeReal(bare, "V1", "dc", 12), "V1:")).toBe("V1: vsource((0,1), (0,0), 12)");
  });

  it("continuação `\\` dentro do valor: o span multi-linha do dune acha a 2ª linha", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
V1: vsource(A, (0,0), DC 1 \\
  AC 1)
R1: resistor(A, B, 1k)
C1: capacitor(B, (1.5,0), \\
  1u)
.ac dec 10 1 1k
.PE
`;
    expect(extractPic(src).map.elements.find((e) => e.refdes === "V1")?.value?.span).toMatchObject({
      line: 4,
      end_line: 5,
    });
    expect(writeReal(src, "V1", "acmag", 2)).toContain("DC 1 \\\n  AC 2)");
    expect(writeReal(src, "C1", "capacitance", 2.2e-6)).toContain(
      "C1: capacitor(B, (1.5,0), \\\n  2.2u)",
    );
  });

  it("sem posição confiável ou sem número literal: não escreve e diz por quê", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
define myr { resistor($1, $2, $3) }
X = 1000
V1: vsource(A, (0,0), PULSE(0 5 0 1u 1u 10m 20m))
R1: resistor(A, B, X)
R4: myr(B, (1.5,0), 3k)
.tran 1u 1m
.PE
`;
    const { map } = extractPic(src);
    expect(valueEdit(src, map, "R1", "resistance", 2)).toEqual({
      ok: false,
      reason: "not-literal",
    });
    expect(valueEdit(src, map, "V1", "dc", 2)).toEqual({ ok: false, reason: "no-param" });
    expect(valueEdit(src, map, "R4", "resistance", 2)).toEqual({ ok: false, reason: "no-span" });
    expect(valueEdit(src, map, "R9", "resistance", 2)).toEqual({ ok: false, reason: "no-element" });
    const edited = src.replace("A: (0,1)", "A: (0,1) # mexi\n");
    expect(valueEdit(edited, map, "V1", "dc", 2)).toEqual({ ok: false, reason: "stale" });
  });

  it("o mapa ajustado coincide com um extrator fresco do texto novo", () => {
    const src = `.PS
spice = 1
A: (0,1); B: (1.5,1)
V1: vsource(A, (0,0), DC 1); R1: resistor(A, B, 1k); R2: resistor(B, (1.5,0), 1k)
.op
.PE
`;
    const first = valueEdit(src, extractPic(src).map, "R1", "resistance", 12345);
    if (!first.ok) throw new Error(first.reason);
    const s1 = applySourceEdit(src, first.edit);
    const fresh = extractPic(s1).map;
    for (const r of ["V1", "R1", "R2"]) {
      const a = first.map.elements.find((e) => e.refdes === r)!;
      const b = fresh.elements.find((e) => e.refdes === r)!;
      expect({ value: a.value, params: a.params }).toEqual({ value: b.value, params: b.params });
    }
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
