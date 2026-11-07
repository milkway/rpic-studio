// Build GEO do rpic com o WASM REAL em Node (arquivo próprio: o pacote guarda
// UM build por instância de módulo e o compile.test.ts inicializa o lean).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileGeo, ensureGeo } from "@/lib/geo";
import { handleGeoRequest, type GeoErr, type GeoOk, type GeoRequest } from "@/lib/geoProtocol";
import { explainGeoFailure } from "@/components/map/MapPane";
import { examples } from "@/lib/examples";

const require = createRequire(import.meta.url);
const api = { ensure: () => ensureGeo(), compileGeo };

beforeAll(async () => {
  await ensureGeo(readFileSync(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_geo_bg.wasm")));
});

const req = (source: string, opts: GeoRequest["opts"] = {}): GeoRequest => ({
  type: "geo",
  id: 1,
  source,
  opts,
});

describe("geopic (WASM geo real)", () => {
  it("os quatro exemplos de mapa georreferenciam, com camadas MapLibre", async () => {
    const maps = examples.filter((e) => e.tags.includes("maps"));
    expect(maps.map((e) => e.id)).toEqual(["geo-callout", "geo-arrow", "geo-radius", "geo-site-plan"]);
    const methods: Record<string, string> = {};
    for (const ex of maps) {
      const res = await handleGeoRequest(req(ex.source), api);
      expect(res.type, ex.id).toBe("ok");
      const ok = res as GeoOk;
      expect(ok.geojson.type).toBe("FeatureCollection");
      expect(ok.geojson.features.length, ex.id).toBeGreaterThan(0);
      expect(ok.layers.length, ex.id).toBeGreaterThan(0);
      expect(ok.layers.every((l) => l.source === "pic")).toBe(true);
      methods[ex.id] = ok.registration.method;
    }
    expect(methods).toEqual({
      "geo-callout": "anchor",
      "geo-arrow": "two_points",
      "geo-radius": "anchor",
      "geo-site-plan": "two_points",
    });
  });

  it("o frame do seletor sobrepõe o da fonte", async () => {
    const src = examples.find((e) => e.id === "geo-callout")!.source;
    const enu = (await handleGeoRequest(req(src), api)) as GeoOk;
    const merc = (await handleGeoRequest(req(src, { frame: "mercator" }), api)) as GeoOk;
    expect(enu.registration.frame).toBe("enu");
    expect(merc.registration.frame).toBe("mercator");
  });

  it("geo_scale escala o desenho", async () => {
    const src = examples.find((e) => e.id === "geo-callout")!.source;
    const a = (await handleGeoRequest(req(src), api)) as GeoOk;
    const b = (await handleGeoRequest(req(src.replace("geo_scale = 400", "geo_scale = 800")), api)) as GeoOk;
    expect(a.registration.scale_m_per_in).toBe(400);
    expect(b.registration.scale_m_per_in).toBe(800);
  });

  it("erro de pic vem posicionado (linha:col), como o do compile", async () => {
    const res = (await handleGeoRequest(req("geo_lon = -34.87\ngeo_lat = -8\nbxo\n"), api)) as GeoErr;
    expect(res.type).toBe("error");
    expect(res.error.kind).toBe("pic");
    const info = explainGeoFailure(res.error, "geo_lon = -34.87\ngeo_lat = -8\nbxo\n", "en");
    expect(info.line).toBe(3);
    expect(info.friendly).toContain("bxo");
  });

  it("fonte sem registro → no_registration com hint, formatado kind: message — hint", async () => {
    const res = (await handleGeoRequest(req('box "a"'), api)) as GeoErr;
    expect(res.error.kind).toBe("geo");
    if (res.error.kind !== "geo") return;
    expect(res.error.info.kind).toBe("no_registration");
    expect(res.error.info.hint).toBeTruthy();
    const info = explainGeoFailure(res.error, 'box "a"', "en");
    expect(info.friendly).toBe(
      `no_registration: ${res.error.info.message} — ${res.error.info.hint}`,
    );
    expect(info.line).toBeNull();
  });
});
