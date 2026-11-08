// useSimulation com um worker FALSO (respostas à mão): o que acontece com o
// estado quando um re-run de slider falha.
import { act, renderHook } from "@testing-library/react";
import { pinCanvas, useSimulation } from "@/lib/useSimulation";
import type { WorkerLike } from "@/lib/simClient";
import type { SimRequest, SimResponse } from "@/lib/simProtocol";
import type { PicRun } from "@/lib/dune";

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<SimResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: SimRequest[] = [];
  terminated = false;
  postMessage(msg: SimRequest) {
    this.sent.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  reply(res: SimResponse) {
    this.onmessage?.({ data: res } as MessageEvent<SimResponse>);
  }
  last() {
    return this.sent.at(-1)!;
  }
}

const RUN: PicRun = {
  plots: [],
  measurements: [],
  pss: [],
  notes: ["boa"],
  diagnostics: [],
  pic: {
    netlist: "R1 a 0 1k",
    diagnostics: [],
    map: { elements: [], nets: [], canvas: { w: 0, h: 0, origin: [0, 0], rescale: 1 } },
  },
};
const timing = { open: 0, alter: 0, run: 0 };
const ok = (id: number, fresh: boolean): SimResponse => ({
  type: "ok",
  id,
  fresh,
  ms: 1,
  timing,
  run: RUN,
  ...(fresh ? { figure: { svg: "<svg/>" }, controls: [] } : {}),
});

async function setup() {
  const workers: FakeWorker[] = [];
  const hook = renderHook(() =>
    useSimulation(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    }),
  );
  act(() => hook.result.current.start("src"));
  await act(async () => workers[0].reply(ok(workers[0].last().id, true)));
  expect(hook.result.current.run).toBe(RUN);
  return { hook, workers };
}

describe("useSimulation: re-run que falha", () => {
  it("erro de `alter` num re-run mantém o último resultado e mostra o erro", async () => {
    const { hook, workers } = await setup();
    act(() => hook.result.current.setAlters({ R1: 0 }, true));
    const w = workers[0];
    await act(async () =>
      w.reply({
        type: "error",
        id: w.last().id,
        fresh: false,
        ms: 1,
        timing,
        error: { message: "R1: resistance must be nonzero", kind: "alter", diagnostics: [] },
      }),
    );
    const s = hook.result.current;
    expect(s.status).toBe("error");
    expect(s.failure?.kind).toBe("alter");
    expect(s.run).toBe(RUN); // o gráfico não some no meio do arrasto
    expect(s.figure).toEqual({ svg: "<svg/>" });
    // o próximo re-run bom limpa o erro
    act(() => hook.result.current.setAlters({ R1: 2e3 }, true));
    await act(async () => w.reply(ok(w.last().id, false)));
    expect(hook.result.current.status).toBe("done");
    expect(hook.result.current.failure).toBeNull();
  });

  it("execução nova (Simular) que falha limpa o resultado", async () => {
    const { hook, workers } = await setup();
    act(() => hook.result.current.start("src"));
    const w = workers[0];
    await act(async () =>
      w.reply({
        type: "error",
        id: w.last().id,
        fresh: false,
        ms: 1,
        timing,
        error: { message: "boom", kind: "analysis", diagnostics: [] },
      }),
    );
    expect(hook.result.current.run).toBeNull();
  });

  it("worker que morre num re-run: o mesmo pedido pode ser repetido", async () => {
    const { hook, workers } = await setup();
    act(() => hook.result.current.setAlters({ R1: 2e3 }, true));
    expect(workers[0].last().alters).toEqual({ R1: 2e3 });
    await act(async () => workers[0].onerror?.({ message: "worker crashed" } as ErrorEvent));
    expect(hook.result.current.status).toBe("error");
    expect(hook.result.current.failure?.message).toBe("worker crashed");
    expect(hook.result.current.run).toBe(RUN);
    // tentar de novo com o MESMO valor sai (worker novo), não é de-duplicado
    act(() => hook.result.current.setAlters({ R1: 2e3 }, true));
    expect(workers).toHaveLength(2);
    expect(workers[1].last()).toMatchObject({ alters: { R1: 2e3 } });
    await act(async () => workers[1].reply(ok(workers[1].last().id, true)));
    expect(hook.result.current.status).toBe("done");
  });
});

