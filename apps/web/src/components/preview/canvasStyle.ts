import type { CSSProperties } from "react";
import type { CanvasSettings } from "@/lib/storage";

/** Estilo de fundo do papel do diagrama a partir das preferências. */
export function canvasBackground(c: CanvasSettings): CSSProperties {
  const base: CSSProperties = { backgroundColor: c.bg };
  if (c.pattern === "dots") {
    return {
      ...base,
      backgroundImage: `radial-gradient(circle, ${c.gridColor} 1px, transparent 1px)`,
      backgroundSize: `${c.gridSize}px ${c.gridSize}px`,
      backgroundPosition: "center",
    };
  }
  if (c.pattern === "lines") {
    return {
      ...base,
      backgroundImage: `linear-gradient(${c.gridColor} 1px, transparent 1px), linear-gradient(90deg, ${c.gridColor} 1px, transparent 1px)`,
      backgroundSize: `${c.gridSize}px ${c.gridSize}px`,
      backgroundPosition: "center",
    };
  }
  return base;
}
