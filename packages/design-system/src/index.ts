// rpic studio Design System — utilidades compartilhadas.

export { cn } from "./cn";
export * as motion from "./motion";

/** Resolve um asset público respeitando o base path (raiz ou subcaminho).
 *  Ex.: asset("brand/logo.svg") -> "/rpic/brand/logo.svg" sob subpath. */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

/** Tokens de cor expostos em JS (para canvas, exports, temas de editor).
 *  Tema "rpic forest" — mesma paleta do site rpic.dev. */
export const colors = {
  paper: "#f7faf7",
  surface: "#ffffff",
  surfaceMuted: "#f1f5f2",
  text: "#0f172a",
  textBody: "#475569",
  textMuted: "#94a3b8",
  border: "#e2e8f0",
  ink: "#1e2823",
  inkRaised: "#273229",
  inkBorder: "#37453b",
  inkText: "#d3e0d5",
  inkMuted: "#6f8274",
  accent: "#1b5e20",
  accentStrong: "#144a19",
  success: "#2e7d32",
  warning: "#b07d20",
  danger: "#c62828",
} as const;
