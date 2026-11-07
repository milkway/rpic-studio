import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@rpic/design-system";
import type { Diagnostic, GeoWarning } from "@strategicprojects/rpic";
// port PURO das camadas (zero imports, sem wasm, ~15 KB): o tamanho dos rótulos
// é só estilo — recalcular aqui evita recompilar no worker
import { layers as picLayers } from "@strategicprojects/rpic/maplibre";
import { downloadBlob } from "@/lib/exports";
import { PREFS_EVENT, pushPrefsSoon } from "@/lib/prefs";
import { loadMapTextScale, MAP_TEXT_SCALES, saveSettings } from "@/lib/storage";
import { explainDiagnostic, explainRawError, type ErrorInfo } from "@/lib/errorInfo";
import type { GeoFailure, GeoFrame } from "@/lib/geoProtocol";
import type { GeoWorkerFactory } from "@/lib/geoClient";
import type { GeoMapHandle } from "@/lib/geomap";
import { geoKey, useGeo } from "@/lib/useGeo";
import { useI18n, type Locale, type MessageKey } from "@/lib/i18n";
import { DiagnosticsPanel } from "@/components/preview/DiagnosticsPanel";
import { Button } from "@/components/ui/Button";
import { Tip } from "@/components/ui/Tooltip";

/** Carrega o módulo do mapa (maplibre-gl). Dinâmico: quem não abre um mapa
 *  nunca baixa o MapLibre. Os testes injetam um falso. */
export type MapModuleLoader = () => Promise<{ createGeoMap(container: HTMLElement): GeoMapHandle }>;

const defaultMapLoader: MapModuleLoader = () => import("@/lib/geomap");

interface MapPaneProps {
  source: string;
  circuits: boolean;
  texlabels: boolean;
  /** Aba visível? Só então compila; ao voltar a ficar visível, `resize()`. */
  active: boolean;
  tabs?: ReactNode;
  /** Muda quando o documento é TROCADO (exemplo, link, diagrama salvo) — reenquadra. */
  fitKey?: number;
  onJumpToLine?: (line: number, col?: number) => void;
  /** Testes: worker e mapa falsos. */
  workerFactory?: GeoWorkerFactory;
  mapLoader?: MapModuleLoader;
}

const fmt = (n: number, digits: number) => Number(n.toFixed(digits)).toString();

/** Erro do worker → o mesmo `ErrorInfo` que a barra de diagnósticos do editor usa. */
export function explainGeoFailure(f: GeoFailure, source: string, locale: Locale): ErrorInfo {
  switch (f.kind) {
    case "pic":
      return explainDiagnostic(f.info, source, locale, "error");
    case "geo": {
      const { kind, message, hint } = f.info;
      return {
        severity: "error",
        line: null,
        col: null,
        tokenLength: null,
        friendly: `${kind}: ${message}${hint ? ` — ${hint}` : ""}`,
        suggestion: null,
        raw: f.message,
      };
    }
    default:
      return explainRawError(f.message, locale);
  }
}

/** Warning geo (`kind: message`), com posição quando é da fonte do usuário. */
export function explainGeoWarning(w: GeoWarning | Diagnostic): ErrorInfo {
  const span = "span" in w ? w.span : undefined;
  const diag = !("id" in w) && "line" in w ? (w as Diagnostic) : null;
  const pos =
    span && !span.file
      ? { line: span.line, col: span.col, end: span.end_col }
      : diag && diag.file == null && diag.line != null
        ? { line: diag.line, col: diag.col, end: diag.end_col }
        : null;
  return {
    severity: "warning",
    line: pos?.line ?? null,
    col: pos?.col ?? null,
    tokenLength: pos && pos.col != null && pos.end != null ? Math.max(pos.end - pos.col, 1) : null,
    friendly: `${w.kind ?? "warning"}: ${w.message}`,
    suggestion: null,
    raw: w.message,
  };
}

/** Aba "Mapa": o desenho georreferenciado (geopic) num MapLibre, ao vivo. Só
 *  existe para fontes com registro (`detectGeo`); o build geo do wasm roda num
 *  worker e o MapLibre é importado sob demanda. */
