import type { Plot } from "@/lib/dune";
import {
  decimateMinMax,
  finiteRange,
  formatSI,
  hasScale,
  linearTicks,
  logTicks,
  nearestIndex,
  paddedDomain,
  plotSeries,
} from "@/lib/waveform";

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

  it("NaN/±inf quebram o traço em segmentos (Float64Array do dune)", () => {
    const segs = decimateMinMax(
      new Float64Array([0, 1, 2, 3, 4, 5]),
      new Float64Array([1, 2, NaN, 4, 5, Infinity]),
    );
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
    expect(nearestIndex(new Float64Array([0, 1, NaN, 3]), 2.9)).toBe(3);
  });

  it("finiteRange ignora NaN/±inf e aguenta milhões de pontos", () => {
    expect(finiteRange(new Float64Array([NaN, 3, -Infinity, -2, 7]))).toEqual([-2, 7]);
    const big = new Float64Array(3_000_000).map((_, i) => i);
    expect(finiteRange(big)).toEqual([0, 2_999_999]); // Math.min(...big) estouraria a pilha
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
      // complexo: re,im intercalados
      columns: [new Float64Array([10, 0, 100, 0, 1000, 0]), new Float64Array([3, 4, 0, 1, NaN, 0])],
    });
    const s = plotSeries(p);
    expect(s.scale.log).toBe(true);
    expect([...s.scale.values]).toEqual([10, 100, 1000]);
    expect([...s.traces[0].values]).toEqual([5, 1, NaN]);
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
