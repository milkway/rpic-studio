// Terminais → SVG (issue #21): o frame pic → SVG vem EXATO do `map.canvas`
// do dune-sim ≥ 0.3.4 (milkway/dune#19). Pura na conta; com o dune REAL na
// figura pino a pino (com e sem margens).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ensureDune, extractPic, renderPic, type OverlayCanvas } from "@/lib/dune";
import { netPins, pinToSvg } from "@/lib/simFigure";
import { PIN_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ensureDune(
    readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
  );
});

/** Pontas dos traços desenhados de um SVG do rpic (unidades do viewBox):
 *  `line` (as duas), `polyline`/`polygon` (todos os vértices), `path` (o 1º
 *  ponto e o último par) — só para conferir onde os terminais caem. */
function strokeEnds(root: ParentNode): [number, number][] {
  const out: [number, number][] = [];
  const num = (el: Element, a: string) => Number(el.getAttribute(a));
  for (const el of root.querySelectorAll("line, polyline, polygon, path")) {
    const tag = el.tagName.toLowerCase();
    if (tag === "line") {
      out.push([num(el, "x1"), num(el, "y1")], [num(el, "x2"), num(el, "y2")]);
      continue;
    }
    const nums = (el.getAttribute(tag === "path" ? "d" : "points") ?? "")
      .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
      ?.map(Number);
    if (!nums || nums.length < 2) continue;
    if (tag === "path") {
      out.push([nums[0], nums[1]], [nums[nums.length - 2], nums[nums.length - 1]]);
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    }
  }
  return out.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

describe("pinToSvg: o frame do canvas", () => {
  it("sx = (x + ox)·96, sy = (h − (y + oy))·96 — origem ≠ 0; rescale não entra", () => {
    const canvas: OverlayCanvas = { w: 3, h: 2, origin: [0.25, 0.5], rescale: 0.5 };
    expect(pinToSvg({ x: 0, y: 0 }, canvas)).toEqual([24, 144]);
    expect(pinToSvg({ x: 1, y: 1 }, canvas)).toEqual([120, 48]);
    // coordenada negativa (figura à esquerda/abaixo da origem pic)
    expect(pinToSvg({ x: -0.25, y: 1.5 }, canvas)).toEqual([0, 0]);
    // o mesmo canvas com outro rescale: mesma posição
    expect(pinToSvg({ x: 1, y: 1 }, { ...canvas, rescale: 1 })).toEqual([120, 48]);
  });
});

describe("terminais na figura do dune", () => {
  const check = (source: string) => {
    const { map } = extractPic(source);
    const doc = new DOMParser().parseFromString(renderPic(source), "image/svg+xml");
    const svg = doc.documentElement;
    // viewBox = 0 0 w·96 h·96
    const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
    expect(vb[0]).toBeCloseTo(0, 6);
    expect(vb[1]).toBeCloseTo(0, 6);
    expect(vb[2]).toBeCloseTo(map.canvas.w * 96, 3);
    expect(vb[3]).toBeCloseTo(map.canvas.h * 96, 3);
    // todo terminal cai exatamente numa ponta desenhada
    const ends = strokeEnds(svg);
    const all = map.elements.flatMap((e) => e.pins);
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      const [x, y] = pinToSvg(p, map.canvas);
      expect(ends.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 0.01)).toBe(true);
    }
    return map;
  };

  it("figura pino a pino: redes sem forma, terminais nas pontas desenhadas", () => {
    const map = check(PIN_FIGURE);
    expect(map.nets.find((n) => n.name === "n2")?.shapes).toEqual([]);
    expect(netPins(map, "n2")).toEqual([{ x: 1.5, y: 1 }]); // R1.N = R2.P: um só ponto
  });

  it("com margens: a origem da página se move e os terminais seguem", () => {
    const plain = extractPic(PIN_FIGURE).map.canvas;
    const withMargins = (m: string) => PIN_FIGURE.replace("spice = 1\n", `spice = 1\n${m}`);
    // só a esquerda: a origem anda 0,4" em x, a página cresce 0,4", y fica
    const left = check(withMargins("leftmargin = 0.4\n")).canvas;
    expect(left.origin[0]).toBeCloseTo(plain.origin[0] + 0.4, 6);
    expect(left.origin[1]).toBeCloseTo(plain.origin[1], 6);
    expect(left.w).toBeCloseTo(plain.w + 0.4, 6);
    expect(left.h).toBeCloseTo(plain.h, 6);
    // todas + lados (assimétricas): o frame ainda casa todo terminal
    const all = check(withMargins("margin = 0.3\nleftmargin = 0.4\nbottommargin = 0.1\n")).canvas;
    expect(all.origin[0]).toBeGreaterThan(left.origin[0]);
    expect(all.origin[1]).toBeGreaterThan(plain.origin[1]);
  });
});
