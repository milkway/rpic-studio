// Agrupamento das linhas `.four` do dune-sim e os auxiliares da semente.
import type { FourierRow } from "@/lib/dune";
import { formatPlain, fourierGroups } from "@/lib/simFourier";
import { drawSeed, usesRandom } from "@/lib/simSource";

const row = (card: number, vector: string, harmonic: number, magnitude: number): FourierRow => ({
  card,
  vector,
  harmonic,
  frequency: harmonic * 1000,
  magnitude,
  phase: harmonic === 0 ? 0 : -90,
  norm_magnitude: harmonic === 0 ? 0 : magnitude / 2,
  norm_phase: 0,
  thd: 12.5,
  gridsize: 200,
  polydegree: 1,
  nperiods: 1,
});
const failed = (card: number, vector: string): FourierRow => ({
  card,
  vector,
  harmonic: null,
  frequency: null,
  magnitude: null,
  phase: null,
  norm_magnitude: null,
  norm_phase: null,
  thd: null,
  gridsize: null,
  polydegree: null,
  nperiods: null,
  error: `no such vector ${vector}`,
});

describe("fourierGroups", () => {
  it("um grupo por (cartão, vetor), na ordem do dune", () => {
    const groups = fourierGroups([
      row(0, "v(out)", 0, 0.1),
      row(0, "v(out)", 1, 2),
      row(0, "v(out)", 2, 0.5),
      row(0, "i(v1)", 0, 0),
      row(0, "i(v1)", 1, 2),
      failed(0, "v(7)"),
      row(1, "v(out)", 1, 2),
    ]);
    expect(groups.map((g) => [g.key, g.unit, g.harmonics.length, g.error])).toEqual([
      ["0:v(out)", "V", 3, null],
      ["0:i(v1)", "A", 2, null],
      ["0:v(7)", "V", 0, "no such vector v(7)"],
      ["1:v(out)", "V", 1, null],
    ]);
    expect(groups[0]).toMatchObject({ thd: 12.5, fundamental: 1000 });
    expect(groups[0].harmonics[2]).toEqual({
      harmonic: 2,
      frequency: 2000,
      magnitude: 0.5,
      phase: -90,
      norm: 0.25,
    });
    expect(groups[2]).toMatchObject({ thd: null, fundamental: null });
  });

  it("expressão sem unidade; nada = nada", () => {
    expect(fourierGroups([row(0, "v(a)-v(b)", 1, 1)])[0].unit).toBe("V");
    expect(fourierGroups([row(0, "par('x')", 1, 1)])[0].unit).toBe("");
    expect(fourierGroups([])).toEqual([]);
  });
});

describe("formatPlain", () => {
  it("3 significativos, sem prefixo SI", () => {
    expect(formatPlain(1)).toBe("1");
    expect(formatPlain(0.0018196931)).toBe("0.00182");
    expect(formatPlain(0.26794)).toBe("0.268");
    expect(formatPlain(-12.345)).toBe("−12.3");
    expect(formatPlain(1.5e-7)).toBe("1.50e−7");
    expect(formatPlain(0)).toBe("0");
    expect(formatPlain(null)).toBe("—");
    expect(formatPlain(NaN)).toBe("—");
  });
});

describe("usesRandom", () => {
  it("acha as funções aleatórias do ngspice fora de comentários", () => {
    expect(usesRandom("R1 a b {agauss(1k,50,3)}\n.end")).toBe(true);
    expect(usesRandom(".param rv = AUNIF (1k, 0.1)")).toBe(true);
    expect(usesRandom(".param c=limit(1u,0.1u) g=gauss(1,0.1,1) u=unif(1,0.1)")).toBe(true);
    expect(usesRandom("* R1 a b {agauss(1k,50,3)}\nR1 a b 1k")).toBe(false);
    expect(usesRandom("R1 a b 1k\nV1 a 0 PULSE(0 5)\n.tran 1u 1m")).toBe(false);
    // nome que só CONTÉM a palavra não conta
    expect(usesRandom(".param mygauss=1\nR1 a b {mygauss}")).toBe(false);
  });
});

describe("drawSeed", () => {
  it("inteiro de 1 a 2^32 − 1", () => {
    for (let i = 0; i < 200; i++) {
      const s = drawSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(0xffff_ffff);
    }
  });
});
