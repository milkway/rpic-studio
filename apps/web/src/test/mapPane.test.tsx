// Painel Mapa em jsdom: worker FALSO que roda o MESMO handler do worker real
// com o build geo real (bytes); o MapLibre é um falso que registra as chamadas
// (jsdom não tem WebGL).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { compileGeo, ensureGeo } from "@/lib/geo";
import { handleGeoRequest, type GeoRequest, type GeoResponse } from "@/lib/geoProtocol";
import type { GeoWorkerLike } from "@/lib/geoClient";
import type { GeoMapHandle } from "@/lib/geomap";
import type { MapLibreLayer } from "@strategicprojects/rpic";
import { MapPane, type MapModuleLoader } from "@/components/map/MapPane";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { examples } from "@/lib/examples";

// PreviewTabs cria o worker/mapa REAIS por padrão — aqui, os falsos.
vi.mock("@/lib/geoClient", async (orig) => {
  const mod = await orig<typeof import("@/lib/geoClient")>();
  return { ...mod, defaultGeoWorkerFactory: () => new InlineWorker() };
});
vi.mock("@/lib/geomap", () => ({ createGeoMap: () => fakeMap().handle }));

// a 1ª compilação a frio (transform + wasm) pode passar do 1 s padrão
configure({ asyncUtilTimeout: 3000 });

