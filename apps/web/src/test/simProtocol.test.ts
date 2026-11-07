// sessionControls com uma Session FALSA: o nome mostrado no cabeçalho do
// slider é o do parâmetro que `param(refdes)`/`alter(refdes, v)` movem.
import { sessionControls } from "@/lib/simProtocol";
import type { PicExtraction, SimSession } from "@/lib/dune";

type Params = Record<string, { names: string[]; principal: number; by: Record<string, number> }>;

function fakeSession(params: Params): SimSession {
  return {
    alter: () => undefined,
    alterable: (r) => params[r].names,
    param: (r, name) => {
      const p = params[r];
      if (name === undefined) return p.principal;
      if (!(name in p.by)) throw new Error(`no ${name}`);
      return p.by[name];
    },
    runTyped: () => {
      throw new Error("unused");
    },
    pic: undefined,
    free: () => undefined,
  };
}

const picOf = (refdes: string[]): PicExtraction => ({
  netlist: "",
  diagnostics: [],
  map: { elements: refdes.map((r) => ({ refdes: r, shapes: { start: 0, end: 0 } })), nets: [] },
});

describe("sessionControls: nome do parâmetro principal", () => {
  it("usa o nome do valor principal, não o 1º de alterable()", () => {
    const s = fakeSession({
      // ordem de alterable() com o principal FORA da 1ª posição
      C1: { names: ["ic", "capacitance"], principal: 1e-6, by: { ic: 0, capacitance: 1e-6 } },
      V1: { names: ["acmag", "dc"], principal: 10, by: { acmag: 1, dc: 10 } },
      // letra sem mapa: o nome cujo valor bate com param(refdes)
      X1: { names: ["temp", "w"], principal: 5e-6, by: { temp: 27, w: 5e-6 } },
    });
    const c = sessionControls(s, picOf(["C1", "V1", "X1"]));
    expect(c.map((x) => [x.refdes, x.param])).toEqual([
      ["C1", "capacitance"],
      ["V1", "dc"],
      ["X1", "w"],
    ]);
  });

  it("nada confere: cai no 1º nome de alterable()", () => {
    const s = fakeSession({ Y1: { names: ["foo", "bar"], principal: 3, by: { foo: 1 } } });
    expect(sessionControls(s, picOf(["Y1"]))[0].param).toBe("foo");
  });
});
