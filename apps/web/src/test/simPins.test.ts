// Terminais → SVG (issue #21): a translação do frame pic sai das pontas dos
// traços desenhados. Pura nos pontos; com o dune REAL na figura pino a pino.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ensureDune, extractPic, renderPic } from "@/lib/dune";
import { frameClusters, netPins, pinFrame, pinToSvg, svgEndpoints } from "@/lib/simFigure";
import { PIN_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ensureDune(
    readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
  );
});

describe("pinFrame", () => {
  it("a translação mais votada pelos terminais distintos", () => {
    // frame verdadeiro: tx = 10, ty = 200; um ponto solto não engana
    const pins = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const ends: [number, number][] = [
      [10, 200],
      [106, 200],
      [106, 104],
      [500, 500],
    ];
    const f = pinFrame(ends, pins)!;
    expect(f.tx).toBeCloseTo(10);
    expect(f.ty).toBeCloseTo(200);
    expect(pinToSvg({ x: 1, y: 1 }, f)).toEqual([106, 104]);
  });

  it("nem metade dos terminais casa: null (sem alvo no lugar errado)", () => {
    const pins = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 3 },
      { x: 4, y: 7 },
    ];
    expect(pinFrame([[0, 0]], pins)).toBeNull();
    expect(pinFrame([], pins)).toBeNull();
  });
});

describe("terminais na figura do dune", () => {
  it("figura pino a pino: redes sem forma, terminais nas pontas desenhadas", () => {
    const { map } = extractPic(PIN_FIGURE);
    expect(map.nets.find((n) => n.name === "n2")?.shapes).toEqual([]);
    expect(netPins(map, "n2")).toEqual([{ x: 1.5, y: 1 }]); // R1.N = R2.P: um só ponto
    const doc = new DOMParser().parseFromString(renderPic(PIN_FIGURE), "image/svg+xml");
    const ends = svgEndpoints(doc.documentElement);
    const all = map.elements.flatMap((e) => e.pins);
    const f = pinFrame(ends, all)!;
    expect(f).not.toBeNull();
    // todo terminal cai exatamente numa ponta desenhada
    for (const p of all) {
      const [x, y] = pinToSvg(p, f);
      expect(ends.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 0.01)).toBe(true);
    }
  });
});

describe("pinFrame: vencedor único", () => {
  it("empate entre duas translações (terminais na mesma altura): null", () => {
    const pins = [
      { x: 0, y: 1 },
      { x: 1.5, y: 1 },
    ];
    // frame (0, 0) põe os pinos em y = −96; frame (0, 96) em y = 0 — os dois casam 2
    const ends: [number, number][] = [
      [0, -96],
      [144, -96],
      [0, 0],
      [144, 0],
    ];
    expect(pinFrame(ends, pins)).toBeNull();
    // desempata com um terminal a mais (a terra em (0.75, 0) → (72, 96) no frame certo)
    const f = pinFrame([...ends, [72, 96]], [...pins, { x: 0.75, y: 0 }]);
    expect(f).toEqual({ tx: 0, ty: 96 });
  });

  it("um só voto não basta (mínimo 2)", () => {
    expect(pinFrame([[10, 20]], [{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("frameClusters (tolerância, não arredondamento)", () => {
  it("par que atravessa uma fronteira de arredondamento vira UM grupo", () => {
    // tx = 77.325 ± ruído: arredondar a 0,05 separaria 77.3249… e 77.3251…
    const pins = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const ends: [number, number][] = [
      [77.32499999, 130],
      [96 + 77.32500001, 130],
    ];
    const clusters = frameClusters(ends, pins);
    const big = clusters.filter((c) => c.voters.size === 2);
    expect(big).toHaveLength(1);
    expect(pinFrame(ends, pins)?.tx).toBeCloseTo(77.325, 6);
  });
});
