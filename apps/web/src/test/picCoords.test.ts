// Valida o mapeamento SVG→pic (shadow compile com sondas) no WASM REAL:
// objetos colocados em coordenadas conhecidas têm que voltar a elas.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import { compile } from "@/lib/rpic";
import { formatPicPoint, solvePicMapping, svgToPic } from "@/lib/picCoords";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasmPath = require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm");
  await ready(readFileSync(wasmPath));
});

const OPTS = { circuits: false, texlabels: false };

function centerOf(b: { x: number; y: number; w: number; h: number }) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

describe("solvePicMapping (WASM real)", () => {
  it("recupera as coordenadas pic de objetos em posições conhecidas", () => {
    const src = '.PS\nA: box at (0,0)\nB: circle at (2,1) rad 0.25\n.PE';
    const bundle = compile(src, OPTS);
    const map = solvePicMapping(src, OPTS, bundle.objects)!;
    expect(map).not.toBeNull();
    const a = svgToPic(map, ...(Object.values(centerOf(bundle.objects[0].bbox!)) as [number, number]));
    const b = svgToPic(map, ...(Object.values(centerOf(bundle.objects[1].bbox!)) as [number, number]));
    expect(a.x).toBeCloseTo(0, 2);
    expect(a.y).toBeCloseTo(0, 2);
    expect(b.x).toBeCloseTo(2, 2);
    expect(b.y).toBeCloseTo(1, 2);
  });

  it("as sondas ampliando os bounds não distorcem o mapa (âncora compensa)", () => {
    // desenho longe da origem: os dots em (0,0)/(1,1) MUDAM os bounds do
    // shadow compile — o resultado tem que continuar exato mesmo assim
    const src = "C: circle at (5,3) rad 0.3\nD: box at (7,4)";
    const bundle = compile(src, OPTS);
    const map = solvePicMapping(src, OPTS, bundle.objects)!;
    const d = svgToPic(map, ...(Object.values(centerOf(bundle.objects[1].bbox!)) as [number, number]));
    expect(d.x).toBeCloseTo(7, 2);
    expect(d.y).toBeCloseTo(4, 2);
  });

  it("absorve `scale` (unidades não-polegada)", () => {
    const src = "scale = 2.54\nE: box at (2,1) wid 1 ht 1";
    const bundle = compile(src, OPTS);
    const map = solvePicMapping(src, OPTS, bundle.objects)!;
    const e = svgToPic(map, ...(Object.values(centerOf(bundle.objects[0].bbox!)) as [number, number]));
    expect(e.x).toBeCloseTo(2, 2);
    expect(e.y).toBeCloseTo(1, 2);
  });

  it("devolve null p/ documento sem objetos", () => {
    const bundle = compile("x = 1", OPTS);
    expect(solvePicMapping("x = 1", OPTS, bundle.objects)).toBeNull();
  });

  it("formatPicPoint escreve como no código pic", () => {
    expect(formatPicPoint({ x: 1.256, y: -0.5 })).toBe("(1.26, -0.5)");
    expect(formatPicPoint({ x: 2, y: 0 })).toBe("(2, 0)");
  });
});
