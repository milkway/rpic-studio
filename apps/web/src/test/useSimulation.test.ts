// useSimulation com um worker FALSO (respostas à mão): o que acontece com o
// estado quando um re-run de slider falha.
import { act, renderHook } from "@testing-library/react";
import { useSimulation } from "@/lib/useSimulation";
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
