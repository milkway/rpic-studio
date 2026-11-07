// Protocolo PURO do worker geo (testável sem Worker): pedido → resposta com o
// erro SERIALIZADO — um `Error` perde `.errorInfo`/`.info` no postMessage.
import type {
  Diagnostic,
  GeoJSONFeatureCollection,
  GeoOptions,
  GeoRegistration,
  GeoResult,
  GeoWarning,
  MapLibreLayer,
} from "@strategicprojects/rpic";

export type GeoFrame = "enu" | "mercator";

export interface GeoRequest {
  type: "geo";
  id: number;
  source: string;
  opts: { frame?: GeoFrame; circuits?: boolean; texlabels?: boolean };
}

export type GeoFailure =
  /** erro de pic: posicionado, como o do `compile` */
  | { kind: "pic"; message: string; info: Diagnostic }
  /** erro de georreferência (`no_registration`, `invalid_scale`, …) */
  | { kind: "geo"; message: string; info: { kind: string; message: string; hint?: string } }
  /** qualquer outra coisa (falha de carga do wasm, nome de feature inválido) */
  | { kind: "other"; message: string };

export interface GeoOk {
  type: "ok";
  id: number;
  geojson: GeoJSONFeatureCollection;
  layers: MapLibreLayer[];
  warnings: (GeoWarning | Diagnostic)[];
  /** `print` + avisos do engine (ex.: "texlabels: no math renderer in this
   *  build … kept literal" — o build geo não tem RaTeX) */
  diagnostics: string[];
  registration: GeoRegistration;
  ms: number;
}

export interface GeoErr {
  type: "error";
  id: number;
  error: GeoFailure;
}

export type GeoResponse = GeoOk | GeoErr;

export interface GeoApi {
  ensure(): Promise<void>;
  compileGeo(source: string, opts: GeoOptions): GeoResult;
}

/** Serializa o que `ready`/`compileGeoJSON` lançam. */
export function toGeoFailure(e: unknown): GeoFailure {
  const message = e instanceof Error ? e.message : String(e);
  const pic = (e as { errorInfo?: Diagnostic } | null)?.errorInfo;
  if (pic) return { kind: "pic", message, info: { ...pic } };
  const geo = (e as { info?: { kind?: unknown; message?: unknown; hint?: unknown } } | null)?.info;
  if (geo && typeof geo.kind === "string") {
    return {
      kind: "geo",
      message,
      info: {
        kind: geo.kind,
        message: String(geo.message ?? message),
        ...(typeof geo.hint === "string" ? { hint: geo.hint } : {}),
      },
    };
  }
  return { kind: "other", message };
}

export async function handleGeoRequest(req: GeoRequest, api: GeoApi): Promise<GeoResponse> {
  try {
    await api.ensure();
    const t0 = performance.now();
    const { frame, circuits, texlabels } = req.opts;
    const out = api.compileGeo(req.source, {
      layers: true,
      ...(frame ? { frame } : {}),
      ...(circuits ? { circuits } : {}),
      ...(texlabels ? { texlabels } : {}),
    });
    return {
      type: "ok",
      id: req.id,
      geojson: out.geojson,
      layers: out.layers ?? [],
      warnings: out.warnings ?? [],
      diagnostics: out.diagnostics ?? [],
      registration: out.registration,
      ms: performance.now() - t0,
    };
  } catch (e) {
    return { type: "error", id: req.id, error: toGeoFailure(e) };
  }
}