const require = createRequire(import.meta.url);
beforeAll(async () => {
  await ensureGeo(readFileSync(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_geo_bg.wasm")));
});

class InlineWorker implements GeoWorkerLike {
  onmessage: ((e: MessageEvent<GeoResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted = 0;
  last: GeoRequest | null = null;
  postMessage(msg: GeoRequest) {
    this.posted++;
    this.last = msg;
    void handleGeoRequest(msg, { ensure: () => ensureGeo(), compileGeo }).then((res) =>
      this.onmessage?.({ data: structuredClone(res) } as MessageEvent<GeoResponse>),
    );
  }
  terminate() {}
}

function fakeMap() {
  const calls = { set: 0, fit: 0, resize: 0, destroyed: false, layers: [] as unknown[] };
  const handle: GeoMapHandle = {
    setGeoJSON: (_fc, layers) => {
      calls.set++;
      calls.layers = layers ?? [];
    },
    fitTo: () => void calls.fit++,
    resize: () => void calls.resize++,
    destroy: () => void (calls.destroyed = true),
  };
  return { calls, handle };
}

const wrap = (ui: ReactNode) => <TooltipProvider>{ui}</TooltipProvider>;
const CALLOUT = examples.find((e) => e.id === "geo-callout")!.source;

function setup(source: string, extra: { fitKey?: number; active?: boolean } = {}) {
  const map = fakeMap();
  const loader: MapModuleLoader = async () => ({ createGeoMap: () => map.handle });
  const worker = new InlineWorker();
  const props = {
    circuits: false,
    texlabels: false,
    active: extra.active ?? true,
    workerFactory: () => worker,
    mapLoader: loader,
  };
  const jumps: number[] = [];
  const view = render(
    wrap(<MapPane source={source} {...props} fitKey={extra.fitKey} onJumpToLine={(l) => jumps.push(l)} />),
  );
  const rerender = (src: string, fitKey?: number, active = props.active) =>
    view.rerender(
      wrap(<MapPane source={src} {...props} active={active} fitKey={fitKey} onJumpToLine={(l) => jumps.push(l)} />),
    );
  return { map, worker, rerender, jumps };
}

describe("MapPane", () => {
  it("desenha a fonte geo, mostra o status do registro e enquadra uma vez", async () => {
    const { map } = setup(CALLOUT);
    expect(screen.getByTestId("map-frame")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "ok"));
    const status = screen.getByTestId("map-status").textContent ?? "";
    expect(status).toContain("anchor (enu)");
    expect(status).toContain("400 m/in");
    expect(status).toContain("bearing 0°");
    await waitFor(() => expect(map.calls.set).toBe(1));
    expect(map.calls.fit).toBe(1);
    expect(screen.getByTestId("map-download")).toBeEnabled();
  });

  it("editar re-georreferencia SEM reenquadrar; frame e troca de documento reenquadram", async () => {
    const { map, rerender } = setup(CALLOUT, { fitKey: 0 });
    await waitFor(() => expect(map.calls.set).toBe(1));
    rerender(CALLOUT.replace("geo_scale = 400", "geo_scale = 800"), 0);
    await waitFor(() => expect(screen.getByTestId("map-status").textContent).toContain("800 m/in"));
    expect(map.calls.set).toBe(2);
    expect(map.calls.fit).toBe(1);

    fireEvent.change(screen.getByTestId("map-frame"), { target: { value: "mercator" } });
    await waitFor(() => expect(screen.getByTestId("map-status").textContent).toContain("(mercator)"));
    expect(map.calls.fit).toBe(2);

    rerender(examples.find((e) => e.id === "geo-radius")!.source, 1);
    await waitFor(() => expect(screen.getByTestId("map-status").textContent).toContain("1000 m/in"));
    expect(map.calls.fit).toBe(3);
  });

  it("erro de pic aparece como no editor (linha clicável); o último desenho fica", async () => {
    const { rerender, jumps } = setup(CALLOUT);
    await waitFor(() => expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "ok"));
    rerender(CALLOUT + "\nbxo\n");
    await waitFor(() => expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "error"));
    fireEvent.click(screen.getByTestId("compile-error-jump"));
    expect(jumps).toEqual([CALLOUT.split("\n").length + 1]);
    expect(screen.getByTestId("map-download")).toBeEnabled();
  });

  it("mostra os diagnostics do engine (texlabels sem math no build geo)", async () => {
    const map = fakeMap();
    render(
      wrap(
        <MapPane
          source={'geo_lon = -34.87\ngeo_lat = -8.06\nbox "$x^2$"\n'}
          circuits={false}
          texlabels
          active
          workerFactory={() => new InlineWorker()}
          mapLoader={async () => ({ createGeoMap: () => map.handle })}
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("diagnostics-panel").textContent).toMatch(
        /texlabels: no math renderer in this build/,
      ),
    );
  });

  it("aba oculta não compila (nem cria o worker/mapa)", async () => {
    const { worker, map } = setup(CALLOUT, { active: false });
    await new Promise((r) => setTimeout(r, 300));
    expect(worker.posted).toBe(0);
    expect(map.calls.set).toBe(0);
  });
});

describe("MapPane — tamanho dos rótulos", () => {
  afterEach(() => window.localStorage.clear());

  const textSize = (layers: unknown[]) =>
    JSON.stringify((layers as MapLibreLayer[]).find((l) => l.id === "pic-text")?.layout?.["text-size"]);

  it("trocar o tamanho redesenha com as camadas novas SEM pedido ao worker e SEM reenquadrar", async () => {
    const { map, worker } = setup(CALLOUT);
    await waitFor(() => expect(map.calls.set).toBe(1));
    expect(map.calls.fit).toBe(1);
    expect(worker.posted).toBe(1);
    expect(worker.last?.opts).not.toHaveProperty("textScale");
    const at1 = textSize(map.calls.layers);
    const select = screen.getByTestId("map-text-scale");
    expect(select).toHaveValue("1");
    expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "1×",
      "1.25×",
      "1.5×",
      "2×",
    ]);

    fireEvent.change(select, { target: { value: "1.5" } });
    expect(map.calls.set).toBe(2); // síncrono: nada de worker no meio
    expect(textSize(map.calls.layers)).not.toBe(at1);
    expect(map.calls.fit).toBe(1);
    expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "ok");
    expect(JSON.parse(window.localStorage.getItem("rpic:settings.v1")!).mapTextScale).toBe(1.5);
    await new Promise((r) => setTimeout(r, 300));
    expect(worker.posted).toBe(1);

    fireEvent.change(select, { target: { value: "1" } }); // de volta: as camadas do engine
    expect(textSize(map.calls.layers)).toBe(at1);
  });

  it("abre com o fator salvo; valor salvo inválido cai em 1×", async () => {
    window.localStorage.setItem("rpic:settings.v1", JSON.stringify({ mapTextScale: 2 }));
    const a = setup(CALLOUT);
    expect(screen.getByTestId("map-text-scale")).toHaveValue("2");
    await waitFor(() => expect(a.map.calls.set).toBe(1));
    const scaled = compileGeo(CALLOUT, { layers: { textScale: 2 } }).layers!;
    expect(textSize(a.map.calls.layers)).toBe(textSize(scaled));
    window.localStorage.setItem("rpic:settings.v1", JSON.stringify({ mapTextScale: 99 }));
    const { loadMapTextScale } = await import("@/lib/storage");
    expect(loadMapTextScale()).toBe(1);
  });
});

