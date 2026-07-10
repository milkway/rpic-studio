// Compila o snippet de CADA elemento da paleta no WASM REAL — garante que o
// catálogo (nomes, aridade, argumento string) segue a biblioteca `circuits`
// da versão pinada do rpic. Se um macro mudar de assinatura ou sumir num
// bump, este teste aponta o elemento exato.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import { compile } from "@/lib/rpic";
import { CIRCUIT_ELEMENTS, insertCircuitElement } from "@/lib/circuitCatalog";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasmPath = require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm");
  await ready(readFileSync(wasmPath));
});

describe("paleta de circuitos (WASM real)", () => {
  it("todos os elementos do catálogo compilam e desenham algo", () => {
    for (const el of CIRCUIT_ELEMENTS) {
      const source = insertCircuitElement(".PS\n.PE\n", el);
      const out = compile(source);
      expect(out.svg, `elemento "${el.id}" deve gerar SVG`).toContain("<svg");
      // desenhou geometria de verdade (não só o canvas vazio)
      expect(out.objects.length, `elemento "${el.id}" deve criar objetos`).toBeGreaterThan(0);
    }
  });

  it("inserções sucessivas empilham sem colidir nomes de ponto", () => {
    let src = ".PS\n.PE\n";
    for (const el of CIRCUIT_ELEMENTS.slice(0, 6)) src = insertCircuitElement(src, el);
    const out = compile(src);
    expect(out.svg).toContain("<svg");
    expect((src.match(/copy "circuits"/g) ?? []).length).toBe(1);
  });
});
