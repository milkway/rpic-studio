// sessionControls com uma Session FALSA: o nome mostrado no cabeçalho do
// slider é o do parâmetro que `param(refdes)`/`alter(refdes, v)` movem.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  sessionControls,
  SimHost,
  type SimAdopt,
  type SimApi,
  type SimResponse,
} from "@/lib/simProtocol";
import { displayDeck } from "@/lib/simAnalysis";
import {
  ensureDune,
  extractPic,
  openDeck,
  openSession,
  renderPic,
  type PicExtraction,
  type SimSession,
} from "@/lib/dune";
import { applySourceEdit, valueEdit } from "@/lib/simSource";
import { RC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

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
  map: { elements: refdes.map((r) => ({ refdes: r, shapes: { start: 0, end: 0 }, pins: [], value: null, params: [], principal: null })), nets: [], canvas: { w: 0, h: 0, origin: [0, 0], rescale: 1 } },
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
            { refdes: "V1", shapes: { start: 0, end: 1 }, pins: [], value: null, params: [], principal: null },
            { refdes: "R1", shapes: { start: 1, end: 2 }, pins: [], value: null, params: [], principal: null },
          ],
          nets: [],
          canvas: { w: 0, h: 0, origin: [0, 0], rescale: 1 },
        },
      },
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

describe("SimHost: a adoção traz a extração do texto NOVO (spans + canvas)", () => {
  beforeAll(async () => {
    await ensureDune(
      readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
    );
  });

  it("depois de escrever de volta, run.pic.map = extractPic do texto novo (dune real)", async () => {
    const host = new SimHost({ ensure: () => ensureDune(), openSession, renderPic, extractPic });
    const open = await host.handle({ type: "run", id: 1, source: RC_FIGURE });
    expect(open.type).toBe("ok");
    expect(open.picSource).toBe(RC_FIGURE);
    // `1k` → `12.345k`: rótulo mais largo, spans da linha deslocados
    const r = valueEdit(RC_FIGURE, extractPic(RC_FIGURE).map, "R1", "resistance", 12345);
    if (!r.ok) throw new Error(r.reason);
    const next = applySourceEdit(RC_FIGURE, r.edit);
    const res = await host.handle({
      type: "run",
      id: 2,
      source: next,
      adopt: [{ from: RC_FIGURE, to: next, originals: { R1: 12345 } }],
    });
    expect(res.type).toBe("ok");
    if (res.type !== "ok") return;
    expect(res.fresh).toBe(false);
    expect(res.picSource).toBe(next);
    expect(res.figure).toEqual({ svg: renderPic(next) });
    const fresh = extractPic(next).map;
    expect(res.run.pic.map.canvas).toEqual(fresh.canvas);
    expect(res.run.pic.map.elements.map((e) => [e.value, e.params])).toEqual(
      fresh.elements.map((e) => [e.value, e.params]),
    );
    // e NÃO os do texto velho
    const r1 = res.run.pic.map.elements.find((e) => e.refdes === "R1")!;
    expect(r1.value?.text).toBe("12.345k");
  });

  it("extração do texto adotado que falha: fica a figura VELHA junto do mapa velho", async () => {
    const renders: string[] = [];
    const base = openSession(RC_FIGURE);
    const host = new SimHost({
      ensure: () => ensureDune(),
      openSession: () => base,
      renderPic: (src) => {
        renders.push(src);
        return `<svg>${src.length}</svg>`;
      },
      extractPic: () => {
        throw new Error("extract boom");
      },
    });
    await host.handle({ type: "run", id: 1, source: "A" });
    const res = await host.handle({
      type: "run",
      id: 2,
      source: "B",
      adopt: [{ from: "A", to: "B", originals: { R1: 2200 } }],
    });
    expect(res.type).toBe("ok");
    expect(res.liveSource).toBe("B");
    expect(res.picSource).toBe("A"); // o mapa segue sendo o de A…
    expect(res.figure).toBeUndefined(); // …e a figura de B não é desenhada
    expect(renders).toEqual(["A"]);
  });
});

