// O simulador dune REAL em Node (bytes do .wasm), como o compile.test.ts faz
// com o rpic. Arquivo próprio: o init do wasm-bindgen é por módulo/arquivo.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ensureDune, openSession, renderPic, simulatePic } from "@/lib/dune";
import { SimHost, transferablesOf, type SimApi, type SimRequest } from "@/lib/simProtocol";
import { elementShapes, netlistLineShapes, traceShapes } from "@/lib/simFigure";
import { hasScale, plotSeries } from "@/lib/waveform";
import { DIVIDER_FIGURE, RC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);
const duneBytes = () =>
  readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm"));

describe("ensureDune (WASM real)", () => {
  it("bytes inválidos rejeitam e NÃO ficam cacheados; depois carrega", async () => {
    await expect(ensureDune(new Uint8Array([0, 1, 2, 3]))).rejects.toBeTruthy();
    const p = ensureDune(duneBytes());
    expect(ensureDune(duneBytes())).toBe(p); // idempotente: mesma promessa
    await p;
  });
});

describe("simulatePic", () => {
  it("RC: transiente carrega a ~5(1−e⁻⁵) V em 5 ms", () => {
    const run = simulatePic(RC_FIGURE);
    expect(run.pic.netlist).toMatch(/^R1 Vin Vout 1k$/m);
    const tran = run.plots[0];
    expect(tran.plotname).toBe("Transient Analysis");
    expect(hasScale(tran)).toBe(true);
    const s = plotSeries(tran);
    expect(s.scale.unit).toBe("s");
    expect(s.scale.log).toBe(false);
    const vout = s.traces.find((t) => t.name.toLowerCase() === "v(vout)")!;
    expect(vout.unit).toBe("V");
    expect(vout.values.at(-1)!).toBeCloseTo(4.966, 2);
  });

  it("op + ac: tabela sem escala e plot complexo em log", () => {
    const run = simulatePic(DIVIDER_FIGURE);
    const names = run.plots.map((p) => p.plotname);
    expect(names).toContain("Operating Point");
    const op = run.plots.find((p) => p.plotname === "Operating Point")!;
    expect(hasScale(op)).toBe(false);
    const ac = run.plots.find((p) => /AC/.test(p.plotname))!;
    const s = plotSeries(ac);
    expect(s.complex).toBe(true);
    expect(s.scale.log).toBe(true);
    // |v(b)| ≈ 1 em baixa frequência (RC passa-baixas, fc ≈ 159 Hz)
    const vb = s.traces.find((t) => t.name.toLowerCase() === "v(b)")!;
    expect(vb.values[0]!).toBeCloseTo(1, 2);
    expect(vb.values.at(-1)!).toBeLessThan(0.01);
  });

  it("erro de extração lança kind 'pic' com diagnósticos posicionados", () => {
    const src =
      ".PS\nspice = 1\nV1: vsource((0,1),(0,0), 1)\nR1: resistor((0,1),(0,0))\nground((0,0))\n.op\n.PE\n";
    try {
      simulatePic(src);
      expect.unreachable();
    } catch (e) {
      const err = e as { kind: string; diagnostics: { kind?: string; line: number | null }[] };
      expect(err.kind).toBe("pic");
      const d = err.diagnostics.find((x) => x.kind === "missing-value")!;
      expect(d.line).toBe(4);
    }
  });
});

