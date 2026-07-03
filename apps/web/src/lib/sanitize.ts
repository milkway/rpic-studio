// Defesa em profundidade: o compilador rpic escapa XML nos rótulos, mas o SVG
// pode ter vindo de um link compartilhado (código de terceiros). Sanitizamos
// antes de injetar no DOM, preservando ids (`s0`, `s1`…) que a animação usa.
import DOMPurify from "dompurify";

export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
  });
}
