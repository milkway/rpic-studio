// Editor de forma de onda das fontes: `PULSE(…)`/`SIN(…)` lidos do valor da
// chamada pelos spans do `OverlayMap` (extrator REAL do dune) e reescritos
// argumento a argumento — a troca preserva o resto do fonte, o texto novo
// simula com o valor novo, e span velho/entrada inválida nunca escrevem.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applySourceEdit } from "@/lib/simSource";
import { sessionControls } from "@/lib/simProtocol";
import { waveEdit, waveformOf, waveformSources } from "@/lib/simWaveform";
import { ensureDune, extractPic, openSession, simulatePic } from "@/lib/dune";
import { examples } from "@/lib/examples";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ensureDune(
    readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
  );
});

const RC = examples.find((e) => e.id === "sim-rc")!.source;
const RECT = examples.find((e) => e.id === "sim-rectifier")!.source;
const mapOf = (src: string) => extractPic(src).map;

describe("forma de onda da fonte", () => {
  it("a fonte PULSE do RC não tem slider — é o caso que o editor cobre", () => {
    const s = openSession(RC);
    try {
      expect(sessionControls(s, s.pic!).map((c) => c.refdes)).toEqual(["R1", "C1"]);
    } finally {
      s.free();
    }
  });

  it("lê os sete argumentos do PULSE com nome, grandeza e valor", () => {
    const w = waveformOf(RC, mapOf(RC), "V1")!;
    expect(w.fn).toBe("pulse");
    expect(w.unit).toBe("V");
    expect(w.args.map((a) => a.name)).toEqual(["v1", "v2", "td", "tr", "tf", "pw", "per"]);
    expect(w.args.map((a) => a.quantity)).toEqual([
      "level", "level", "time", "time", "time", "time", "time",
    ]);
    expect(w.args.map((a) => a.text)).toEqual(["0", "5", "0", "1u", "1u", "10m", "20m"]);
    expect(w.args.map((a) => a.value)).toEqual([0, 5, 0, 1e-6, 1e-6, 0.01, 0.02]);
    // cada argumento aponta para o próprio texto no fonte
    for (const a of w.args) expect(RC.slice(a.from, a.to)).toBe(a.text);
  });

  it("SIN com três argumentos: só os grafados viram campos", () => {
    const w = waveformOf(RECT, mapOf(RECT), "V1")!;
    expect(w.fn).toBe("sin");
    expect(w.args.map((a) => [a.name, a.text])).toEqual([
      ["vo", "0"],
      ["va", "10"],
      ["freq", "60"],
    ]);
  });

  it("só fontes com função: resistor, capacitor e fonte DC ficam de fora", () => {
    const map = mapOf(RC);
    expect(waveformOf(RC, map, "R1")).toBeNull();
    expect(waveformSources(RC, map).map((w) => w.refdes)).toEqual(["V1"]);
    const dc = RC.replace("PULSE(0 5 0 1u 1u 10m 20m)", "DC 5");
    expect(waveformSources(dc, mapOf(dc))).toEqual([]);
  });

  it("escreve um argumento, preserva o resto e o texto novo simula com ele", () => {
    const map = mapOf(RC);
    const r = waveEdit(RC, map, "V1", 1, " 3 ");
    if (!r.ok) throw new Error(r.reason);
    const next = applySourceEdit(RC, r.edit);
    expect(next).toBe(RC.replace("PULSE(0 5 0", "PULSE(0 3 0"));
    const plot = simulatePic(next).plots[0];
    const vin = plot.columns[plot.variables.findIndex((v) => v.name === "v(vin)")];
    expect(Math.max(...vin)).toBeCloseTo(3, 6);
    // o mapa devolvido já vale para o texto novo: a 2ª edição não espera a execução
    const again = waveEdit(next, r.map, "V1", 5, "2.5m");
    if (!again.ok) throw new Error(again.reason);
    expect(applySourceEdit(next, again.edit)).toContain("PULSE(0 3 0 1u 1u 2.5m 20m)");
    expect(waveformOf(next, r.map, "V1")!.args[1].text).toBe("3");
  });

  it("valor de comprimento diferente desloca os argumentos seguintes", () => {
    const r = waveEdit(RC, mapOf(RC), "V1", 0, "-2.5");
    if (!r.ok) throw new Error(r.reason);
    const next = applySourceEdit(RC, r.edit);
    const w = waveformOf(next, r.map, "V1")!;
    expect(w.args.map((a) => a.text)).toEqual(["-2.5", "5", "0", "1u", "1u", "10m", "20m"]);
    for (const a of w.args) expect(next.slice(a.from, a.to)).toBe(a.text);
  });

  it("entrada inválida, argumento inexistente e mapa velho não escrevem", () => {
    const map = mapOf(RC);
    expect(waveEdit(RC, map, "V1", 1, "abc")).toEqual({ ok: false, reason: "invalid" });
    expect(waveEdit(RC, map, "V1", 1, "3 4")).toEqual({ ok: false, reason: "invalid" });
    expect(waveEdit(RC, map, "V1", 1, "")).toEqual({ ok: false, reason: "invalid" });
    expect(waveEdit(RC, map, "V1", 9, "3")).toEqual({ ok: false, reason: "no-arg" });
    // o fonte mudou desde a extração: o span não bate mais
    const moved = "# nova linha\n" + RC;
    expect(waveformOf(moved, map, "V1")).toBeNull();
    expect(waveEdit(moved, map, "V1", 1, "3")).toEqual({ ok: false, reason: "no-wave" });
  });

  it("argumento que não é número literal aparece, mas não se edita", () => {
    const src = RC.replace("spice = 1", "spice = 1\nvhi = 5").replace(
      "PULSE(0 5 0",
      "PULSE(0 vhi 0",
    );
    const map = mapOf(src);
    const w = waveformOf(src, map, "V1")!;
    expect(w.args[1].text).toBe("vhi");
    expect(w.args[1].value).toBeNull();
    expect(waveEdit(src, map, "V1", 1, "3")).toEqual({ ok: false, reason: "not-literal" });
  });
});
