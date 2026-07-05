import { describe, expect, it } from "vitest";
import { setObjectAttr } from "./objectEdit";

describe("setObjectAttr", () => {
  it("anexa fill (shaded) a uma statement sem estilo", () => {
    expect(setObjectAttr('box "A"', 1, 1, "fill", "red")).toBe('box "A" shaded "red"');
  });

  it("substitui um fill existente em vez de duplicar", () => {
    expect(setObjectAttr('box "A" shaded "red"', 1, 1, "fill", "blue")).toBe('box "A" shaded "blue"');
  });

  it("remove o fill com valor vazio", () => {
    expect(setObjectAttr('box "A" shaded "red"', 1, 1, "fill", undefined)).toBe('box "A"');
  });

  it("aceita cor hex", () => {
    expect(setObjectAttr("circle", 1, 1, "fill", "#1b5e20")).toBe('circle shaded "#1b5e20"');
  });

  it("hatch/dash/thick anexam e substituem", () => {
    let s = setObjectAttr("box", 1, 1, "hatch", "crosshatch");
    expect(s).toBe("box crosshatch");
    s = setObjectAttr(s, 1, 1, "hatch", "hatch");
    expect(s).toBe("box hatch");
    s = setObjectAttr(s, 1, 1, "dash", "dashed");
    expect(s).toBe("box hatch dashed");
    s = setObjectAttr(s, 1, 1, "thick", 1.5);
    expect(s).toBe("box hatch dashed thick 1.5");
    s = setObjectAttr(s, 1, 1, "thick", undefined);
    expect(s).toBe("box hatch dashed");
  });

  it("hatch NÃO confunde com hatchangle", () => {
    // hatchangle não deve ser removido pelo regex de hatch (fronteira de palavra)
    const s = setObjectAttr("box hatch hatchangle 30", 1, 1, "hatch", undefined);
    expect(s).toBe("box hatchangle 30");
  });

  it("edita a statement CERTA numa linha com várias (respeita o ;)", () => {
    const src = 'box "A"; circle "B"';
    // col 1 → a caixa (antes do ;)
    expect(setObjectAttr(src, 1, 1, "fill", "red")).toBe('box "A" shaded "red"; circle "B"');
    // col do "circle" (10, 1-based) → o círculo (fim da linha)
    const colCircle = src.indexOf("circle") + 1;
    expect(setObjectAttr(src, 1, colCircle, "fill", "red")).toBe('box "A"; circle "B" shaded "red"');
  });

  it("edita a linha correta num pic multilinha", () => {
    const src = 'box "A"\ncircle "B"\nellipse "C"';
    expect(setObjectAttr(src, 2, 1, "fill", "gray")).toBe('box "A"\ncircle "B" shaded "gray"\nellipse "C"');
  });

  it("não altera nada com linha inválida", () => {
    expect(setObjectAttr("box", 9, 1, "fill", "red")).toBe("box");
  });

  it("preserva rótulo com aspas ao anexar (não fecha string errada)", () => {
    expect(setObjectAttr('box "a; b"', 1, 1, "fill", "red")).toBe('box "a; b" shaded "red"');
  });
});
