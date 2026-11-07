// O mapa MapLibre do painel Mapa. Este módulo é importado DINAMICAMENTE (só
// quando a fonte é geo e a aba Mapa abre): o maplibre-gl (~1 MB) e o seu CSS
// nunca entram no bundle de quem não usa mapas. Source `pic`, as seis camadas e
// os tamanhos fiéis ao chão vêm do módulo do pacote
// `@strategicprojects/rpic/maplibre` (zero imports, sem wasm); as camadas em si
// são as que o engine emite (`compileGeoJSON(src, { layers: { textScale } })`).
// O que fica aqui é a cola do app: a URL do worker, o CSS, os popups e o
// cursor. As FORMAS do desenho ficam sob os rótulos do basemap (`before:
// 'labels'`, DECISIONS G11 do rpic) — nomes de lugar legíveis sobre um
// preenchimento —; os rótulos do PRÓPRIO desenho (`pic-text`/`pic-title`)
// ficam por cima de tudo. Mesma cola do rpic.dev (site/src/lib/geomap.ts).
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import type { MapLayerMouseEvent } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { createGeoMap as createPicMap } from "@strategicprojects/rpic/maplibre";
import type { GeoPicCollection, MapLibreLayer } from "@strategicprojects/rpic/maplibre";

// o bundler não embute o worker do MapLibre: servimos o arquivo e apontamos
setWorkerUrl(workerUrl);

/** O que o painel usa do mapa (os testes injetam um falso). */
export interface GeoMapHandle {
  setGeoJSON(fc: GeoPicCollection, layers?: MapLibreLayer[]): void;
  fitTo(fc?: GeoPicCollection): void;
  /** recalcula o tamanho do canvas (o container mudou / voltou a ser visível) */
  resize(): void;
  destroy(): void;
}

/** Camadas cujas formas respondem ao clique com um popup (as de texto, não). */
export const CLICKABLE_LAYERS = ["pic-fill", "pic-stroke", "pic-stroke-dashed", "pic-dot"] as const;

/** Feição que o clique/hover pode pegar: o `pic-fill` só conta com o polígono
 *  VISIVELMENTE preenchido — a camada pinta `fill-opacity 0` sem `fill` (caixa
 *  sem preenchimento), e o miolo invisível de uma moldura não pode abrir popup
 *  nem mostrar o ponteiro. Mesmo critério da camada: `['has', 'fill']`. */
export function isInteractive(f: { layer?: { id?: string }; properties?: Record<string, unknown> | null }): boolean {
  return f.layer?.id !== "pic-fill" || (f.properties != null && "fill" in f.properties);
}

/** A feição mais ao topo que responde à interação, se houver. */
export function pickFeature<F extends Parameters<typeof isInteractive>[0]>(features?: F[]): F | undefined {
  return features?.find(isInteractive);
}

/** As propriedades vêm de fonte digitada pelo usuário: escapar antes do `setHTML`. */
export const escapeHtml = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** HTML do popup: `title` (se houver) + `geopic:kind · geopic:id`. */
export function popupHtml(p: Record<string, unknown>): string {
  const title = p["title"] ? `<b>${escapeHtml(p["title"])}</b><br>` : "";
  return `${title}<code>${escapeHtml(p["geopic:kind"])}</code> · <code>${escapeHtml(p["geopic:id"])}</code>`;
}

export function createGeoMap(container: HTMLElement): GeoMapHandle {
  const pic = createPicMap<MapLibreMap>({ Map: MapLibreMap, NavigationControl }, container, {
    // painel fixo, não página que rola: a roda dá zoom direto (sem o aviso
    // "Ctrl + scroll" dos gestos cooperativos)
    cooperativeGestures: false,
    // geometria sob os rótulos do basemap; os rótulos do desenho por cima
    before: "labels",
  });
  const map = pic.map;

  // registrado DEPOIS do `load` do próprio pacote: as camadas já existem
  map.once("load", () => {
    map.on("click", [...CLICKABLE_LAYERS], (ev: MapLayerMouseEvent) => {
      const f = pickFeature(ev.features);
      if (!f) return;
      new Popup({ closeButton: false })
        .setLngLat(ev.lngLat)
        .setHTML(popupHtml(f.properties as Record<string, unknown>))
        .addTo(map);
    });
    // UM par de ouvintes no ARRAY (como o `click`): com um por camada, passar
    // do traço ao preenchimento disparava o `mouseleave` do traço DEPOIS do
    // `mouseenter` do preenchimento e apagava o ponteiro — e eram 8 consultas
    // por movimento do mouse. `mousemove` (não `mouseenter`, que o MapLibre
    // também resolve com uma consulta por movimento): só ele reavalia ao passar
    // do miolo INVISÍVEL de uma caixa sem preenchimento para o seu traço.
    map.on("mousemove", [...CLICKABLE_LAYERS], (ev: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = pickFeature(ev.features) ? "pointer" : "";
    });
    map.on("mouseleave", [...CLICKABLE_LAYERS], () => (map.getCanvas().style.cursor = ""));
  });

  return {
    setGeoJSON: (fc, layers) => pic.setGeoJSON(fc, layers),
    fitTo: (fc) => pic.fitTo(fc),
    resize: () => map.resize(),
    destroy: () => pic.destroy(),
  };
}
