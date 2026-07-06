import { describe, expect, it } from "vitest";
import { applyCss, injectCss, readCss } from "./customCss";

describe("customCss", () => {
  it("grava e lê o CSS de volta (round-trip)", () => {
    const src = ".PS\nbox class \"a\" \"x\"\n.PE";
    const css = ".a { stroke: red }\n.b { fill: #eef }";
    const out = applyCss(src, css);
    expect(out).toContain(".PS");
    expect(out).toContain('# .a { stroke: red }'); // comentado no source
    expect(readCss(out)).toBe(css);
  });

  it("é idempotente (regrava substitui, não acumula)", () => {
    const src = ".PS\nbox\n.PE";
    const a = applyCss(src, ".a{}");
    const b = applyCss(a, ".b{ fill: blue }");
    expect(readCss(b)).toBe(".b{ fill: blue }");
    expect((b.match(/css \(rpic studio\)/g) ?? []).length).toBe(1); // um bloco só
  });

  it("CSS vazio remove o bloco", () => {
    const src = applyCss(".PS\nbox\n.PE", ".a{}");
    expect(readCss(src)).toBe(".a{}");
    const cleared = applyCss(src, "  ");
    expect(readCss(cleared)).toBe("");
    expect(cleared).not.toContain("css (rpic studio)");
    expect(cleared).toContain(".PS");
  });

  it("preserva `#` do conteúdo (cores hex, seletores de id)", () => {
    const css = "#node { fill: #ff0000 }";
    expect(readCss(applyCss("box", css))).toBe(css);
  });

  it("injeta <style> após a tag <svg>", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10"><rect/></svg>';
    const out = injectCss(svg, ".a { stroke: red }");
    expect(out).toMatch(/<svg[^>]*><style>\.a \{ stroke: red \}<\/style><rect/);
  });

  it("injectCss é no-op sem CSS", () => {
    const svg = "<svg><rect/></svg>";
    expect(injectCss(svg, "  ")).toBe(svg);
  });
});
