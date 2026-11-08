// Protocolo UI ↔ worker com um worker FALSO (jsdom não tem Worker).
import { SimCancelled, SimClient, SimSuperseded, type WorkerLike } from "@/lib/simClient";
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
  fresh: true,
  figure: { svg: "" },
  ms: 1,
  timing: { open: 0, alter: 0, run: 0 },
  run: {
    plots: [],
    measurements: [],
    pss: [],
    notes: [],
    diagnostics: [],
    pic: {
      netlist: "",
      diagnostics: [],
      map: { elements: [], nets: [], canvas: { w: 0, h: 0, origin: [0, 0], rescale: 1 } },
    },
  },
});

describe("SimClient", () => {
  it("cria o worker só no 1º run e resolve pela resposta do mesmo id", async () => {
    const { client, workers } = setup();
    expect(workers).toHaveLength(0); // lazy: nada de wasm antes de rodar
    const p = client.run({ source: "src" });
    expect(workers).toHaveLength(1);
    expect(workers[0].sent[0]).toMatchObject({ type: "run", source: "src" });
    expect(client.busy).toBe(true);
    workers[0].reply(okFor(workers[0].sent[0].id));
    await expect(p).resolves.toMatchObject({ type: "ok" });
    expect(client.busy).toBe(false);
    // reaproveita o worker vivo
    client.run({ source: "de novo" });
    expect(workers).toHaveLength(1);
  });

  it("cancel termina o worker e rejeita com SimCancelled; o próximo run cria outro", async () => {
    const { client, workers } = setup();
    const p = client.run({ source: "lento" });
    client.cancel();
    await expect(p).rejects.toBeInstanceOf(SimCancelled);
    expect(workers[0].terminated).toBe(true);
    const q = client.run({ source: "outro" });
    expect(workers).toHaveLength(2);
    workers[1].reply(okFor(workers[1].sent[0].id));
    await expect(q).resolves.toMatchObject({ type: "ok" });
  });

  it("um run novo cancela o anterior; resposta de id velho é ignorada", async () => {
    const { client, workers } = setup();
    const first = client.run({ source: "a" });
    const second = client.run({ source: "b" });
    await expect(first).rejects.toBeInstanceOf(SimCancelled);
    const w = workers[1];
    w.reply(okFor(999)); // id que ninguém espera
    expect(client.busy).toBe(true);
    w.reply(okFor(w.sent[0].id));
    await expect(second).resolves.toMatchObject({ type: "ok" });
  });

  it("erro do worker (fora do protocolo) rejeita e descarta o worker", async () => {
    const { client, workers } = setup();
    const p = client.run({ source: "x" });
    workers[0].onerror?.({ message: "boom" } as ErrorEvent);
    await expect(p).rejects.toThrow("boom");
    expect(workers[0].terminated).toBe(true);
  });

  it("rerun NÃO mata o worker: espera numa fila de um lugar, o mais novo vence", async () => {
    const { client, workers } = setup();
    const first = client.run({ source: "s" });
    const w = workers[0];
    const a = client.rerun({ source: "s", alters: { R1: 2 } });
    const b = client.rerun({ source: "s", alters: { R1: 3 } });
    await expect(a).rejects.toBeInstanceOf(SimSuperseded);
    expect(w.terminated).toBe(false);
    expect(w.sent).toHaveLength(1); // só a execução em curso saiu
    w.reply(okFor(w.sent[0].id));
    await expect(first).resolves.toMatchObject({ type: "ok" });
    // a fila sai assim que o worker libera, com as alterações dela
    expect(w.sent).toHaveLength(2);
    expect(w.sent[1]).toMatchObject({ source: "s", alters: { R1: 3 } });
    w.reply(okFor(w.sent[1].id));
    await expect(b).resolves.toMatchObject({ type: "ok" });
    expect(workers).toHaveLength(1);
  });

  it("cancel descarta também o rerun enfileirado", async () => {
    const { client, workers } = setup();
    const p = client.run({ source: "s" });
    const q = client.rerun({ source: "s", alters: { C1: 1 } });
    client.cancel();
    await expect(p).rejects.toBeInstanceOf(SimCancelled);
    await expect(q).rejects.toBeInstanceOf(SimCancelled);
    expect(workers[0].terminated).toBe(true);
  });
});
