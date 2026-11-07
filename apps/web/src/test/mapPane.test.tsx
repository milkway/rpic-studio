// Painel Mapa em jsdom: worker FALSO que roda o MESMO handler do worker real
// com o build geo real (bytes); o MapLibre é um falso que registra as chamadas
// (jsdom não tem WebGL).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { compileGeo, ensureGeo } from "@/lib/geo";
import { handleGeoRequest, type GeoRequest, type GeoResponse } from "@/lib/geoProtocol";
import type { GeoWorkerLike } from "@/lib/geoClient";
import type { GeoMapHandle } from "@/lib/geomap";
import { MapPane, type MapModuleLoader } from "@/components/map/MapPane";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { examples } from "@/lib/examples";

// PreviewTabs cria o worker/mapa REAIS por padrão — aqui, os falsos.
vi.mock("@/lib/geoClient", async (orig) => {
  const mod = await orig<typeof import("@/lib/geoClient")>();
  return { ...mod, defaultGeoWorkerFactory: () => new InlineWorker() };
});
vi.mock("@/lib/geomap", () => ({ createGeoMap: () => fakeMap().handle }));

const require = createRequire(import.meta.url);
beforeAll(async () => {
  await ensureGeo(readFileSync(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_geo_bg.wasm")));
});

class InlineWorker implements GeoWorkerLike {
  onmessage: ((e: MessageEvent<GeoResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted = 0;
  postMessage(msg: GeoRequest) {
    this.posted++;
    void handleGeoRequest(msg, { ensure: () => ensureGeo(), compileGeo }).then((res) =>
      this.onmessage?.({ data: structuredClone(res) } as MessageEvent<GeoResponse>),
    );
  }
  terminate() {}
}

function fakeMap() {
  const calls = { set: 0, fit: 0, resize: 0, destroyed: false };
  const handle: GeoMapHandle = {
    setGeoJSON: () => void calls.set++,
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

describe("PreviewTabs + Mapa", () => {
  // import tardio: o PreviewPane puxa módulos pesados do preview
  const renderTabs = async (source: string) => {
    const { PreviewTabs } = await import("@/components/preview/PreviewTabs");
    return render(
      wrap(
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
      ),
    );
  };

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
});
