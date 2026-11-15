// Os exemplos da etiqueta `simulate` (figuras `spice = 1` de milkway/dune
// `corpus/pic/`): cada um precisa compilar no preview sem aviso e SIMULAR com o
// dune-sim real — é o que o usuário recebe ao escolher o exemplo no menu.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import prelude from "virtual:dune-prelude";
import { compileWithPrelude } from "@/lib/dunePrelude";
import { detectSpice } from "@/lib/detect";
import { ensureDune, simulatePic } from "@/lib/dune";
import { examples } from "@/lib/examples";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ready(readFileSync(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm")));
  await ensureDune(readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")));
});

const sims = examples.filter((e) => e.tags.includes("simulate"));
const byId = (id: string) => examples.find((e) => e.id === id)!.source;

/** Coluna `name` do transiente. */
function tran(run: ReturnType<typeof simulatePic>, name: string): Float64Array {
  const plot = run.plots.find((p) => p.plotname === "Transient Analysis")!;
  const i = plot.variables.findIndex((v) => v.name === name);
  expect(i, `${name} em ${plot.variables.map((v) => v.name).join(", ")}`).toBeGreaterThanOrEqual(0);
  return plot.columns[i];
}
const swing = (c: Float64Array) => Math.max(...c) - Math.min(...c);

describe("exemplos simuláveis", () => {
  it("há seis, e a etiqueta casa com a marca `spice = 1`", () => {
    expect(sims.map((e) => e.id)).toEqual([
      "sim-rc",
      "sim-rlc",
      "sim-rectifier",
      "sim-bjt-amp",
      "sim-cmos-inverter",
      "sim-tolerance",
    ]);
    for (const ex of examples) expect(detectSpice(ex.source), ex.id).toBe(ex.tags.includes("simulate"));
  });

  it.each(sims.map((e) => [e.id, e] as const))("%s compila sem aviso e simula sem diagnóstico", (_id, ex) => {
    const b = compileWithPrelude(ex.source, prelude, { circuits: true, texlabels: false });
    expect(b.svg).toContain("<svg");
    expect(b.warnings ?? []).toEqual([]);
    const run = simulatePic(ex.source);
    // sem semente, o deck com funções aleatórias avisa que usou o nominal
    expect(run.diagnostics.map((d) => d.message)).toEqual(
      ex.id === "sim-tolerance" ? [expect.stringContaining("nominal value")] : [],
    );
    expect(run.pic.diagnostics).toEqual([]);
    expect(run.plots.length).toBeGreaterThan(0);
    for (const p of run.plots) {
      expect(p.columns.length).toBeGreaterThan(1);
      for (const c of p.columns) expect(c.every(Number.isFinite)).toBe(true);
    }
  });

  it("RC: o .measure dá o tempo de subida analítico (τ·ln 9 = 2,197 ms)", () => {
    const m = simulatePic(byId("sim-rc")).measurements.find((x) => x.name === "trise")!;
    expect(m.value!).toBeCloseTo(2.197e-3, 5);
  });

  it("retificador: a saída fica perto do pico menos a queda do diodo", () => {
    const v = tran(simulatePic(byId("sim-rectifier")), "v(vout)");
    const peak = Math.max(...v);
    expect(peak).toBeGreaterThan(9);
    expect(peak).toBeLessThan(10);
  });

  it("amplificador BJT: ganho de tensão perto de 4,5 (o da descrição)", () => {
    const run = simulatePic(byId("sim-bjt-amp"));
    const gain = swing(tran(run, "v(vout)")) / swing(tran(run, "v(vin)"));
    expect(gain).toBeGreaterThan(4.3);
    expect(gain).toBeLessThan(4.7);
  });

  it("inversor CMOS: a saída vai de trilho a trilho", () => {
    const v = tran(simulatePic(byId("sim-cmos-inverter")), "v(vout)");
    expect(Math.max(...v)).toBeGreaterThan(4.9);
    expect(Math.min(...v)).toBeLessThan(0.1);
  });

  it("retificador: o .four dá a ondulação de 60 Hz e a THD", () => {
    const rows = simulatePic(byId("sim-rectifier")).fourier;
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every((r) => r.vector === "v(vout)" && r.error === undefined)).toBe(true);
    expect(rows[1]).toMatchObject({ harmonic: 1, frequency: 60 });
    expect(rows[0].magnitude!).toBeGreaterThan(8); // a média: CC perto do pico
    expect(rows[0].thd!).toBeGreaterThan(0);
  });

  it("tolerâncias: nominal sem semente; a semente sorteia e se repete", () => {
    const src = byId("sim-tolerance");
    const rise = (seed?: number) => {
      const run = simulatePic(src, seed === undefined ? undefined : { options: { seed } });
      return { t: run.measurements.find((m) => m.name === "trise")!.value!, run };
    };
    const nominal = rise();
    expect(nominal.run.randomMode).toBe("nominal");
    expect(nominal.run.seed).toBeNull();
    expect(nominal.t).toBeCloseTo(2.197e-3, 5);
    const a = rise(7);
    expect(a.run).toMatchObject({ randomMode: "seeded", seed: 7 });
    expect(a.run.diagnostics).toEqual([]);
    expect(a.t).not.toBeCloseTo(nominal.t, 6);
    expect(rise(7).t).toBe(a.t);
    expect(rise(8).t).not.toBe(a.t);
  });
});
