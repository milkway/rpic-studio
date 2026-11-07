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
  notes: ["boa"],
  diagnostics: [],
  pic: { netlist: "R1 a 0 1k", diagnostics: [], map: { elements: [], nets: [] } },
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