describe("MapPane — quando reenquadrar", () => {
  it("mesma fonte recarregada enquadra JÁ; a próxima tecla não enquadra", async () => {
    const { map, rerender } = setup(CALLOUT, { fitKey: 0 });
    await waitFor(() => expect(map.calls.fit).toBe(1));
    rerender(CALLOUT, 1); // exemplo/link com a MESMA fonte: nenhum resultado novo
    expect(map.calls.fit).toBe(2);
    rerender(CALLOUT.replace("geo_scale = 400", "geo_scale = 500"), 1);
    await waitFor(() => expect(screen.getByTestId("map-status").textContent).toContain("500 m/in"));
    expect(map.calls.fit).toBe(2);
  });

  it("troca de frame que falha desarma: consertar a fonte depois não enquadra", async () => {
    const { map, rerender } = setup(CALLOUT, { fitKey: 0 });
    await waitFor(() => expect(map.calls.fit).toBe(1));
    rerender(CALLOUT + "\nbxo\n", 0);
    await waitFor(() => expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "error"));
    fireEvent.change(screen.getByTestId("map-frame"), { target: { value: "mercator" } });
    await new Promise((r) => setTimeout(r, 300)); // o pedido mercator responde (erro)
    rerender(CALLOUT, 0); // edição comum
    await waitFor(() => expect(screen.getByTestId("map-status").textContent).toContain("(mercator)"));
    expect(map.calls.fit).toBe(1);
  });

  it("mapa recriado (efeito re-executado) recebe o desenho e enquadra", async () => {
    const first = fakeMap();
    const second = fakeMap();
    const worker = new InlineWorker();
    const props = { source: CALLOUT, circuits: false, texlabels: false, active: true, workerFactory: () => worker };
    const view = render(wrap(<MapPane {...props} mapLoader={async () => ({ createGeoMap: () => first.handle })} />));
    await waitFor(() => expect(first.calls.set).toBe(1));
    view.rerender(wrap(<MapPane {...props} mapLoader={async () => ({ createGeoMap: () => second.handle })} />));
    await waitFor(() => expect(second.calls.set).toBe(1));
    expect(first.calls.destroyed).toBe(true);
    expect(second.calls.fit).toBe(1);
    expect(worker.posted).toBe(1); // o desenho é reaproveitado, sem recompilar
  });
});

describe("MapPane — sem recompilar à toa", () => {
  it("esconder e mostrar a aba não re-posta o mesmo pedido", async () => {
    const { worker, rerender } = setup(CALLOUT);
    await waitFor(() => expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "ok"));
    expect(worker.posted).toBe(1);
    rerender(CALLOUT, undefined, false);
    rerender(CALLOUT, undefined, true);
    await new Promise((r) => setTimeout(r, 300));
    expect(worker.posted).toBe(1);
  });
});

describe("PreviewTabs + Mapa", () => {
  // import tardio: o PreviewPane puxa módulos pesados do preview
  const tabsEl = async (source: string) => {
    const { PreviewTabs } = await import("@/components/preview/PreviewTabs");
    return wrap(
        <PreviewTabs
          svg=""
          source={source}
          circuits={false}
          animations={[]}
          version={0}
          error={null}
          loading={false}
          compileMs={null}
          canvas={{ fontFamily: "sans-serif" } as never}
          onCanvasChange={() => {}}
        />,
    );
  };
  const renderTabs = async (source: string) => render(await tabsEl(source));

  it("fonte sem registro: nenhuma aba Mapa, nenhum painel", async () => {
    await renderTabs('.PS\nbox "a"\n.PE');
    expect(screen.queryByRole("tab", { name: /map/i })).toBeNull();
    expect(screen.queryByTestId("map-pane")).toBeNull();
  });

  it("fonte geo: a aba Mapa existe e abre sozinha, com o seletor de frame", async () => {
    await renderTabs(CALLOUT);
    expect(screen.getByRole("tab", { name: /map/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("map-pane")).toBeInTheDocument();
    expect(screen.getByTestId("map-frame")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "ok"));
  });

  it("detectGeo piscando false (redigitando geo_lon) não desmonta o painel", async () => {
    const view = await renderTabs(CALLOUT);
    await waitFor(() => expect(screen.getByTestId("map-status")).toHaveAttribute("data-state", "ok"));
    const pane = screen.getByTestId("map-pane");
    const broken = CALLOUT.replace("geo_lon = -34.8711", "geo_").replace("geo_lat = -8.0631", "");
    view.rerender(await tabsEl(broken));
    expect(screen.queryByRole("tab", { name: /map/i })).toBeNull();
    expect(screen.getByTestId("map-pane")).toBe(pane); // mesmo nó: oculto, não desmontado
    expect(pane.parentElement).toHaveClass("hidden");
    view.rerender(await tabsEl(CALLOUT));
    expect(screen.getByRole("tab", { name: /map/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("map-pane")).toBe(pane);
  });
});
