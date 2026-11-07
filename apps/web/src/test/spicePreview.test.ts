// Preview de fontes `spice = 1` (issue #17): o rpic do Studio (WASM real) com o
// prelude do dune à frente — o texto vem do módulo virtual que o vite.config.ts
// extrai do dune-sim instalado, o MESMO que o `renderPic` do dune usa.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ready } from "@strategicprojects/rpic";
import prelude from "virtual:dune-prelude";
import { compile, type CompileError } from "@/lib/rpic";
import {
  compileFigure,
  compileWithPrelude,
  DUNE_PRELUDE_FILE,
  loadDunePrelude,
  preludeOffset,
} from "@/lib/dunePrelude";
import { explainDiagnostic } from "@/lib/errorInfo";
import { solvePicMapping } from "@/lib/picCoords";
import { RLC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ready(readFileSync(require.resolve("@strategicprojects/rpic/pkg/rpic_wasm_bg.wasm")));
});

const opts = { circuits: true, texlabels: false };
const unmarked = RLC_FIGURE.replace("spice = 1\n", "");

function compileError(fn: () => unknown): CompileError {
  try {
    fn();
  } catch (e) {
    return e as CompileError;
  }
  throw new Error("esperava erro de compilação");
}

describe("prelude do dune no preview (issue #17)", () => {
  it("o módulo virtual traz o prelude com as macros de elemento", async () => {
    expect(prelude).toMatch(/define vsource\b/);
    expect(prelude).toMatch(/define isource\b/);
    expect(await loadDunePrelude()).toBe(prelude);
  });

  it("RLC marcada spice compila sem erro e desenha os grupos dos elementos", () => {
    const b = compileWithPrelude(RLC_FIGURE, prelude, opts);
    expect(b.warnings).toEqual([]);
    expect(b.svg).toContain("<svg");
    expect(b.svg).toMatch(/<g id="s0"/);
    expect(b.objects.length).toBeGreaterThan(10);
    // os ids dos grupos batem com o bundle: um <g id="sN"> por objeto
    for (const o of b.objects) expect(b.svg).toContain(`id="${o.id}"`);
  });

  it("posições ficam no referencial do usuário (objects, places, passthrough)", () => {
    const b = compileWithPrelude(RLC_FIGURE, prelude, opts);
    const user = b.objects.filter((o) => o.file == null);
    expect(user.length).toBeGreaterThan(0);
    const lines = RLC_FIGURE.split("\n").length;
    for (const o of user) expect(o.line!).toBeLessThanOrEqual(lines);
    // o `line from (3,0) to (0,0)` (linha 9) é um objeto do usuário
    expect(user.some((o) => o.line === 9 && o.kind === "path")).toBe(true);
    // nada fica apontando para dentro do prelude sem o rótulo de arquivo
    for (const o of b.objects) if (o.line && o.line > lines) expect(o.file).toBeTruthy();
    const In = b.places!.find((p) => p.label === "In")!;
    expect(In).toMatchObject({ line: 4, col: 1 });
    expect(b.passthrough!.map((p) => [p.text, p.line])).toEqual([[".ac dec 50 10 100k", 13]]);
  });

  it("objetos dos elementos são atribuídos à linha da CHAMADA do usuário (inspetor)", () => {
    const b = compileWithPrelude(RLC_FIGURE, prelude, opts);
    const visible = b.objects.filter((o) => o.bbox && o.bbox.w + o.bbox.h > 0);
    // nada visível fica preso ao prelude/circuits: tudo é clicável no inspetor
    expect(visible.filter((o) => o.file)).toEqual([]);
    const linesOf = (re: RegExp) => {
      const n = RLC_FIGURE.split("\n").findIndex((l) => re.test(l)) + 1;
      return visible.filter((o) => o.line === n);
    };
    for (const [re, col] of [
      [/^V1: vsource/, 5],
      [/^L1: inductor/, 5],
      [/^C1: capacitor/, 5],
      [/^R1: resistor/, 5],
      [/^ground\(/, 1],
    ] as const) {
      const objs = linesOf(re);
      expect(objs.length, String(re)).toBeGreaterThan(1); // traços + rótulo de valor
      for (const o of objs) expect(o.col, String(re)).toBe(col);
    }
    // o SVG é o mesmo com ou sem a `scene` pedida (só lemos os blocos dela)
    expect(b.svg).toBe(compile(prelude + "\n" + RLC_FIGURE, { circuits: true }).svg);
    expect(b.scene).toBeUndefined();
  });

  it("figura só de elementos: o mapeamento de coordenadas acha âncora", () => {
    const only = ".PS\nspice = 1\nR1: resistor((0,0), (1,0), 1k)\n.PE\n";
    const b = compileWithPrelude(only, prelude, opts);
    expect(b.objects.some((o) => o.bbox && !o.file)).toBe(true);
    expect(solvePicMapping(only, { ...opts, prelude }, b.objects)).not.toBeNull();
  });

  it("erro do usuário volta re-baseado (mensagem e errorInfo)", () => {
    const broken = RLC_FIGURE.replace("C1: capacitor(A, Out, 1u)", "C1: capacitor(A, Out 1u)");
    const err = compileError(() => compileWithPrelude(broken, prelude, opts));
    expect(err.errorInfo).toMatchObject({ line: 7, file: null });
    expect(err.message).toMatch(/^7:\d+:/);
  });

  it("erro dentro do prelude ganha o arquivo sintético (fora do editor)", () => {
    const err = compileError(() => compileWithPrelude(".PS\nV1: vsource()\n.PE\n", prelude, opts));
    const d = err.errorInfo!;
    expect(d.file).toBe(DUNE_PRELUDE_FILE);
    expect(d.line!).toBeLessThanOrEqual(preludeOffset(prelude));
    expect(err.message.startsWith(`${DUNE_PRELUDE_FILE}:${d.line}:`)).toBe(true);
    const info = explainDiagnostic(d, "", "pt");
    expect(info.line).toBeNull();
    expect(info.friendly).toContain("prelúdio do dune");
  });

  it("erro semântico sem prefixo na mensagem também re-baseia o errorInfo", () => {
    const err = compileError(() => compileWithPrelude(".PS\nR1: resistor(A,B)\n.PE\n", prelude, opts));
    expect(err.errorInfo).toMatchObject({ kind: "unknown_label", line: 2, col: 14, file: null });
  });

  it("sem `spice = 1` o comportamento é o de antes: o rpic rejeita `vsource`", () => {
    const err = compileError(() => compileFigure(unmarked, opts, null));
    expect(err.errorInfo).toMatchObject({ line: 4, col: 12, file: null });
    // caminho não-spice = `compile` puro, byte a byte
    const plain = 'box "a"; arrow; box "b"';
    expect(compileFigure(plain, opts, null)).toEqual(compile(plain, opts));
  });

  it("o mapeamento SVG→pic (shadow compile) também usa o prelude", () => {
    const b = compileWithPrelude(RLC_FIGURE, prelude, opts);
    expect(solvePicMapping(RLC_FIGURE, { ...opts, prelude }, b.objects)).not.toBeNull();
    expect(solvePicMapping(RLC_FIGURE, opts, b.objects)).toBeNull();
  });
});