describe("useSimulation: passos finos (issue #19)", () => {
  it("alternar re-roda UMA vez (re-run, sem reabrir) e os sliders levam o modo", async () => {
    const { hook, workers } = await setup();
    const w = workers[0];
    const n = w.sent.length;
    expect(w.last().fine).toBeUndefined();
    act(() => hook.result.current.setFine(true));
    expect(w.sent).toHaveLength(n + 1);
    expect(w.last()).toMatchObject({ source: "src", fine: true });
    await act(async () => w.reply(ok(w.last().id, false)));
    expect(hook.result.current.fine).toBe(true);
    expect(hook.result.current.rerun).toBe(true);
    // o mesmo modo de novo: nada sai
    act(() => hook.result.current.setFine(true));
    expect(w.sent).toHaveLength(n + 1);
    // slider no modo fino
    act(() => hook.result.current.setAlters({ R1: 2e3 }, true));
    expect(w.last()).toMatchObject({ alters: { R1: 2e3 }, fine: true });
    await act(async () => w.reply(ok(w.last().id, false)));
    // Simular de novo também leva o modo
    act(() => hook.result.current.start("src"));
    expect(w.last()).toMatchObject({ fine: true });
    expect(workers).toHaveLength(1);
  });

  it("ocioso: só guarda o modo; o 1º Simular já sai no fino", () => {
    const workers: FakeWorker[] = [];
    const hook = renderHook(() =>
      useSimulation(() => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      }),
    );
    act(() => hook.result.current.setFine(true));
    expect(workers).toHaveLength(0);
    act(() => hook.result.current.start("src"));
    expect(workers[0].last()).toMatchObject({ fine: true });
  });
});

it("passos finos numa execução que FALHOU sem resultado: não re-roda nem vira 're-run'", async () => {
  const workers: FakeWorker[] = [];
  const hook = renderHook(() =>
    useSimulation(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    }),
  );
  act(() => hook.result.current.start("src"));
  const w = workers[0];
  await act(async () =>
    w.reply({
      type: "error",
      id: w.last().id,
      fresh: true,
      ms: 1,
      timing,
      error: { message: "no deck", kind: "pic", diagnostics: [] },
    }),
  );
  expect(hook.result.current.run).toBeNull();
  const n = w.sent.length;
  act(() => hook.result.current.setFine(true));
  expect(w.sent).toHaveLength(n); // nada sai
  expect(hook.result.current.fine).toBe(true);
  expect(hook.result.current.status).toBe("error");
  expect(hook.result.current.rerun).toBe(false); // sem selo "re-rodou em"
  // o próximo Simular leva o modo
  act(() => hook.result.current.start("src"));
  expect(w.last()).toMatchObject({ fine: true });
});

describe("useSimulation: cartão reescrito e grade (issue #33)", () => {
  it("reopen: re-run no fonte novo com o conjunto alters; epoch fica; cadeia de adoções morre", async () => {
    const { hook, workers } = await setup();
    const w = workers[0];
    act(() => hook.result.current.setAlters({ R1: 2e3 }, true));
    await act(async () => w.reply(ok(w.last().id, false)));
    // uma escrita de slider pendente (A→B) e, antes da resposta, o cartão
    act(() => hook.result.current.adopt("B", { C1: 1e-6 }));
    expect(w.last().adopt).toHaveLength(1);
    const epoch = hook.result.current.epoch;
    act(() => hook.result.current.reopen("B2"));
    expect(hook.result.current.source).toBe("B2");
    // a resposta da adoção ainda chega; o reopen entra na fila (o mais novo)
    await act(async () => w.reply({ ...ok(w.last().id, false), liveSource: "B" }));
    const req = w.last();
    expect(req).toMatchObject({ source: "B2", alters: { R1: 2e3 } });
    expect(req.adopt).toBeUndefined();
    await act(async () => w.reply({ ...ok(req.id, true), liveSource: "B2", displayGrid: "deck" }));
    const s = hook.result.current;
    expect(s.epoch).toBe(epoch); // plot/probes/cursor ficam
    expect(s.rerun).toBe(true);
    expect(s.alters).toEqual({ R1: 2e3 });
    expect(workers).toHaveLength(1);
  });

  it("reopen numa execução que falhou (cartão a corrigir) re-roda; ocioso só guarda", async () => {
    const workers: FakeWorker[] = [];
    const hook = renderHook(() =>
      useSimulation(() => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      }),
    );
    act(() => hook.result.current.start("src"));
    const w = workers[0];
    await act(async () =>
      w.reply({
        type: "error",
        id: w.last().id,
        fresh: true,
        ms: 1,
        timing,
        error: { message: "timestep too small", kind: "analysis", diagnostics: [], pic: RUN.pic },
      }),
    );
    act(() => hook.result.current.reopen("fixed"));
    expect(w.last()).toMatchObject({ source: "fixed" });
    await act(async () => w.reply(ok(w.last().id, true)));
    expect(hook.result.current.status).toBe("done");
    expect(hook.result.current.run).toBe(RUN);
  });

  it("grid: a da resposta na tela; re-run que falha mantém a do run mostrado", async () => {
    const { hook, workers } = await setup();
    const w = workers[0];
    expect(hook.result.current.grid).toEqual({ mode: "deck", deckPoints: null });
    act(() => hook.result.current.setFine(true));
    // a resposta ao toggle ainda não chegou: o run mostrado é o da grade do deck
    expect(hook.result.current.fine).toBe(true);
    expect(hook.result.current.grid?.mode).toBe("deck");
    await act(async () =>
      w.reply({ ...ok(w.last().id, true), displayGrid: "dense", deckPoints: [51] }),
    );
    expect(hook.result.current.grid).toEqual({ mode: "dense", deckPoints: [51] });
    act(() => hook.result.current.setAlters({ R1: 0 }, true));
    await act(async () =>
      w.reply({
        type: "error",
        id: w.last().id,
        fresh: false,
        ms: 1,
        timing,
        error: { message: "bad", kind: "alter", diagnostics: [] },
      }),
    );
    expect(hook.result.current.grid?.mode).toBe("dense");
    act(() => hook.result.current.setAlters({ R1: 2e3 }, true));
    await act(async () => w.reply({ ...ok(w.last().id, true), displayGrid: "fallback" }));
    expect(hook.result.current.grid).toEqual({ mode: "fallback", deckPoints: null });
  });
});