describe("protocolo do worker com o dune real", () => {
  const api: SimApi = { ensure: () => ensureDune(), openSession, renderPic };
  // um host novo por pedido = worker novo (sessão sempre fresca)
  const handleSimRequest = (req: SimRequest, a: SimApi = api) => new SimHost(a).handle(req);

  it("ok traz run + figura + tempo", async () => {
    const res = await handleSimRequest({ type: "run", id: 7, source: RC_FIGURE }, api);
    expect(res.type).toBe("ok");
    expect(res.id).toBe(7);
    if (res.type !== "ok") return;
    expect(res.figure?.svg).toMatch(/^<svg/);
    expect(res.fresh).toBe(true);
    expect(res.ms).toBeGreaterThanOrEqual(0);
    // colunas tipadas, uma por variável, cada uma com o próprio buffer
    const plot = res.run.plots[0];
    expect(plot.columns).toHaveLength(plot.variables.length);
    for (const c of plot.columns) {
      expect(c).toBeInstanceOf(Float64Array);
      expect(c.length).toBe(plot.npoints);
    }
    const bufs = transferablesOf(res);
    expect(bufs).toHaveLength(plot.columns.length);
    // TRANSFERIDAS no postMessage: chegam íntegras e o lado do worker fica vazio
    const last = plot.columns[1].at(-1);
    const moved = structuredClone(res, { transfer: bufs });
    expect(moved.type === "ok" && moved.run.plots[0].columns[1].at(-1)).toBe(last);
    expect(plot.columns[1].length).toBe(0); // detached
  });

  it("plot complexo: re,im intercalados (2·npoints)", async () => {
    const res = await handleSimRequest({ type: "run", id: 8, source: DIVIDER_FIGURE }, api);
    if (res.type !== "ok") throw new Error("esperava ok");
    const ac = res.run.plots.find((p) => /AC/.test(p.plotname))!;
    expect(ac.columns[1].length).toBe(2 * ac.npoints);
    expect(transferablesOf(res)).toHaveLength(
      res.run.plots.reduce((n, p) => n + p.columns.length, 0),
    );
  });

  it("erro vira SimFailure serializável (kind/diagnostics/pic)", async () => {
    const src =
      ".PS\nspice = 1\nV1: vsource((0,1),(0,0), 1)\nR1: resistor((0,1),(0,0))\nground((0,0))\n.op\n.PE\n";
    const res = structuredClone(await handleSimRequest({ type: "run", id: 1, source: src }, api));
    expect(res.type).toBe("error");
    if (res.type !== "error") return;
    expect(res.error.kind).toBe("pic");
    expect(res.error.diagnostics.length).toBeGreaterThan(0);
    expect(res.error.pic?.netlist).toMatch(/^R1 /m);
    // a figura sai mesmo quando a extração falha (o realce dos erros usa ela)
    expect(res.figure?.svg).toMatch(/^<svg/);
  });

  it("figura que o rpic rejeita vira erro de figura, sem derrubar a resposta", async () => {
    const res = await handleSimRequest({ type: "run", id: 3, source: ".PS\nbox wid\n.PE\n" }, api);
    expect(res.type).toBe("error");
    expect(res.figure?.error).toMatch(/expected an expression/);
  });

  it("falha de carga vira kind 'load'", async () => {
    const res = await handleSimRequest(
      { type: "run", id: 2, source: RC_FIGURE },
      { ...api, ensure: () => Promise.reject(new Error("fetch failed")) },
    );
    expect(res.type === "error" && res.error.kind).toBe("load");
  });
});