describe("SimHost: grade de exibição (issue #33, dune real)", () => {
  beforeAll(async () => {
    await ensureDune(
      readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
    );
  });

  /** Sessões abertas/liberadas e runs, por tag (`pic` = fiel, `deck` = densa). */
  const counts = { open: { pic: 0, deck: 0 }, free: { pic: 0, deck: 0 }, run: { pic: 0, deck: 0 } };
  beforeEach(() => {
    for (const k of ["open", "free", "run"] as const) counts[k] = { pic: 0, deck: 0 };
  });

  /** A sessão real com registro dos `alter`, runs e `free` (e falha de run opcional). */
  function logged(
    s: SimSession,
    log: unknown[][],
    tag: "pic" | "deck",
    failRun = () => false,
  ): SimSession {
    counts.open[tag]++;
    return {
      alter: (...a: unknown[]) => {
        log.push([tag, ...a]);
        return (s.alter as (...x: unknown[]) => unknown)(...a);
      },
      alterable: (r) => s.alterable(r),
      param: (r, n) => s.param(r, n),
      runTyped: () => {
        counts.run[tag]++;
        if (failRun()) throw Object.assign(new Error("timestep too small"), { kind: "analysis" });
        return s.runTyped();
      },
      get pic() {
        return s.pic;
      },
      free: () => {
        counts.free[tag]++;
        s.free();
      },
    };
  }

  function hostWith(over: Partial<SimApi> = {}) {
    const decks: string[] = [];
    const opened: string[] = [];
    const log: unknown[][] = [];
    const host = new SimHost({
      ensure: () => ensureDune(),
      renderPic,
      extractPic,
      openSession: (src, o) => {
        opened.push(src);
        return logged(openSession(src, o), log, "pic");
      },
      openDeck: (deck, o) => {
        decks.push(deck);
        return logged(openDeck(deck, o), log, "deck");
      },
      ...over,
    });
    return { host, decks, opened, log };
  }
  const points = (res: SimResponse) => (res.type === "ok" ? res.run.plots.map((p) => p.npoints) : []);

  it("modo denso: SÓ o deck refinado abre e roda (nenhum run do fiel na abertura)", async () => {
    const { host, decks, opened } = hostWith();
    const deck = await host.handle({ type: "run", id: 1, source: RC_FIGURE });
    expect(deck.displayGrid).toBe("deck");
    const M = points(deck)[0];
    for (const k of ["open", "free", "run"] as const) counts[k] = { pic: 0, deck: 0 };
    opened.length = 0;

    const dense = await host.handle({ type: "run", id: 2, source: RC_FIGURE, fine: true });
    expect(dense.type).toBe("ok");
    expect(dense.displayGrid).toBe("dense");
    expect(decks).toHaveLength(1);
    expect(decks[0]).toContain("\n.tran 20u 5m 0 8.333333e-6\n");
    expect(decks[0]).toBe(displayDeck(extractPic(RC_FIGURE).netlist));
    expect(points(dense)[0]).toBeGreaterThanOrEqual(600);
    expect(points(dense)[0]).toBeGreaterThan(M);
    // a sessão fiel anterior foi liberada; nenhuma fiel nova abriu nem rodou
    expect(opened).toEqual([]);
    expect(counts.free.pic).toBe(1);
    expect(counts.run).toEqual({ pic: 0, deck: 1 });
    host.dispose();
    expect(counts.free.deck).toBe(1);
    // a extração (netlist mostrado) e a figura seguem as do fonte, FIÉIS
    if (dense.type === "ok") expect(dense.run.pic.netlist).toContain("\n.tran 20u 5m\n");
    expect(dense.figure).toEqual({ svg: renderPic(RC_FIGURE) });
    expect(dense.controls?.map((c) => c.refdes)).toEqual(["R1", "C1"]);
  });

  it("deck que não abre denso: recua para o fiel e diz `fallback`", async () => {
    const { host } = hostWith({
      openDeck: () => {
        throw Object.assign(new Error("bad deck"), { kind: "parse" });
      },
    });
    const res = await host.handle({ type: "run", id: 1, source: RC_FIGURE, fine: true });
    expect(res.type).toBe("ok");
    expect(res.displayGrid).toBe("fallback");
    expect(points(res)[0]).toBeLessThan(600);
    // a fiel abre e roda UMA vez
    expect(counts.open.pic).toBe(1);
    expect(counts.run.pic).toBe(1);
  });

  it("sessão aberta que não vira `Live` (controles lançam) é liberada", async () => {
    const broken = {
      ...extractPic(RC_FIGURE),
      map: { elements: null } as unknown as PicExtraction["map"],
    };
    const { host } = hostWith({ extractPic: () => broken });
    const res = await host.handle({ type: "run", id: 1, source: RC_FIGURE, fine: true });
    expect(res.type).toBe("error");
    expect(counts.open.deck).toBe(1);
    expect(counts.free.deck).toBe(1);
  });

  it("run denso que falha e a fiel nem abre: o erro mostrado é o ORIGINAL do run denso", async () => {
    let failDense = false;
    let refuseFaithful = false;
    const log: unknown[][] = [];
    const host = new SimHost({
      ensure: () => ensureDune(),
      renderPic,
      extractPic,
      openSession: (src, o) => {
        if (refuseFaithful) throw Object.assign(new Error("out of memory"), { kind: "internal" });
        return logged(openSession(src, o), log, "pic");
      },
      openDeck: (d, o) => logged(openDeck(d, o), log, "deck", () => failDense),
    });
    await host.handle({ type: "run", id: 1, source: RC_FIGURE, fine: true });
    failDense = true;
    refuseFaithful = true;
    const res = await host.handle({ type: "run", id: 2, source: RC_FIGURE, fine: true, alters: { R1: 2000 } });
    expect(res.type).toBe("error");
    if (res.type !== "error") return;
    expect(res.error.kind).toBe("analysis");
    expect(res.error.message).toBe("timestep too small (deck grid: out of memory)");
    expect(res.displayGrid).toBe("dense"); // a sessão densa ficou (não liberada)
    expect(counts.free.deck).toBe(0);
  });

  it("run denso que falha (já aberto, num re-run de slider): recua, reaplica os alters", async () => {
    let failDense = false;
    const log: unknown[][] = [];
    const opened: string[] = [];
    const host = new SimHost({
      ensure: () => ensureDune(),
      renderPic,
      extractPic,
      openSession: (src, o) => {
        opened.push(src);
        return logged(openSession(src, o), log, "pic");
      },
      openDeck: (d, o) => logged(openDeck(d, o), log, "deck", () => failDense),
    });
    const ok = await host.handle({ type: "run", id: 1, source: RC_FIGURE, fine: true });
    expect(ok.displayGrid).toBe("dense");
    failDense = true;
    log.length = 0;
    const res = await host.handle({ type: "run", id: 2, source: RC_FIGURE, fine: true, alters: { R1: 2000 } });
    expect(res.type).toBe("ok");
    expect(res.displayGrid).toBe("fallback");
    expect(res.fresh).toBe(true);
    expect(res.controls?.length).toBe(2);
    // o alter foi ao denso (que falhou) e de novo à sessão fiel
    expect(log).toEqual([
      ["deck", "R1", "resistance", 2000],
      ["pic", "R1", "resistance", 2000],
    ]);
    expect(opened.at(-1)).toBe(RC_FIGURE);
    // segue `fallback` até reabrir (a sessão é a fiel)
    const again = await host.handle({ type: "run", id: 3, source: RC_FIGURE, fine: true, alters: {} });
    expect(again.displayGrid).toBe("fallback");
    expect(again.fresh).toBe(false);
  });

  it("alternar o modo REABRE (outro deck) e mantém o conjunto alters", async () => {
    const { host, log, decks } = hostWith();
    const a = await host.handle({ type: "run", id: 1, source: RC_FIGURE, alters: { R1: 2000 } });
    expect(a.displayGrid).toBe("deck");
    log.length = 0;
    const on = await host.handle({ type: "run", id: 2, source: RC_FIGURE, alters: { R1: 2000 }, fine: true });
    expect(on.fresh).toBe(true);
    expect(on.displayGrid).toBe("dense");
    expect(decks).toHaveLength(1);
    // só o denso recebe o alter (nenhum run fiel extra na abertura)
    expect(log).toEqual([["deck", "R1", "resistance", 2000]]);
    // R1 = 2k no deck denso dá a MESMA curva que o deck com 2k escrito
    const direct = openDeck(displayDeck(extractPic(RC_FIGURE.replace(", 1k)", ", 2k)")).netlist));
    const want = direct.runTyped().plots[0];
    direct.free();
    if (on.type !== "ok") throw new Error("run");
    expect(on.run.plots[0].npoints).toBe(want.npoints);
    expect(Array.from(on.run.plots[0].columns.at(-1)!).at(-1)).toBe(Array.from(want.columns.at(-1)!).at(-1));
    // e desligar reabre a fiel, de novo com o alter
    log.length = 0;
    const off = await host.handle({ type: "run", id: 3, source: RC_FIGURE, alters: { R1: 2000 } });
    expect(off.fresh).toBe(true);
    expect(off.displayGrid).toBe("deck");
    expect(log).toEqual([["pic", "R1", "resistance", 2000]]);
    expect(points(off)[0]).toBe(points(a)[0]);
  });

  it("adoção (escrita de volta de slider) no modo denso: sem reabrir; deck refeito do netlist NOVO", async () => {
    const { host, opened, decks } = hostWith();
    const open = await host.handle({ type: "run", id: 1, source: RC_FIGURE, fine: true });
    expect(open.displayGrid).toBe("dense");
    const r = valueEdit(RC_FIGURE, extractPic(RC_FIGURE).map, "R1", "resistance", 2200);
    if (!r.ok) throw new Error(r.reason);
    const next = applySourceEdit(RC_FIGURE, r.edit);
    const res = await host.handle({
      type: "run",
      id: 2,
      source: next,
      fine: true,
      adopt: [{ from: RC_FIGURE, to: next, originals: { R1: 2200 } }],
    });
    expect(res.type).toBe("ok");
    expect(res.fresh).toBe(false);
    expect(res.displayGrid).toBe("dense");
    expect(res.liveSource).toBe(next);
    expect(opened).toEqual([]); // nem a abertura nem a adoção abrem a fiel
    expect(decks).toHaveLength(1);
    expect(host.displayDeck).toBe(displayDeck(extractPic(next).netlist));
    expect(host.displayDeck).toContain("R1 Vin Vout 2.2k");
    // o run adotado = abrir o deck denso do texto novo
    const direct = openDeck(displayDeck(extractPic(next).netlist));
    const want = direct.runTyped().plots[0];
    direct.free();
    if (res.type !== "ok") throw new Error("run");
    expect(res.run.plots[0].npoints).toBe(want.npoints);
    expect(Array.from(res.run.plots[0].columns.at(-1)!).at(-1)).toBe(Array.from(want.columns.at(-1)!).at(-1));
    // adoção pedida com o modo trocado não adota: reabre no modo novo
    const off = await host.handle({
      type: "run",
      id: 3,
      source: RC_FIGURE,
      adopt: [{ from: next, to: RC_FIGURE, originals: { R1: 1000 } }],
    });
    expect(off.fresh).toBe(true);
    expect(off.displayGrid).toBe("deck");
  });

  it("cartão reescrito (editor de análise) = fonte novo: reabre com os alters", async () => {
    const { host, log } = hostWith();
    await host.handle({ type: "run", id: 1, source: RC_FIGURE, alters: { C1: 2e-6 } });
    log.length = 0;
    const next = RC_FIGURE.replace(".tran 20u 5m", ".tran 20u 10m");
    const res = await host.handle({ type: "run", id: 2, source: next, alters: { C1: 2e-6 } });
    expect(res.fresh).toBe(true);
    expect(log).toEqual([["pic", "C1", "capacitance", 2e-6]]);
    if (res.type !== "ok") throw new Error("run");
    const t = res.run.plots[0].columns[0];
    expect(t[t.length - 1]).toBeCloseTo(10e-3, 9);
  });
});
