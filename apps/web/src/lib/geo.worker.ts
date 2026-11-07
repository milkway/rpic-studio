// Worker do build geo do rpic (ver lib/geo.ts: por que num worker).
import { compileGeo, ensureGeo } from "./geo";
import { handleGeoRequest, type GeoRequest, type GeoResponse } from "./geoProtocol";

// O tsconfig tipa com a lib DOM (não a de worker): só o que usamos do escopo.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<GeoRequest>) => void) | null;
  postMessage(msg: GeoResponse): void;
};

const api = { ensure: () => ensureGeo(), compileGeo };

ctx.onmessage = async (e) => {
  if (e.data?.type !== "geo") return;
  ctx.postMessage(await handleGeoRequest(e.data, api));
};
