// Persistência local do rascunho e das preferências (funciona sem login).
// Chaves versionadas para permitir migração de formato no futuro.

export interface Draft {
  source: string;
  circuits: boolean;
  savedAt: string;
}

export interface Settings {
  layout: "horizontal" | "vertical";
  /** Editor de código ou construtor visual (grafo → pic). */
  mode: "code" | "visual";
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
  return { layout: "horizontal", mode: "code", ...read<Partial<Settings>>(SETTINGS_KEY) };
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
