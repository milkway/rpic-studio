// Linhas do painel de medidas: unidade pelo cartão do netlist, detalhes na
// ordem do ngspice, falha com a razão (a linha nunca some).
import { measureCards, measureRows } from "@/lib/simMeasure";
import type { Measurement } from "@/lib/dune";

const NETLIST = `* deck
R1 a b 1k
.tran 1u 5m
.measure tran trise TRIG v(out) VAL=0.5 RISE=1 TARG v(out) VAL=4.5 RISE=1
.measure tran vmax MAX v(out)
.meas tran imin MIN_AT i(v1) FROM=1m TO=2m
.meas ac f3 WHEN vdb(out)=-3
.meas tran never WHEN v(out)=100
.end
`;

describe("measureCards", () => {
  it("unidade do valor pelo tipo da medida e pela análise", () => {
    const c = measureCards(NETLIST);
    expect(c.get("trise")?.value).toBe("s");
    expect(c.get("vmax")?.value).toBe("V");
    expect(c.get("imin")).toEqual({ value: "s", vector: "A" });
    expect(c.get("f3")?.value).toBe("Hz");
  });
});

describe("measureCards: continuação e expressões", () => {
  it("junta linhas `+` antes de casar o cartão", () => {
    const c = measureCards(".tran 1u 5m\n.measure tran vpk\n+ MAX v(out)\n.end\n");
    expect(c.get("vpk")?.value).toBe("V");
  });

  it("expressão que não é vetor simples: sem unidade (nunca uma errada)", () => {
    const c = measureCards(
      [
        ".meas tran p2 MAX par('v(out)*2')",
        ".meas tran dv FIND v(a)-v(b) AT=1m",
        ".meas tran ok FIND v(a) AT=1m",
        ".meas tran ia AVG i(v1) FROM=0 TO=1m",
      ].join("\n"),
    );
    expect(c.get("p2")?.value).toBe("");
    expect(c.get("dv")?.value).toBe("");
    expect(c.get("ok")?.value).toBe("V");
    expect(c.get("ia")?.value).toBe("A");
  });
});

describe("measureRows", () => {
  it("valor com prefixo SI, detalhes e falha com a razão", () => {
    const ms: Measurement[] = [
      {
        name: "trise",
        analysis: "tran",
        plot: 0,
        value: 2.197e-3,
        details: { trig: 1.0589e-4, targ: 2.303e-3 },
      },
      { name: "vmax", analysis: "tran", plot: 0, value: 4.966, details: { at: 5e-3 } },
      {
        name: "imin",
        analysis: "tran",
        plot: 0,
        value: 1.5e-3,
        details: { with: -2e-3, from: 1e-3, to: 2e-3 },
      },
      {
        name: "never",
        analysis: "tran",
        plot: 0,
        value: null,
        details: {},
        error: "out of interval (WHEN)",
      },
    ];
    const rows = measureRows(ms, NETLIST);
    expect(rows.map((r) => [r.name, r.value, r.details.join(" · "), r.error])).toEqual([
      ["trise", "2.2 ms", "trig 106 µs · targ 2.3 ms", null],
      ["vmax", "4.97 V", "at 5 ms", null],
      ["imin", "1.5 ms", "with −2 mA · from 1 ms · to 2 ms", null],
      ["never", "—", "", "out of interval (WHEN)"],
    ]);
  });

  it("o mesmo cartão em dois plots leva #plot; sem cartão, sem unidade", () => {
    const m = (plot: number): Measurement => ({
      name: "x",
      analysis: "tran",
      plot,
      value: 2,
      details: {},
    });
    const rows = measureRows([m(0), m(1)], "");
    expect(rows.map((r) => [r.name, r.value])).toEqual([
      ["x#0", "2"],
      ["x#1", "2"],
    ]);
  });
});