describe("useSimulation: frame dos terminais = figura e extração do MESMO texto", () => {
  const runOf = (ox: number): PicRun => ({
    ...RUN,
    pic: {
      ...RUN.pic,
      map: { ...RUN.pic.map, canvas: { w: 3, h: 2, origin: [ox, 0], rescale: 1 } },
    },
  });

  it("resposta da adoção de B chega depois da escrita B→C: sem canvas até a de C", async () => {
    const { hook, workers } = await setup();
    const w = workers[0];
    // a execução inicial (worker falso, sem picSource): figura e mapa de "src"
    expect(pinCanvas(hook.result.current)).toEqual(RUN.pic.map.canvas);
    act(() => hook.result.current.adopt("B", { R1: 2e3 }));
    const toB = w.last();
    expect(toB.source).toBe("B");
    // a 2ª escrita (B→C) antes da resposta da 1ª
    act(() => hook.result.current.adopt("C", { R1: 3e3 }));
    await act(async () =>
      w.reply({
        type: "ok",
        id: toB.id,
        fresh: false,
        ms: 1,
        timing,
        run: runOf(0.5),
        figure: { svg: "<svg>B</svg>" },
        liveSource: "B",
        picSource: "B",
      }),
    );
    let s = hook.result.current;
    // a figura de B não pisa na corrente (o fonte já é C): fica a de "src";
    // o run (e o mapa) é o de B → texto diferente, nada de canvas
    expect(s.figure).toEqual({ svg: "<svg/>" });
    expect(s.run?.pic.map.canvas.origin[0]).toBe(0.5);
    expect(pinCanvas(s)).toBeNull();
    // a resposta de C traz figura e mapa de C: o canvas volta, o de C
    const toC = w.last();
    expect(toC.source).toBe("C");
    await act(async () =>
      w.reply({
        type: "ok",
        id: toC.id,
        fresh: false,
        ms: 1,
        timing,
        run: runOf(0.75),
        figure: { svg: "<svg>C</svg>" },
        liveSource: "C",
        picSource: "C",
      }),
    );
    s = hook.result.current;
    expect(s.figure).toEqual({ svg: "<svg>C</svg>" });
    expect(pinCanvas(s)?.origin).toEqual([0.75, 0]);
  });

  it("extração que ficou para trás (adoção sem mapa novo): sem canvas", async () => {
    const { hook, workers } = await setup();
    const w = workers[0];
    act(() => hook.result.current.adopt("B", { R1: 2e3 }));
    await act(async () =>
      w.reply({
        type: "ok",
        id: w.last().id,
        fresh: false,
        ms: 1,
        timing,
        run: RUN,
        figure: { svg: "<svg>B</svg>" },
        liveSource: "B",
        picSource: "src",
      }),
    );
    expect(hook.result.current.figure).toEqual({ svg: "<svg>B</svg>" });
    expect(pinCanvas(hook.result.current)).toBeNull();
  });
});
