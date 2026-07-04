import { bakeAppearance, fontStack } from "@/lib/appearance";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" font-family="sans-serif" font-size="14"><text>oi</text></svg>';

describe("bakeAppearance", () => {
  it("reescreve a font-family do <svg> raiz", () => {
    const out = bakeAppearance(SVG, "serif");
    expect(out).toContain(`font-family="${fontStack("serif")}"`);
    expect(out).not.toContain('font-family="sans-serif"');
  });

  it("fonte padrão (id vazio) mantém o SVG intacto", () => {
    expect(bakeAppearance(SVG, "")).toBe(SVG);
  });

  it("só toca no root, não em font-family de elementos internos", () => {
    const nested = '<svg font-family="sans-serif"><text font-family="monospace">x</text></svg>';
    const out = bakeAppearance(nested, "serif");
    expect(out).toContain('<text font-family="monospace">');
  });

  it("id desconhecido não altera nada", () => {
    expect(bakeAppearance(SVG, "inexistente")).toBe(SVG);
  });
});
