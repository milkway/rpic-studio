import type { Plot } from "@/lib/dune";
import {
  decimateMinMax,
  formatSI,
  hasScale,
  linearTicks,
  logTicks,
  nearestIndex,
  paddedDomain,
  plotSeries,
} from "@/lib/waveform";
import { stripDotLines } from "@/lib/simFigure";

function plot(partial: Partial<Plot>): Plot {
  return {
    title: "t",
    date: "",
    plotname: "Transient Analysis",
    flags: "real",
    commands: [],
    options: [],
    dimensions: null,
    variables: [],
    npoints: 0,
    columns: [],
    ...partial,
  };
}

describe("decimateMinMax", () => {
  it("poucos pontos passam intactos", () => {
    expect(decimateMinMax([0, 1, 2], [5, 6, 7], 200)).toEqual([
      [
        [0, 5],
        [1, 6],
        [2, 7],
      ],
    ]);
  });

  it("limita a ~2 pontos por balde e preserva picos e o último ponto", () => {
    const n = 10_000;
    const xs = Array.from({ length: n }, (_, i) => i);
    const ys = xs.map((i) => (i === 4321 ? 99 : i === 777 ? -50 : Math.sin(i / 300)));
    const [seg] = decimateMinMax(xs, ys, 200);
    expect(seg.length).toBeLessThanOrEqual(2 * 200 + 1);
    expect(seg.length).toBeGreaterThan(200);
    expect(seg.some(([x, y]) => x === 4321 && y === 99)).toBe(true);
    expect(seg.some(([x, y]) => x === 777 && y === -50)).toBe(true);
    expect(seg.at(-1)![0]).toBe(n - 1);
    // ordem de índice preservada (x crescente)
    for (let i = 1; i < seg.length; i++) expect(seg[i][0]).toBeGreaterThan(seg[i - 1][0]);
  });

  it("null quebra o traço em segmentos", () => {
    const segs = decimateMinMax([0, 1, 2, 3, 4], [1, 2, null, 4, 5]);
    expect(segs).toEqual([
      [
        [0, 1],
        [1, 2],
      ],
      [
        [3, 4],
        [4, 5],
      ],
    ]);
  });
});

describe("ticks e formatação SI", () => {
  it("linearTicks redondos", () => {
    expect(linearTicks(0, 5e-3, 5)).toEqual(
      [0, 1e-3, 2e-3, 3e-3, 4e-3, 5e-3].map((v) => expect.closeTo(v, 12)),
    );
    expect(linearTicks(-1, 1, 4)).toContain(0);
  });

  it("logTicks por década", () => {
    expect(logTicks(10, 100e3)).toEqual([10, 100, 1e3, 1e4, 1e5]);
    expect(logTicks(-1, 10)).toEqual([]);
  });

  it("formatSI", () => {
    expect(formatSI(0.00123, "s")).toBe("1.23 ms");
    expect(formatSI(4.966, "V")).toBe("4.97 V");
    expect(formatSI(1500, "Hz")).toBe("1.5 kHz");
    expect(formatSI(-2e-6, "A")).toBe("−2 µA");
    expect(formatSI(0, "V")).toBe("0 V");
    expect(formatSI(1e-3)).toBe("1 m");
    expect(formatSI(null)).toBe("—");
  });

  it("paddedDomain não colapsa sinal constante", () => {
    const [a, b] = paddedDomain(5, 5);
    expect(a).toBeLessThan(5);
    expect(b).toBeGreaterThan(5);
  });

  it("nearestIndex", () => {
    expect(nearestIndex([0, 1, 2, 3], 2.4)).toBe(2);
    expect(nearestIndex([0, 1, 2, 3], 2.6)).toBe(3);
  });
});

describe("plotSeries", () => {
  it("complexo vira |valor|; frequência > 1 década em log", () => {
    const p = plot({
      plotname: "AC Analysis",
      flags: "complex",
      npoints: 3,
      variables: [
        { name: "frequency", type: "frequency" },
        { name: "v(out)", type: "voltage" },
      ],
      columns: [
        [
          [10, 0],
          [100, 0],
          [1000, 0],
        ],
        [
          [3, 4],
          [0, 1],
          [null, 0],
        ],
      ],
    });
    const s = plotSeries(p);
    expect(s.scale.log).toBe(true);
    expect(s.scale.values).toEqual([10, 100, 1000]);
    expect(s.traces[0].values).toEqual([5, 1, null]);
  });

  it("op não tem escala", () => {
    expect(
      hasScale(
        plot({
          plotname: "Operating Point",
          npoints: 1,
          variables: [{ name: "v(1)", type: "voltage" }],
        }),
      ),
    ).toBe(false);
  });
});

describe("stripDotLines", () => {
  it("apaga cartões ponto mantendo .PS/.PE e a contagem de linhas", () => {
    const src = ".PS\nspice = 1\n.tran 1u 1m\n  .model D1 D\n.PE\n";
    const out = stripDotLines(src);
    expect(out).toBe(".PS\nspice = 1\n\n\n.PE\n");
    expect(out.split("\n").length).toBe(src.split("\n").length);
  });
});
