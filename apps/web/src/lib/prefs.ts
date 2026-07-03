// Sincroniza preferências do cliente (papel do diagrama, idioma, tema,
// layout) com a conta do usuário logado. Anônimo: só localStorage.
//
// Fluxo: ao carregar a sessão, as prefs da conta são aplicadas ao
// localStorage e o evento "rpic:prefs" avisa os providers para relerem.
// Cada mudança local chama pushPrefsSoon(), que envia o snapshot à API
// (silenciosamente ignorado quando não há sessão).

import { api } from "./api";

export const PREFS_EVENT = "rpic:prefs";

const KEYS = ["rpic:canvas.v1", "rpic:locale.v1", "rpic:theme.v1", "rpic:settings.v1"] as const;

type Prefs = Record<string, unknown>;

/** Snapshot das preferências locais (valores JSON por chave curta). */
export function collectPrefs(): Prefs {
  const prefs: Prefs = {};
  for (const key of KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) continue;
      const short = key.replace("rpic:", "").replace(/\.v\d+$/, "");
      // locale/theme são strings puras; os demais, JSON
      prefs[short] = key.includes("locale") || key.includes("theme") ? raw : JSON.parse(raw);
    } catch {
      // valor corrompido — não entra no snapshot
    }
  }
  return prefs;
}

/** Aplica prefs da conta ao localStorage e avisa os providers. */
export function applyPrefs(prefs: Prefs): void {
  for (const key of KEYS) {
    const short = key.replace("rpic:", "").replace(/\.v\d+$/, "");
    const value = prefs[short];
    if (value === undefined) continue;
    try {
      window.localStorage.setItem(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    } catch {
      // storage bloqueado — providers seguem com o estado atual
    }
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

let pushTimer: number | null = null;

/** Envia o snapshot à conta (debounce 1s); sem sessão, falha em silêncio. */
export function pushPrefsSoon(): void {
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    api("/api/auth/prefs", {
      method: "PUT",
      body: JSON.stringify(collectPrefs()),
    }).catch(() => {
      // anônimo (401) ou API fora do ar — preferência local continua valendo
    });
  }, 1000);
}
