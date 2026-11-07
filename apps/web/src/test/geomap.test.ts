// lib/geomap.ts com um maplibre-gl FALSO (jsdom não tem WebGL): ordem das
// camadas (`before: 'labels'`) e popups/cursor das formas clicáveis.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileGeo, ensureGeo } from "@/lib/geo";
import { examples } from "@/lib/examples";

type Listener = (ev?: unknown) => void;

const state = vi.hoisted(() => ({
  maps: [] as unknown[],
  popups: [] as { html: string; lngLat: unknown; opts: unknown; added: boolean }[],
}));

vi.mock("maplibre-gl", () => {
  class FakeMap {
    /** ids na ordem de desenho (o 1º fica embaixo) — começa com o basemap */
    order = ["background", "water", "road", "place-label", "road-label"];
    styleTypes: Record<string, string> = {
      background: "background",
      water: "fill",
      road: "line",
      "place-label": "symbol",
      "road-label": "symbol",
    };
    sources = new Map<string, { data: unknown; setData(d: unknown): void }>();
    layerProps = new Map<string, Record<string, unknown>>();
    onceFns = new Map<string, Listener[]>();
    delegated: { type: string; layers: string[]; fn: Listener }[] = [];
    canvas = { style: { cursor: "" } };
    loadedNow = false;
    constructor(public opts: unknown) {
      state.maps.push(this);
    }
    addControl() {}
    isStyleLoaded() {
      return this.loadedNow;
    }
    on(type: string, layers: string | string[], fn: Listener) {
      this.delegated.push({ type, layers: Array.isArray(layers) ? layers : [layers], fn });
    }
    off() {}
    once(type: string, fn: Listener) {
      this.onceFns.set(type, [...(this.onceFns.get(type) ?? []), fn]);
    }
    fire(type: string) {
      if (type === "load") this.loadedNow = true;
      const fns = this.onceFns.get(type) ?? [];
      this.onceFns.delete(type);
      for (const fn of fns) fn();
    }
    getStyle() {
      return { layers: this.order.map((id) => ({ id, type: this.styleTypes[id] ?? "unknown" })) };
    }
    getLayer(id: string) {
      return this.order.includes(id) ? { id } : undefined;
    }
    addLayer(spec: { id: string; type: string; layout?: Record<string, unknown> }, before?: string) {
      const i = before ? this.order.indexOf(before) : -1;
      if (i >= 0) this.order.splice(i, 0, spec.id);
      else this.order.push(spec.id);
      this.styleTypes[spec.id] = spec.type;
      this.layerProps.set(spec.id, { ...spec.layout });
    }
    removeLayer(id: string) {
      this.order = this.order.filter((l) => l !== id);
    }
    addSource(id: string, src: { data: unknown }) {
      const s = { data: src.data, setData: (d: unknown) => void (s.data = d) };
      this.sources.set(id, s);
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    removeSource(id: string) {
      this.sources.delete(id);
    }
    setFilter() {}
    setPaintProperty() {}
    setLayoutProperty(id: string, k: string, v: unknown) {
      this.layerProps.set(id, { ...this.layerProps.get(id), [k]: v });
    }
    fitBounds() {}
    getCanvas() {
      return this.canvas;
    }
    resize() {}
    remove() {}
  }
  class Popup {
    rec = { html: "", lngLat: null as unknown, opts: null as unknown, added: false };
    constructor(opts: unknown) {
      this.rec.opts = opts;
      state.popups.push(this.rec);
    }
    setLngLat(l: unknown) {
      this.rec.lngLat = l;
      return this;
    }
    setHTML(h: string) {
      this.rec.html = h;
      return this;
    }
    addTo() {
      this.rec.added = true;
      return this;
    }
  }
  return { Map: FakeMap, NavigationControl: class {}, Popup, setWorkerUrl: () => {} };
});

const require = createRequire(import.meta.url);
beforeAll(async () => {
  await ensureGeo(readFileSync(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_geo_bg.wasm")));
});
beforeEach(() => {
  state.maps.length = 0;
  state.popups.length = 0;
});

interface Fake {
  order: string[];
  delegated: { type: string; layers: string[]; fn: (ev?: unknown) => void }[];
  canvas: { style: { cursor: string } };
  layerProps: Map<string, Record<string, unknown>>;
  fire(type: string): void;
}

const CALLOUT = examples.find((e) => e.id === "geo-callout")!.source;

async function drawn() {
  const { createGeoMap } = await import("@/lib/geomap");
  const handle = createGeoMap(document.createElement("div"));
  const map = state.maps[0] as Fake;
  map.fire("load");
  const out = compileGeo(CALLOUT, { layers: true });
  handle.setGeoJSON(out.geojson, out.layers);
  return { handle, map };
}

describe("geomap (MapLibre falso)", () => {
  it("formas sob os rótulos do basemap; rótulos do desenho por cima de tudo", async () => {
    const { map } = await drawn();
    expect(map.order).toEqual([
      "background",
      "water",
      "road",
      "pic-fill",
      "pic-stroke",
      "pic-stroke-dashed",
      "pic-dot",
      "place-label",
      "road-label",
      "pic-text",
      "pic-title",
    ]);
  });

  it("clicar numa forma abre popup escapado com title e kind · id; cursor de ponteiro", async () => {
    const { map } = await drawn();
    const click = map.delegated.find((d) => d.type === "click")!;
    expect(click.layers).toEqual(["pic-fill", "pic-stroke", "pic-stroke-dashed", "pic-dot"]);
    click.fn({
      lngLat: { lng: -34.87, lat: -8.06 },
      features: [
        {
          layer: { id: "pic-fill" },
          properties: { fill: "#808080", title: '<img src=x onerror="1">', "geopic:kind": "box", "geopic:id": "s1" },
        },
      ],
    });
    expect(state.popups).toHaveLength(1);
    const p = state.popups[0]!;
    expect(p.added).toBe(true);
    expect(p.html).toBe(
      "<b>&#60;img src=x onerror=&#34;1&#34;&#62;</b><br><code>box</code> · <code>s1</code>",
    );
    // sem title: só kind · id
    click.fn({
      lngLat: { lng: 0, lat: 0 },
      features: [{ layer: { id: "pic-stroke" }, properties: { "geopic:kind": "line", "geopic:id": "s2" } }],
    });
    expect(state.popups[1]!.html).toBe("<code>line</code> · <code>s2</code>");

    const enter = map.delegated.filter((d) => d.type === "mousemove");
    const leave = map.delegated.filter((d) => d.type === "mouseleave");
    // um ouvinte só, no array de camadas (não um por camada)
    expect(enter).toHaveLength(1);
    expect(leave).toHaveLength(1);
    expect(enter[0]!.layers).toEqual(["pic-fill", "pic-stroke", "pic-stroke-dashed", "pic-dot"]);
    expect(leave[0]!.layers).toEqual(enter[0]!.layers);
    enter[0]!.fn({ features: [{ layer: { id: "pic-dot" }, properties: {} }] });
    expect(map.canvas.style.cursor).toBe("pointer");
    map.delegated.find((d) => d.type === "mouseleave")!.fn();
    expect(map.canvas.style.cursor).toBe("");
  });

  it("miolo de caixa SEM preenchimento não abre popup nem dá ponteiro; o traço por baixo responde", async () => {
    const { map } = await drawn();
    const click = map.delegated.find((d) => d.type === "click")!;
    const move = map.delegated.find((d) => d.type === "mousemove")!;
    const hollow = { layer: { id: "pic-fill" }, properties: { "geopic:kind": "box", "geopic:id": "s0" } };
    click.fn({ lngLat: { lng: 0, lat: 0 }, features: [hollow] });
    expect(state.popups).toHaveLength(0);
    move.fn({ features: [hollow] });
    expect(map.canvas.style.cursor).toBe("");
    // uma linha sob a moldura (a moldura vem antes na lista: está por cima)
    const line = { layer: { id: "pic-stroke" }, properties: { "geopic:kind": "line", "geopic:id": "s3" } };
    click.fn({ lngLat: { lng: 0, lat: 0 }, features: [hollow, line] });
    expect(state.popups[0]!.html).toBe("<code>line</code> · <code>s3</code>");
    move.fn({ features: [hollow, line] });
    expect(map.canvas.style.cursor).toBe("pointer");
    // com o mesmo critério da camada: ['has', 'fill'] no fill-opacity do pic-fill
    const fillLayer = compileGeo(CALLOUT, { layers: true }).layers!.find((l) => l.id === "pic-fill")!;
    expect(JSON.stringify(fillLayer.paint!["fill-opacity"])).toContain('["has","fill"]');
  });

  it("redesenhar com textScale atualiza o text-size das camadas existentes", async () => {
    const { handle, map } = await drawn();
    const before = JSON.stringify(map.layerProps.get("pic-text")!["text-size"]);
    const big = compileGeo(CALLOUT, { layers: { textScale: 2 } });
    handle.setGeoJSON(big.geojson, big.layers);
    expect(JSON.stringify(map.layerProps.get("pic-text")!["text-size"])).not.toBe(before);
    expect(map.order.filter((id) => id.startsWith("pic-"))).toHaveLength(6); // nada duplicado
  });
});
