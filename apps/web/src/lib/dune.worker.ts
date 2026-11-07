// Worker da simulação: o dune roda até o fim na thread que o chama, então a
// UI só consegue interromper uma simulação longa TERMINANDO este worker
// (botão Cancelar → `worker.terminate()`; ver lib/simClient.ts). A `Session`
// do dune-sim mora aqui (`SimHost`): re-runs de slider não re-extraem nem
// re-elaboram o circuito.
import { ensureDune, openSession, renderPic } from "./dune";
import { SimHost, transferablesOf, type SimRequest, type SimResponse } from "./simProtocol";

// O tsconfig tipa com a lib DOM (não a de worker): só o que usamos do escopo.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SimRequest>) => void) | null;
  postMessage(msg: SimResponse, transfer: Transferable[]): void;
};

const host = new SimHost({ ensure: () => ensureDune(), openSession, renderPic });

ctx.onmessage = async (e) => {
  if (e.data?.type !== "run") return;
  const res = await host.handle(e.data);
  // colunas tipadas: transfere os buffers (zero cópia) em vez de clonar
  ctx.postMessage(res, transferablesOf(res));
};
