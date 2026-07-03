// rpic studio Design System — utilidades compartilhadas.

export { cn } from "./cn";
export * as motion from "./motion";

/** Resolve um asset público respeitando o base path (raiz ou subcaminho).
 *  Ex.: asset("brand/logo.svg") -> "/rpic/brand/logo.svg" sob subpath. */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

/** Tokens de cor expostos em JS (para canvas, exports, temas de editor). */
export const colors = {
  paper: "#f6f3ec",
  surface: "#fffdf8",
  surfaceMuted: "#efebe1",
  text: "#26221c",
  textBody: "#57503f",
  textMuted: "#8d8471",
  border: "#e5dfd1",
  ink: "#211e1a",
  inkRaised: "#2b2721",
  inkBorder: "#3a352d",
  inkText: "#ece5d8",
  inkMuted: "#948b7a",
  accent: "#d1461f",
  accentStrong: "#b23917",
  success: "#4a7c59",
  warning: "#b07d20",
  danger: "#b3341d",
} as const;
