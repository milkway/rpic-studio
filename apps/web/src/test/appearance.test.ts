import {
  bakeAppearance,
  googleFamilyOf,
  googleValue,
  resolveFontStack,
} from "@/lib/appearance";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" font-family="sans-serif" font-size="14"><text>oi</text></svg>';

describe("bakeAppearance (builtin)", () => {
  it("reescreve a font-family do <svg> raiz", () => {
    const out = bakeAppearance(SVG, "serif");
    expect(out).toContain(`font-family="${resolveFontStack("serif")}"`);
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

describe("Google Fonts", () => {
  it("googleValue / googleFamilyOf fazem roundtrip", () => {
    expect(googleFamilyOf(googleValue("Roboto Mono"))).toBe("Roboto Mono");
    expect(googleFamilyOf("serif")).toBeNull();
    expect(googleFamilyOf("")).toBeNull();
  });

  it("resolve a stack com a família e o genérico da categoria", () => {
    expect(resolveFontStack(googleValue("Roboto"))).toBe("'Roboto', sans-serif");
    expect(resolveFontStack(googleValue("Merriweather"))).toBe("'Merriweather', serif");
    expect(resolveFontStack(googleValue("JetBrains Mono"))).toBe("'JetBrains Mono', monospace");
    expect(resolveFontStack(googleValue("Pacifico"))).toBe("'Pacifico', cursive");
  });

  it("família fora do catálogo cai em sans-serif", () => {
    expect(resolveFontStack(googleValue("Fonte Inventada"))).toBe("'Fonte Inventada', sans-serif");
  });

  it("assa uma Google Font no SVG", () => {
    const out = bakeAppearance(SVG, googleValue("Roboto Slab"));
    expect(out).toContain(`font-family="'Roboto Slab', serif"`);
  });
});
