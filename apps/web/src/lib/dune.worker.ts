// Worker da simulação: o dune roda até o fim na thread que o chama, então a
// UI só consegue interromper uma simulação longa TERMINANDO este worker
// (botão Cancelar → `worker.terminate()`; ver lib/simClient.ts).
import { ensureDune, renderPic, simulatePic } from "./dune";
import {
  handleSimRequest,
  transferablesOf,
  type SimRequest,
  type SimResponse,
} from "./simProtocol";

// O tsconfig tipa com a lib DOM (não a de worker): só o que usamos do escopo.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SimRequest>) => void) | null;
  postMessage(msg: SimResponse, transfer: Transferable[]): void;
};

const api = { ensure: () => ensureDune(), simulatePic, renderPic };

ctx.onmessage = async (e) => {
  if (e.data?.type !== "run") return;
  const res = await handleSimRequest(e.data, api);
  // colunas tipadas: transfere os buffers (zero cópia) em vez de clonar
  ctx.postMessage(res, transferablesOf(res));
};