describe("SimHost: a Session viva no worker (sliders)", () => {
  const api: SimApi = { ensure: () => ensureDune(), openSession, renderPic };
  const vout = (res: Awaited<ReturnType<SimHost["handle"]>>, at: number) => {
    if (res.type !== "ok") throw new Error(`esperava ok: ${res.error.message}`);
    const s = plotSeries(res.run.plots[0]);
    const tr = s.traces.find((t) => t.name.toLowerCase() === "v(vout)")!;
    const i = s.scale.values.findIndex((x) => x >= at);
    return tr.values[i]!;
  };

  it("1º pedido abre a sessão (figura + controles); os seguintes só re-rodam", async () => {
    const host = new SimHost(api);
    const a = await host.handle({ type: "run", id: 1, source: RC_FIGURE });
    expect(a.fresh).toBe(true);
    expect(a.figure?.svg).toMatch(/^<svg/);
    // R1 e C1 ajustáveis; V1 só tem PULSE (sem DC) → fora
    expect(a.controls?.map((c) => [c.refdes, c.param, c.value, c.unit])).toEqual([
      ["R1", "resistance", 1000, "Ω"],
      ["C1", "capacitance", 1e-6, "F"],
    ]);
    const base = vout(a, 1e-3); // τ = 1 ms: 5·(1−e⁻¹) ≈ 3.16 V
    expect(base).toBeCloseTo(3.16, 1);

    // R1 ×10 → τ = 10 ms: em 1 ms só ~0.48 V
    const b = await host.handle({ type: "run", id: 2, source: RC_FIGURE, alters: { R1: 10e3 } });
    expect(b.fresh).toBe(false);
    expect(b.figure).toBeUndefined();
    expect(b.controls).toBeUndefined();
    expect(b.type === "ok" && b.run.pic.netlist).toMatch(/^R1 Vin Vout 1k$/m);
    expect(vout(b, 1e-3)).toBeCloseTo(5 * (1 - Math.exp(-0.1)), 1);
    expect(b.timing.open).toBe(0);
    expect(b.timing.run).toBeGreaterThan(0);

    // tirar a alteração volta ao valor do fonte — bate com a execução fresca
    const c = await host.handle({ type: "run", id: 3, source: RC_FIGURE, alters: {} });
    expect(vout(c, 1e-3)).toBe(base);
    host.dispose();
  });

  it("fonte novo reabre a sessão; alteração inválida vira erro kind 'alter'", async () => {
    const host = new SimHost(api);
    await host.handle({ type: "run", id: 1, source: RC_FIGURE });
    const bad = await host.handle({ type: "run", id: 2, source: RC_FIGURE, alters: { R1: 0 } });
    expect(bad.type === "error" && bad.error.kind).toBe("alter");
    expect(bad.type === "error" && bad.error.pic?.netlist).toMatch(/R1 /);
    // a sessão segue viva: a próxima alteração válida roda
    const ok = await host.handle({ type: "run", id: 3, source: RC_FIGURE, alters: { R1: 2e3 } });
    expect(ok.type).toBe("ok");
    const other = await host.handle({ type: "run", id: 4, source: DIVIDER_FIGURE });
    expect(other.fresh).toBe(true);
    // fonte do divisor (`DC 10 AC 1`) é ajustável, em volts; o deck tem `.ac`,
    // então o slider move a magnitude AC (issue #22) — sob `.tran`/`.op` só,
    // seria o `dc` (simSource.test.ts)
    expect(other.controls?.find((c) => c.refdes === "V1")).toMatchObject({
      param: "acmag",
      value: 1,
      unit: "V",
    });
    host.dispose();
  });
});

describe("figura do painel = renderPic do dune (ids batem com o map)", () => {
  it("cada forma do map existe como <g id=sN> no SVG do renderPic", () => {
    const run = simulatePic(RC_FIGURE);
    const svg = renderPic(RC_FIGURE);
    const ids = new Set([...svg.matchAll(/<g id="s(\d+)"/g)].map((m) => Number(m[1])));
    const { map } = run.pic;
    for (const el of map.elements)
      for (const n of elementShapes(map, el.refdes)) expect(ids.has(n)).toBe(true);
    for (const net of map.nets) for (const n of net.shapes) expect(ids.has(n)).toBe(true);
    // o 1º objeto de cada elemento é o texto do valor (o "1k" do R1)
    const r1 = elementShapes(map, "R1");
    expect(svg).toMatch(new RegExp(`<g id="s${r1[0]}">\\s*<text[^>]*>1k<`));
    // as formas de rede são do próprio fonte (fios/pontos/terra)
    const gnd = map.nets.find((n) => n.name === "0")!;
    expect(gnd.shapes.length).toBeGreaterThan(0);
  });

  it("traços e linhas do netlist resolvem para formas", () => {
    const { map } = simulatePic(RC_FIGURE).pic;
    expect(traceShapes(map, "v(vout)")).toEqual(map.nets.find((n) => n.name === "Vout")!.shapes);
    expect(traceShapes(map, "i(v1)")).toEqual(elementShapes(map, "V1"));
    expect(traceShapes(map, "v1#branch")).toEqual(elementShapes(map, "V1"));
    expect(netlistLineShapes(map, "C1 Vout 0 1u")).toEqual(elementShapes(map, "C1"));
    expect(netlistLineShapes(map, ".tran 20u 5m")).toEqual([]);
    expect(traceShapes(map, "v(nope)")).toEqual([]);
  });
});
