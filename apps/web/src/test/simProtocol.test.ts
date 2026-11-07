// sessionControls com uma Session FALSA: o nome mostrado no cabeçalho do
// slider é o do parâmetro que `param(refdes)`/`alter(refdes, v)` movem.
import { sessionControls, SimHost, type SimAdopt } from "@/lib/simProtocol";
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
    options: undefined,
    tmaxDivisor: undefined,
    free: () => undefined,
  };
}

const picOf = (refdes: string[]): PicExtraction => ({
  netlist: "",
  diagnostics: [],
  map: { elements: refdes.map((r) => ({ refdes: r, shapes: { start: 0, end: 0 }, pins: [] })), nets: [] },
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

describe("SimHost: parâmetro do controle e adoção do fonte reescrito", () => {
  function recordingSession(
    calls: unknown[][],
    failOn: (args: unknown[]) => boolean = () => false,
  ): SimSession {
    const values: Record<string, Record<string, number>> = {
      V1: { dc: 0, acmag: 1 },
      R1: { resistance: 1000 },
    };
    return {
      alter: (...args: unknown[]) => {
        if (failOn(args)) throw Object.assign(new Error("refused"), { kind: "alter" });
        calls.push(args);
      },
      alterable: (r) => Object.keys(values[r]),
      param: (r, name) => values[r][name ?? Object.keys(values[r])[0]],
      runTyped: () => ({ plots: [], notes: [], diagnostics: [] }) as never,
      pic: {
        netlist: "V1 a 0 AC 1\nR1 a 0 1k\n.ac dec 10 1 1k\n",
        diagnostics: [],
        map: {
          elements: [
            { refdes: "V1", shapes: { start: 0, end: 1 }, pins: [] },
            { refdes: "R1", shapes: { start: 1, end: 2 }, pins: [] },
          ],
          nets: [],
        },
      },
      options: undefined,
      tmaxDivisor: undefined,
      free: () => undefined,
    };
  }

  it("sob .ac, alter(refdes, 'acmag', v); adotar aplica o valor escrito mesmo se o re-run anterior se perdeu", async () => {
    const calls: unknown[][] = [];
    const renders: string[] = [];
    const host = new SimHost({
      ensure: async () => undefined,
      openSession: () => recordingSession(calls),
      renderPic: (src) => {
        renders.push(src);
        return `<svg>${src}</svg>`;
      },
    });
    const open = await host.handle({ type: "run", id: 1, source: "A" });
    expect(open.controls?.map((c) => [c.refdes, c.param, c.value])).toEqual([
      ["V1", "acmag", 1],
      ["R1", "resistance", 1000],
    ]);
    await host.handle({ type: "run", id: 2, source: "A", alters: { V1: 2 } });
    expect(calls.at(-1)).toEqual(["V1", "acmag", 2]);

    // o re-run de R1 = 2200 foi DESCARTADO pela fila; chega só a adoção
    const res = await host.handle({
      type: "run",
      id: 3,
      source: "B",
      alters: { V1: 2 },
      adopt: [{ from: "A", to: "B", originals: { R1: 2200 } }],
    });
    expect(res.fresh).toBe(false); // mesma sessão
    expect(calls.at(-1)).toEqual(["R1", "resistance", 2200]);
    expect(res.figure).toEqual({ svg: "<svg>B</svg>" });
    expect(res.controls?.find((c) => c.refdes === "R1")?.value).toBe(2200);
    // sair das alterações volta R1 ao valor ADOTADO, não ao da abertura
    calls.length = 0;
    await host.handle({ type: "run", id: 4, source: "B", alters: {} });
    expect(calls).toEqual([["V1", "acmag", 1]]);
    // adoção repetida (já adotada) é inócua; `from` que não bate reabre
    const again = await host.handle({
      type: "run",
      id: 5,
      source: "B",
      adopt: [{ from: "A", to: "B", originals: { R1: 2200 } }],
    });
    expect(again.fresh).toBe(false);
    const other = await host.handle({
      type: "run",
      id: 6,
      source: "C",
      adopt: [{ from: "Z", to: "C", originals: { R1: 1 } }],
    });
    expect(other.fresh).toBe(true);
    expect(renders).toEqual(["A", "B", "C"]);
  });

  it("adoção que falha no meio é transacional: desfaz os alters feitos e não troca o fonte", async () => {
    const calls: unknown[][] = [];
    const host = new SimHost({
      ensure: async () => undefined,
      // V1 = 3 é recusado
      openSession: () => recordingSession(calls, (a) => a[0] === "V1" && a[2] === 3),
      renderPic: (src) => `<svg>${src}</svg>`,
    });
    await host.handle({ type: "run", id: 1, source: "A" });
    calls.length = 0;
    const bad = await host.handle({
      type: "run",
      id: 2,
      source: "B",
      adopt: [{ from: "A", to: "B", originals: { R1: 2200, V1: 3 } }],
    });
    expect(bad.type).toBe("error");
    expect(bad.type === "error" && bad.error.kind).toBe("alter");
    // R1 foi a 2200 e VOLTOU a 1000; nada de V1
    expect(calls).toEqual([
      ["R1", "resistance", 2200],
      ["R1", "resistance", 1000],
    ]);
    // a sessão segue sendo a de "A", com os originais da abertura
    calls.length = 0;
    const again = await host.handle({ type: "run", id: 3, source: "A", alters: { R1: 5 } });
    expect(again.fresh).toBe(false);
    await host.handle({ type: "run", id: 4, source: "A", alters: {} });
    expect(calls).toEqual([
      ["R1", "resistance", 5],
      ["R1", "resistance", 1000],
    ]);
  });

  it("cadeia de adoções: worker em qualquer ponto segue até o fim, sem reabrir", async () => {
    const calls: unknown[][] = [];
    let opens = 0;
    const host = new SimHost({
      ensure: async () => undefined,
      openSession: () => {
        opens++;
        return recordingSession(calls);
      },
      renderPic: (src) => `<svg>${src}</svg>`,
    });
    const chain: SimAdopt[] = [
      { from: "A", to: "B", originals: { R1: 2200 } },
      { from: "B", to: "C", originals: { R1: 3300, V1: 2 } },
    ];
    await host.handle({ type: "run", id: 1, source: "A" });
    // o worker já adotou o 1º passo (B) e recebe a cadeia inteira até C
    const b = await host.handle({ type: "run", id: 2, source: "B", adopt: chain.slice(0, 1) });
    expect(b.liveSource).toBe("B");
    const c = await host.handle({ type: "run", id: 3, source: "C", adopt: chain });
    expect(c.fresh).toBe(false);
    expect(c.liveSource).toBe("C");
    expect(c.controls?.map((x) => [x.refdes, x.value])).toEqual([
      ["V1", 2],
      ["R1", 3300],
    ]);
    // e em A direto (o pedido do 1º passo se perdeu): os dois passos de uma vez
    const host2 = new SimHost({
      ensure: async () => undefined,
      openSession: () => {
        opens++;
        return recordingSession([]);
      },
      renderPic: (src) => `<svg>${src}</svg>`,
    });
    await host2.handle({ type: "run", id: 1, source: "A" });
    const c2 = await host2.handle({ type: "run", id: 2, source: "C", adopt: chain });
    expect(c2.fresh).toBe(false);
    expect(c2.controls?.find((x) => x.refdes === "R1")?.value).toBe(3300);
    expect(opens).toBe(2); // uma abertura por host, nenhuma reabertura
  });
});

describe("SimHost: modo passos finos (issue #19)", () => {
  /** Sessão que registra as atribuições de `options`/`tmaxDivisor`. */
  function modeSession(log: string[]): SimSession {
    let options: SimSession["options"];
    let tmax: SimSession["tmaxDivisor"];
    return {
      alter: () => undefined,
      alterable: () => [],
      param: () => null,
      runTyped: () => ({ plots: [], measurements: [], notes: [], diagnostics: [] }),
      pic: { netlist: "", diagnostics: [], map: { elements: [], nets: [] } },
      get options() {
        return options;
      },
      set options(v) {
        log.push(`options=${JSON.stringify(v)}`);
        options = v;
      },
      get tmaxDivisor() {
        return tmax;
      },
      set tmaxDivisor(v) {
        log.push(`tmax=${v}`);
        tmax = v;
      },
      free: () => undefined,
    };
  }

  it("liga/desliga pelos setters da sessão viva, sem reabrir; só quando muda", async () => {
    const log: string[] = [];
    let opens = 0;
    const host = new SimHost({
      ensure: async () => undefined,
      openSession: () => {
        opens++;
        return modeSession(log);
      },
      renderPic: () => "<svg/>",
    });
    await host.handle({ type: "run", id: 1, source: "A" });
    expect(log).toEqual([]); // modo normal na abertura: nada a mexer
    const on = await host.handle({ type: "run", id: 2, source: "A", fine: true });
    expect(on.fresh).toBe(false);
    expect(log).toEqual(['options={"trtol":1}', "tmax=10"]);
    // re-run de slider no modo fino: não repete os setters
    await host.handle({ type: "run", id: 3, source: "A", fine: true, alters: {} });
    expect(log).toHaveLength(2);
    // desligar devolve as opções do deck e limpa o divisor
    const off = await host.handle({ type: "run", id: 4, source: "A" });
    expect(off.fresh).toBe(false);
    expect(log.slice(2)).toEqual(["options=null", "tmax=null"]);
    // fonte novo já pedido no fino: sessão nova recebe o modo
    await host.handle({ type: "run", id: 5, source: "B", fine: true });
    expect(log.slice(4)).toEqual(['options={"trtol":1}', "tmax=10"]);
    expect(opens).toBe(2);
  });
});
