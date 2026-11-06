// Protocolo UI ↔ worker com um worker FALSO (jsdom não tem Worker).
import { SimCancelled, SimClient, type WorkerLike } from "@/lib/simClient";
import type { SimRequest, SimResponse } from "@/lib/simProtocol";

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
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new SimClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { client, workers };
}

const okFor = (id: number): SimResponse => ({
  type: "ok",
  id,
  prelude: "",
  ms: 1,
  run: {
    plots: [],
    notes: [],
    diagnostics: [],
    pic: { netlist: "", diagnostics: [], map: { elements: [], nets: [] } },
  },
});

describe("SimClient", () => {
  it("cria o worker só no 1º run e resolve pela resposta do mesmo id", async () => {
    const { client, workers } = setup();
    expect(workers).toHaveLength(0); // lazy: nada de wasm antes de rodar
    const p = client.run("src");
    expect(workers).toHaveLength(1);
    expect(workers[0].sent[0]).toMatchObject({ type: "run", source: "src" });
    expect(client.busy).toBe(true);
    workers[0].reply(okFor(workers[0].sent[0].id));
    await expect(p).resolves.toMatchObject({ type: "ok" });
    expect(client.busy).toBe(false);
    // reaproveita o worker vivo
    client.run("de novo");
    expect(workers).toHaveLength(1);
  });

  it("cancel termina o worker e rejeita com SimCancelled; o próximo run cria outro", async () => {
    const { client, workers } = setup();
    const p = client.run("lento");
    client.cancel();
    await expect(p).rejects.toBeInstanceOf(SimCancelled);
    expect(workers[0].terminated).toBe(true);
    const q = client.run("outro");
    expect(workers).toHaveLength(2);
    workers[1].reply(okFor(workers[1].sent[0].id));
    await expect(q).resolves.toMatchObject({ type: "ok" });
  });

  it("um run novo cancela o anterior; resposta de id velho é ignorada", async () => {
    const { client, workers } = setup();
    const first = client.run("a");
    const second = client.run("b");
    await expect(first).rejects.toBeInstanceOf(SimCancelled);
    const w = workers[1];
    w.reply(okFor(999)); // id que ninguém espera
    expect(client.busy).toBe(true);
    w.reply(okFor(w.sent[0].id));
    await expect(second).resolves.toMatchObject({ type: "ok" });
  });

  it("erro do worker (fora do protocolo) rejeita e descarta o worker", async () => {
    const { client, workers } = setup();
    const p = client.run("x");
    workers[0].onerror?.({ message: "boom" } as ErrorEvent);
    await expect(p).rejects.toThrow("boom");
    expect(workers[0].terminated).toBe(true);
  });
});
