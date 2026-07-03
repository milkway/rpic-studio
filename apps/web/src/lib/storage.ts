// Persistência local do rascunho e das preferências (funciona sem login).
// Chaves versionadas para permitir migração de formato no futuro.

export interface Draft {
  source: string;
  circuits: boolean;
  savedAt: string;
}

export interface Settings {
  layout: "horizontal" | "vertical";
}

const DRAFT_KEY = "rpic:draft.v1";
const SETTINGS_KEY = "rpic:settings.v1";

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
  return read<Settings>(SETTINGS_KEY) ?? { layout: "horizontal" };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}
