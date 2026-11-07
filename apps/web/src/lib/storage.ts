// Persistência local do rascunho e das preferências (funciona sem login).
// Chaves versionadas para permitir migração de formato no futuro.

export interface Draft {
  source: string;
  circuits: boolean;
  savedAt: string;
}

export interface Settings {
  layout: "horizontal" | "vertical";
  /** painel Mapa: fator dos rótulos (`textScale`), um de `MAP_TEXT_SCALES` */
  mapTextScale?: number;
  /** painel Simular: modo "passos finos" (`trtol = 1` + TMAX ÷ 10) */
  simFineSteps?: boolean;
}

/** Presets do controle "rótulos" do painel Mapa. */
export const MAP_TEXT_SCALES = [1, 1.25, 1.5, 2] as const;

/** O fator salvo, se for um preset válido; senão 1. */
export function loadMapTextScale(): number {
  const v = loadSettings().mapTextScale;
  return (MAP_TEXT_SCALES as readonly number[]).includes(v as number) ? (v as number) : 1;
}

/** O modo "passos finos" do painel Simular salvo (só `true` liga). */
export function loadSimFineSteps(): boolean {
  return loadSettings().simFineSteps === true;
}

/** Aparência do papel e da fonte do diagrama (não altera a geometria). */
export interface CanvasSettings {
  pattern: "dots" | "lines" | "plain";
  bg: string;
  gridColor: string;
  gridSize: number;
  /** Stack de font-family assado no SVG (""=padrão sans-serif do rpic). */
  fontFamily: string;
}

export const DEFAULT_CANVAS: CanvasSettings = {
  pattern: "dots",
  bg: "#ffffff",
  gridColor: "#cbd5e1",
  gridSize: 22,
  fontFamily: "",
};

const DRAFT_KEY = "rpic:draft.v1";
const SETTINGS_KEY = "rpic:settings.v1";
const CANVAS_KEY = "rpic:canvas.v1";

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage cheio ou bloqueado — o app segue funcionando sem autosave
  }
}

export function loadDraft(): Draft | null {
  const draft = read<Draft>(DRAFT_KEY);
  return draft && typeof draft.source === "string" ? draft : null;
}

export function saveDraft(source: string, circuits: boolean): void {
  write(DRAFT_KEY, { source, circuits, savedAt: new Date().toISOString() } satisfies Draft);
}

export function loadSettings(): Settings {
  return { layout: "horizontal", ...read<Partial<Settings>>(SETTINGS_KEY) };
}

/** Grava mesclando (não zera as outras chaves ao salvar uma só). */
export function saveSettings(patch: Partial<Settings>): void {
  write(SETTINGS_KEY, { ...loadSettings(), ...patch });
}

export function loadCanvasSettings(): CanvasSettings {
  return { ...DEFAULT_CANVAS, ...read<Partial<CanvasSettings>>(CANVAS_KEY) };
}

export function saveCanvasSettings(settings: CanvasSettings): void {
  write(CANVAS_KEY, settings);
}
