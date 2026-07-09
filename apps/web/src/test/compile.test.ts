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

  // rpic 0.9.0
  it("gradient + hatch pinta UM gradiente no objeto todo (rpic-lang#273)", () => {
    const out = compile('box gradient "gold" "crimson" hatch');
    // o gradiente vive como underlay próprio, não dentro do tile do <pattern>
    // (dentro do tile ele repetiria por célula da hachura — efeito acolchoado)
    const pattern = /<pattern[\s\S]*?<\/pattern>/.exec(out.svg)?.[0] ?? "";
    expect(out.svg).toContain("<linearGradient");
    expect(pattern).not.toContain("linearGradient");
  });

  it("thin afina o traço em 2/3 do linethick", () => {
    const out = compile("line right 1\nline right 1 thin");
    const widths = [...out.svg.matchAll(/<line[^>]*stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBeCloseTo(widths[0] * (2 / 3), 3);
  });

  it("cor em variável e em expressão resolve em posição de cor", () => {
    const out = compile('accent = 0x1b5e20\nbox shaded accent\nbox shaded (accent + 0x101010)');
    expect(out.svg).toContain('fill="#1b5e20"');
    expect(out.svg).toContain('fill="#2b6e30"');
  });

  it("cor desconhecida gera warning invalid_color com sugestão", () => {
    const out = compile('box outlined "crimsom"');
    const w = out.warnings.find((d) => d.kind === "invalid_color");
    expect(w).toBeDefined();
    expect(w!.found).toBe("crimsom");
    expect(w!.hint).toContain("crimson");
  });
});
