// Compila com o WASM REAL em Node — pega regressões de versão do pacote
// @strategicprojects/rpic e valida todos os exemplos embarcados no app.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import { compile, errorPosition } from "@/lib/rpic";
import { examples } from "@/lib/examples";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasmPath = require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm");
  await ready(readFileSync(wasmPath));
});

describe("compilador rpic (WASM real)", () => {
  it("compila um diagrama básico para SVG", () => {
    const out = compile('box "a"; arrow; box "b"');
    expect(out.svg).toContain("<svg");
    expect(out.svg).toContain("</svg>");
    expect(out.animations).toEqual([]);
  });

  it("todos os exemplos embarcados compilam", () => {
    for (const ex of examples) {
      const out = compile(ex.source, { circuits: ex.circuits });
      expect(out.svg, `exemplo "${ex.id}" deve gerar SVG`).toContain("<svg");
    }
  });

  it("o exemplo de boas-vindas tem manifesto de animação", () => {
    const welcome = examples.find((e) => e.id === "welcome")!;
    const out = compile(welcome.source);
    expect(out.animations.length).toBeGreaterThan(0);
    expect(out.animations[0]).toHaveProperty("id");
    expect(out.animations[0]).toHaveProperty("effect");
  });

  it("erro de sintaxe lança com posição linha:coluna", () => {
    expect(() => compile('box "a"\nfoo bar\n')).toThrowError();
    try {
      compile('box "a"\nfoo bar\n');
    } catch (e) {
      const pos = errorPosition((e as Error).message);
      expect(pos?.line).toBe(2);
    }
  });

  it("print vira diagnostics", () => {
    const out = compile('x = 6*7\nprint x\nbox "ok"');
    expect(out.diagnostics.some((d) => d.includes("42"))).toBe(true);
  });
});
