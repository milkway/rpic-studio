// O mapa MapLibre do painel Mapa. Este módulo é importado DINAMICAMENTE (só
// quando a fonte é geo e a aba Mapa abre): o maplibre-gl (~1 MB) e o seu CSS
// nunca entram no bundle de quem não usa mapas. Source `pic`, as seis camadas e
// os tamanhos fiéis ao chão vêm do módulo do pacote
// `@strategicprojects/rpic/maplibre` (zero imports, sem wasm); as camadas em si
// são as que o engine emite (`compileGeoJSON(src, { layers: true })`).
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
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

export function createGeoMap(container: HTMLElement): GeoMapHandle {
  const pic = createPicMap<MapLibreMap>({ Map: MapLibreMap, NavigationControl }, container, {
    // painel fixo, não página que rola: a roda dá zoom direto (sem o aviso
    // "Ctrl + scroll" dos gestos cooperativos)
    cooperativeGestures: false,
  });
  return {
    setGeoJSON: (fc, layers) => pic.setGeoJSON(fc, layers),
    fitTo: (fc) => pic.fitTo(fc),
    resize: () => pic.map.resize(),
    destroy: () => pic.destroy(),
  };
}