export function MapPane({
  source,
  circuits,
  texlabels,
  active,
  tabs,
  fitKey = 0,
  onJumpToLine,
  workerFactory,
  mapLoader = defaultMapLoader,
}: MapPaneProps) {
  const { t, locale } = useI18n();
  const [frame, setFrame] = useState<GeoFrame | "">("");
  // tamanho dos rótulos: persistido com as outras preferências (rpic:settings.v1).
  // É SÓ ESTILO: fica fora do pedido ao worker e da chave de compilação/enquadramento
  // — trocar recalcula as camadas aqui (port puro do pacote) e redesenha, sem
  // recompilar, sem "carregando" e sem reenquadrar.
  const [textScale, setTextScale] = useState(loadMapTextScale);
  const changeTextScale = (next: number) => {
    setTextScale(next);
    saveSettings({ mapTextScale: next });
    pushPrefsSoon();
  };
  // prefs da conta aplicadas DEPOIS da montagem (login): relê, como os outros providers
  useEffect(() => {
    const onPrefs = () => setTextScale(loadMapTextScale());
    window.addEventListener(PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(PREFS_EVENT, onPrefs);
  }, []);
  const geo = useGeo(source, { frame, circuits, texlabels, enabled: active, workerFactory });

  const containerRef = useRef<HTMLDivElement>(null);
  // A instância do mapa é ESTADO (não ref): o efeito de dados roda de novo
  // para um mapa recriado, e a limpeza zera tudo — nunca "ready" sem mapa.
  const [map, setMap] = useState<GeoMapHandle | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [wanted, setWanted] = useState(active);
  if (active && !wanted) setWanted(true);

  // Cria o mapa na 1ª vez que a aba fica visível; destrói ao desmontar.
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let made: GeoMapHandle | null = null;
    mapLoader()
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        made = mod.createGeoMap(containerRef.current);
        setMap(made);
      })
      .catch((e) => {
        if (cancelled) return;
        setMapError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      made?.destroy();
      setMap(null);
      setMapError(null);
    };
  }, [wanted, mapLoader]);

  // Reenquadra no 1º desenho de cada mapa, ao trocar de documento e ao trocar
  // de frame — NUNCA por edição comum (o usuário pode ter dado zoom/pan). A
  // troca "arma" o pedido (fonte+frame+opções) que ela exige: se já há
  // resultado dele (mesma fonte recarregada), enquadra já; senão, enquadra
  // quando ESSE pedido responder; se ele falhar, desarma.
  const currentKey = geoKey(source, frame, circuits, texlabels);
  const armRef = useRef<string | null>(null);
  const fittedMapRef = useRef<GeoMapHandle | null>(null);
  const prevTrigger = useRef({ fitKey, frame });
  useEffect(() => {
    const prev = prevTrigger.current;
    if (prev.fitKey === fitKey && prev.frame === frame) return;
    prevTrigger.current = { fitKey, frame };
    if (map && geo.result && geo.resultKey === currentKey) {
      map.fitTo(geo.result.geojson);
      armRef.current = null;
    } else {
      armRef.current = currentKey;
    }
    // só a troca de documento/frame dispara; o resto é lido no momento
  }, [fitKey, frame]);

  useEffect(() => {
    if (!map || !geo.result) return;
    // 1× = as camadas do próprio engine; outro fator = o port do pacote (o
    // mesmo resultado que `compileGeoJSON(src, { layers: { textScale } })`)
    const specs =
      textScale === 1 ? geo.result.layers : picLayers(geo.result.geojson, { textScale });
    map.setGeoJSON(geo.result.geojson, specs);
    if (fittedMapRef.current !== map || armRef.current === geo.resultKey) {
      map.fitTo(geo.result.geojson);
      fittedMapRef.current = map;
      armRef.current = null;
    }
  }, [geo.result, geo.resultKey, map, textScale]);

  useEffect(() => {
    if (geo.failureKey !== null && armRef.current === geo.failureKey) armRef.current = null;
  }, [geo.failure, geo.failureKey]);

  // Voltou a ficar visível (estava `display: none`): o canvas precisa medir de novo.
  useEffect(() => {
    if (active) map?.resize();
  }, [active, map]);

  const errorInfo = useMemo(
    () => (geo.failure ? explainGeoFailure(geo.failure, source, locale) : null),
    [geo.failure, source, locale],
  );
  const warningInfos = useMemo(
    () => (geo.result && !geo.failure ? geo.result.warnings.map(explainGeoWarning) : []),
    [geo.result, geo.failure],
  );

  const download = () => {
    if (!geo.result) return;
    downloadBlob(
      new Blob([JSON.stringify(geo.result.geojson, null, 2)], { type: "application/geo+json" }),
      "drawing.geojson",
    );
  };

  const r = geo.result?.registration;
  const failed = geo.failure !== null;
  const status = r
    ? [
        `${t(`map.method.${r.method}` as MessageKey)} (${r.frame})`,
        `${fmt(r.scale_m_per_in, 3)} m/in`,
        `bearing ${fmt(r.bearing_deg, 3)}°`,
        ...(r.rms_m !== undefined ? [`rms ${r.rms_m.toPrecision(2)} m`] : []),
        t("map.features", { n: String(geo.result!.geojson.features.length) }),
      ].join(" · ")
    : "";
  const mapFailed = mapError !== null;
  const busy = (!map && !mapFailed) || (geo.loading && !failed);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="map-pane">
      <div className="flex h-10 min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-(--color-border) bg-(--color-surface) px-3 max-sm:px-1.5">
        {tabs}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 font-mono text-[11px] text-(--color-text-muted)">
            <span className="max-sm:hidden">{t("map.frame")}</span>
            <select
              value={frame}
              onChange={(e) => setFrame(e.target.value as GeoFrame | "")}
              data-testid="map-frame"
              aria-label={t("map.frame")}
              className="h-7 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-1 text-xs text-(--color-text)"
            >
              <option value="">{t("map.frameSource")}</option>
              <option value="enu">enu</option>
              <option value="mercator">mercator</option>
            </select>
          </label>
          <Tip label={t("map.labelsTip")}>
            <label className="flex items-center gap-1.5 font-mono text-[11px] text-(--color-text-muted)">
              <span className="max-sm:hidden">{t("map.labels")}</span>
              <select
                value={String(textScale)}
                onChange={(e) => changeTextScale(Number(e.target.value))}
                data-testid="map-text-scale"
                aria-label={t("map.labelsTip")}
                className="h-7 rounded-(--radius-sm) border border-(--color-border) bg-(--color-surface-muted) px-1 text-xs text-(--color-text)"
              >
                {MAP_TEXT_SCALES.map((s) => (
                  <option key={s} value={String(s)}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </Tip>
          <Tip label={t("map.downloadTip")}>
            <Button
              variant="outline"
              size="sm"
              onClick={download}
              disabled={!geo.result}
              data-testid="map-download"
              aria-label={t("map.downloadTip")}
            >
              <Download size={13} />
              <span className="max-sm:hidden">{t("map.download")}</span>
            </Button>
          </Tip>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-(--color-surface-muted)">
        <div
          ref={containerRef}
          data-testid="map-canvas"
          className={cn("h-full w-full transition-opacity", failed && geo.result && "opacity-40")}
        />
        {(busy || mapFailed) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[12px] text-(--color-text-muted)">
            {mapFailed ? (
              <span className="text-(--color-danger)" data-testid="map-load-error">
                {t("map.loadFailed", { msg: mapError ?? "" })}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />
                {t("map.loading")}
              </span>
            )}
          </div>
        )}
      </div>

      <DiagnosticsPanel
        error={errorInfo}
        warnings={warningInfos}
        prints={geo.result && !geo.failure ? geo.result.diagnostics : []}
        onJump={(line, col) => onJumpToLine?.(line, col)}
      />

      <div className="flex h-7 min-w-0 shrink-0 items-center gap-3 overflow-x-auto border-t border-(--color-border) bg-(--color-surface) px-3 font-mono text-[11px] whitespace-nowrap text-(--color-text-muted)">
        <span
          className="flex items-center gap-1.5"
          data-testid="map-status"
          data-state={failed ? "error" : geo.result ? "ok" : "loading"}
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background: failed
                ? "var(--color-danger)"
                : geo.result
                  ? "var(--color-success)"
                  : "var(--color-text-muted)",
            }}
          />
          {status}
          {failed && geo.result && <span>· {t("map.stale")}</span>}
        </span>
      </div>
    </div>
  );
}
