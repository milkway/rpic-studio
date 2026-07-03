// Build math REAL em Node: `$…$` vira tipografia (glyph paths), sem fallback.
// Arquivo separado do compile.test.ts de propósito: o wasm-bindgen fixa o
// build na primeira inicialização e o Vitest isola módulos por arquivo.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import { compile } from "@/lib/rpic";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasmPath = require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_math_bg.wasm");
  await ready(readFileSync(wasmPath), { math: true });
});

describe("build math (texlabels)", () => {
  it("tipografa rótulo $…$ como glyph paths, sem diagnóstico de fallback", () => {
    const out = compile('box "$x^2 + y^2$" fit', { texlabels: true });
    // svg aninhado com paths de glifos — não o texto literal
    expect(out.svg).toContain("<svg");
    expect(out.svg).toContain("<path");
    expect(out.svg).not.toContain("$x^2");
    expect(out.diagnostics).toEqual([]);
  });

  it("sem texlabels o rótulo continua literal", () => {
    const out = compile('box "$x^2$"');
    expect(out.svg).toContain("$x^2$");
  });
});
