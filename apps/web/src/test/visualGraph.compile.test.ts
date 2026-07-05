// Compila o pic GERADO pelo editor visual no WASM REAL — garante que todas as
// formas (inclusive o losango como polígono fechado preenchido) e as arestas
// entre compass points são sintaxe válida do rpic, não só string plausível.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import { compile } from "@/lib/rpic";
import { graphToPic, type VGraph } from "@/lib/visualGraph";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasmPath = require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm");
  await ready(readFileSync(wasmPath));
});

const graph: VGraph = {
  nodes: [
    { id: "a", shape: "box", label: "Início", x: 0, y: 0, w: 80, h: 48 },
    { id: "b", shape: "diamond", label: "ok?", x: 220, y: 0, w: 96, h: 72, fill: "lightyellow", stroke: "gray" },
    { id: "c", shape: "circle", label: "Fim", x: 440, y: 0, w: 60, h: 60 },
    { id: "d", shape: "ellipse", label: "log", x: 220, y: 160, w: 90, h: 52 },
  ],
  edges: [
    { id: "e1", from: "a", to: "b", arrow: true },
    { id: "e2", from: "b", to: "c", label: "sim", arrow: true },
    { id: "e3", from: "b", to: "d", label: "não", arrow: true },
  ],
};

describe("pic gerado pelo editor visual (WASM real)", () => {
  it("compila todas as formas + arestas sem erro", () => {
    const pic = graphToPic(graph);
    const out = compile(pic);
    expect(out.svg).toContain("<svg");
    expect(out.svg).toContain("</svg>");
  });

  it("os labels aparecem no SVG", () => {
    const out = compile(graphToPic(graph));
    for (const txt of ["Início", "ok?", "Fim", "log", "sim", "não"]) {
      expect(out.svg, `label "${txt}" no SVG`).toContain(txt);
    }
  });

  it("o losango preenchido gera fill no SVG", () => {
    const out = compile(graphToPic(graph));
    // shaded "lightyellow" → algum fill não-preto no polígono
    expect(out.svg.toLowerCase()).toMatch(/fill/);
  });
});

describe("alinhamento de rótulo (ljust/rjust/above/below) compila no WASM real", () => {
  it("box com ljust/rjust/above/below (isolados e combinados) compila e move o texto", () => {
    const g: VGraph = {
      nodes: [
        { id: "a", shape: "box", label: "Left", x: 0, y: 0, w: 80, h: 48, align: "ljust" },
        { id: "b", shape: "box", label: "Right", x: 200, y: 0, w: 80, h: 48, align: "rjust" },
        { id: "c", shape: "box", label: "Combo", x: 0, y: 150, w: 80, h: 48, align: "ljust", vpos: "above" },
      ],
      edges: [],
    };
    const out = compile(graphToPic(g));
    expect(out.svg).toContain("<svg");
    expect(out.svg).toMatch(/text-anchor="start"[^>]*>Left</);
    expect(out.svg).toMatch(/text-anchor="end"[^>]*>Right</);
    expect(out.svg).toMatch(/text-anchor="start"[^>]*>Combo</);
  });
});

describe("arco e spline (VLine.kind) compilam no WASM real", () => {
  it("arco livre (cw/ccw) e ancorado→livre compilam com <path>", () => {
    const g: VGraph = {
      nodes: [{ id: "a", shape: "box", label: "N", x: 0, y: 0, w: 80, h: 48 }],
      edges: [],
      lines: [
        { id: "L0", kind: "arc", arrow: true, a: { x: 0, y: 120 }, b: { x: 192, y: 120 } },
        { id: "L1", kind: "arc", arrow: false, cw: true, a: { node: "a", side: "e" }, b: { x: 300, y: 200 } },
      ],
    };
    const out = compile(graphToPic(g));
    expect(out.svg).toContain("<svg");
    expect(out.svg).toContain("<path");
  });

  it("spline com ponto intermediário compila com <path>", () => {
    const g: VGraph = {
      nodes: [],
      edges: [],
      lines: [{ id: "L0", kind: "spline", arrow: true, a: { x: 0, y: 0 }, b: { x: 192, y: 0 }, pts: [{ x: 96, y: -96 }] }],
    };
    const out = compile(graphToPic(g));
    expect(out.svg).toContain("<svg");
    expect(out.svg).toContain("<path");
  });
});
