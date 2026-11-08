// Cartões de análise (issue #33): o parser do editor, o port da grade de
// exibição do dune (`displayDeck`, números conferidos contra
// tools/gen-examples.mjs de milkway/dune@5bbfb9a) e a escrita de volta do
// cartão no fonte pic (com a re-extração do dune REAL).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  analysisCards,
  cardEdit,
  cardReadOnly,
  deckPointsOf,
  displayDeck,
  logicalLines,
  nominalPoints,
  spiceNum,
  validField,
} from "@/lib/simAnalysis";
import { applySourceEdit } from "@/lib/simSource";
import { ensureDune, extractPic } from "@/lib/dune";
import { RC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

const fieldsOf = (line: string) =>
  analysisCards(line)[0].fields.map((f) => [f.key, f.group, f.arg, f.present, f.text, f.value]);

describe("analysisCards: os cartões do netlist como campos", () => {
  it(".tran de 2, 3 e 4 argumentos, com uic", () => {
    expect(fieldsOf(".tran 20u 5m")).toEqual([
      ["tstart", "range", 2, false, "0", 0],
      ["tstop", "range", 1, true, "5m", 5e-3],
      ["tstep", "density", 0, true, "20u", 20 * 1e-6],
    ]);
    expect(fieldsOf(".tran 1u 1m 0.5m").map((f) => f.slice(0, 5))).toEqual([
      ["tstart", "range", 2, true, "0.5m"],
      ["tstop", "range", 1, true, "1m"],
      ["tstep", "density", 0, true, "1u"],
    ]);
    expect(fieldsOf(".tran 1u 1m 0 10u uic").map((f) => f[0])).toEqual([
      "tstart",
      "tstop",
      "tstep",
      "tmax",
    ]);
    const uic = analysisCards(".TRAN 1n 100n UIC")[0];
    expect(uic.type).toBe("tran");
    expect(uic.chip).toBe(".tran");
    expect(uic.readonly).toBeNull();
    expect(uic.fields.map((f) => f.key)).toEqual(["tstart", "tstop", "tstep"]);
  });

  it(".ac dec/oct/lin e .dc de uma e duas fontes", () => {
    for (const kind of ["dec", "oct", "lin"]) {
      const c = analysisCards(`.ac ${kind} 10 1 1meg`)[0];
      expect(c.chip).toBe(`.ac ${kind}`);
      expect(c.fields.map((f) => [f.key, f.value])).toEqual([
        ["fstart", 1],
        ["fstop", 1e6],
        ["points", 10],
      ]);
    }
    const one = analysisCards(".dc V1 0 5 0.1")[0];
    expect(one.chip).toBe(".dc V1");
    expect(one.fields.map((f) => [f.key, f.arg, f.value])).toEqual([
      ["start", 1, 0],
      ["stop", 2, 5],
      ["step", 3, 0.1],
    ]);
    // a 2ª fonte não vira campo (multiplica curvas, não pontos por curva)
    const two = analysisCards(".dc V1 0 5 0.1 V2 0 1 0.5")[0];
    expect(two.readonly).toBeNull();
    expect(two.fields.map((f) => f.arg)).toEqual([1, 2, 3]);
  });

  it("continuação `+` junta-se ao cartão; ordem por tipo", () => {
    const deck = "* x\nR1 a 0 1k\n.tran 1u\n+ 1m\n.ac dec 10 1 1k\n.tran 2u 2m\n.end\n";
    expect(logicalLines(deck)).toContain(".tran 1u  1m");
    const cards = analysisCards(deck);
    expect(cards.map((c) => [c.type, c.ordinal, c.text])).toEqual([
      ["tran", 0, ".tran 1u  1m"],
      ["ac", 0, ".ac dec 10 1 1k"],
      ["tran", 1, ".tran 2u 2m"],
    ]);
    expect(cards[0].fields.find((f) => f.key === "tstop")?.value).toBe(1e-3);
  });

  it("`{param}` e formas exóticas: só leitura, nunca adivinhado; .op/.tf sem editor", () => {
    for (const line of [
      ".tran 1u {tstop}",
      ".tran 1u 1m 0 1u 2u",
      ".ac dec {n} 1 1k",
      ".ac 10 1 1k",
      ".dc V1 0 {vmax} 0.1",
      ".dc V1 list 1 2 3",
      ".tran 1u 1m ; comentário",
    ]) {
      const [c] = analysisCards(line);
      expect([line, c.readonly, c.fields]).toEqual([line, "form", []]);
    }
    expect(
      analysisCards(".op\n.tf v(out) V1\n.noise v(out) V1 dec 10 1 1k").map((c) => c.readonly),
    ).toEqual(["analysis", "analysis", "analysis"]);
    // diretivas que não são análise não aparecem
    expect(
      analysisCards(".model DX D(IS=1e-14)\n.options trtol=1\n.measure tran x MAX v(a)"),
    ).toEqual([]);
  });

  it("validField: faixas e densidades aceitáveis", () => {
    const tran = analysisCards(".tran 1u 1m")[0];
    expect(validField(tran, "tstop", 2e-3)).toBe(true);
    expect(validField(tran, "tstart", 1e-3)).toBe(false); // início = fim
    expect(validField(tran, "tstep", 0)).toBe(false);
    const ac = analysisCards(".ac dec 10 10 100k")[0];
    expect(validField(ac, "points", 2.5)).toBe(false);
    expect(validField(ac, "fstart", 0)).toBe(false);
    expect(validField(ac, "fstop", 5)).toBe(false);
    const dc = analysisCards(".dc V1 0 5 0.1")[0];
    expect(validField(dc, "step", -0.1)).toBe(false);
    expect(validField(dc, "stop", -5)).toBe(false);
    expect(validField(dc, "step", 0.01)).toBe(true);
  });
});

describe("displayDeck: port da grade de exibição do dune", () => {
  // saídas do displayDeck de milkway/dune tools/gen-examples.mjs (@5bbfb9a)
  const REF: [string, string][] = [
    [".tran 20u 5m", ".tran 20u 5m 0 8.333333e-6"],
    [".tran 1n 100n", ".tran 1n 100n 0 1.666667e-10"],
    [".tran 1u 1m 0.5m", ".tran 1u 1m 0.5m 8.333333e-7"],
    [".tran 1u 1m 0 1u", ".tran 1u 1m 0 1u"],
    [".tran 1u 1m 0 10u uic", ".tran 1u 1m 0 1.666667e-6 uic"],
    [".tran 1u 1m uic", ".tran 1u 1m uic"],
    [".tran 1n 1u", ".tran 1n 1u"],
    [".tran 1u {tstop}", ".tran 1u {tstop}"],
    [".ac dec 10 10 100k", ".ac dec 150 10 100k"],
    [".ac dec 200 1 1k", ".ac dec 200 1 1k"],
    [".ac oct 5 100 1.6k", ".ac oct 150 100 1.6k"],
    [".ac lin 50 1meg 5meg", ".ac lin 600 1meg 5meg"],
    [".ac lin 1000 1 2", ".ac lin 1000 1 2"],
    [".ac dec {n} 1 1k", ".ac dec {n} 1 1k"],
    [".dc V1 0 5 0.1", ".dc V1 0 5 8.333333e-3"],
    [".dc V1 0 5 0.1 V2 0 1 0.5", ".dc V1 0 5 8.333333e-3 V2 0 1 0.5"],
    [".dc V1 0 5 0.001", ".dc V1 0 5 0.001"],
    [".dc V1 5 0 0.1", ".dc V1 5 0 0.1"],
    ["  .TRAN 10u 2m", "  .tran 10u 2m 0 3.333333e-6"],
    [
      "R1 a 0 1k\n.tran 20u 5m\n.ac dec 10 1 1meg\n.end",
      "R1 a 0 1k\n.tran 20u 5m 0 8.333333e-6\n.ac dec 100 1 1meg\n.end",
    ],
  ];
  it.each(REF)("%j", (deck, want) => {
    expect(displayDeck(deck)).toBe(want);
  });

  it("spiceNum: mantissa + um sufixo, o resto ignorado (INPevaluate)", () => {
    expect(spiceNum("10ms")).toBeCloseTo(10e-3);
    expect(spiceNum("5meg")).toBe(5e6);
    expect(spiceNum("1mil")).toBeCloseTo(25.4e-6);
    expect(spiceNum("{x}")).toBeNaN();
  });
});

describe("escrita do cartão no fonte pic", () => {
  const SRC = `.PS
spice = 1
V1: vsource((0,1),(0,0), DC 1)
R1: resistor((0,1),(1,1), 1k); ground((0,0)); line from (1,1) to (1,0) then to (0,0)
.tran 20u 5m
.ac dec 10 10 100k
.tran 1u
+ 2m uic
.PE
`;
  const NETLIST =
    "* netlist\nV1 n1 0 DC 1\nR1 n1 0 1k\n.tran 20u 5m\n.ac dec 10 10 100k\n.tran 1u\n+ 2m uic\n.end\n";
  const cards = analysisCards(NETLIST);
  const edit = (i: number, key: Parameters<typeof cardEdit>[3], text: string, src = SRC) => {
    const r = cardEdit(src, cards[i], cards, key, text);
    if (!r.ok) throw new Error(r.reason);
    return { ...r, next: applySourceEdit(src, r.edit) };
  };

  it("acha o cartão pela ordem, confere e troca SÓ o token (grafia do usuário)", () => {
    const r = edit(0, "tstop", "10m");
    expect(r.next).toContain("\n.tran 20u 10m\n");
    expect(r.card).toBe(".tran 20u 10m");
    expect(r.edit).toEqual({
      from: SRC.indexOf(".tran 20u 5m") + 10,
      to: SRC.indexOf(".tran 20u 5m") + 12,
      insert: "10m",
    });
    // µ vira u (o SPICE não lê µ)
    expect(edit(0, "tstep", "5µ").next).toContain("\n.tran 5u 5m\n");
  });

  it("TSTART ausente: inserido logo após o TSTOP, uic e continuação preservados", () => {
    const a = edit(0, "tstart", "1m");
    expect(a.next).toContain("\n.tran 20u 5m 1m\n");
    // o 2º .tran (com continuação `+`): o TSTOP está na linha de continuação
    const b = edit(2, "tstart", "0.5m");
    expect(b.next).toContain("\n.tran 1u\n+ 2m 0.5m uic\n");
    expect(b.card).toBe(".tran 1u 2m 0.5m uic");
    const c = edit(2, "tstop", "3m");
    expect(c.next).toContain("\n.tran 1u\n+ 3m uic\n");
  });

  it("dois cartões diferentes: cada um no seu lugar", () => {
    const a = edit(1, "points", "50");
    expect(a.next).toContain("\n.ac dec 50 10 100k\n");
    // os cartões velhos não valem mais para o texto novo (o .ac mudou)…
    expect(cardReadOnly(a.next, cards[1], cards)).toBe("mismatch");
    // …mas os do netlist re-extraído sim; o outro cartão segue intacto
    const fresh = analysisCards(NETLIST.replace(".ac dec 10", ".ac dec 50"));
    const b = cardEdit(a.next, fresh[0], fresh, "tstop", "1m");
    if (!b.ok) throw new Error(b.reason);
    const next = applySourceEdit(a.next, b.edit);
    expect(next).toContain("\n.tran 20u 1m\n.ac dec 50 10 100k\n");
  });

  it("texto divergente / cartão fora do fonte / contagem diferente: só leitura, com o motivo", () => {
    // o fonte tem outro texto no 1º .tran (macro gerou, ou o usuário editou)
    const other = SRC.replace(".tran 20u 5m", ".tran 20u 6m");
    expect(cardReadOnly(other, cards[0], cards)).toBe("mismatch");
    expect(cardEdit(other, cards[0], cards, "tstop", "7m")).toEqual({
      ok: false,
      reason: "mismatch",
    });
    // o cartão do netlist não existe no fonte (veio de macro)
    const none = SRC.replace(".ac dec 10 10 100k\n", "");
    expect(cardReadOnly(none, cards[1], cards)).toBe("not-found");
    // um .tran a mais no fonte do que no netlist: não dá para confiar na ordem
    const extra = SRC.replace(".PE", ".tran 9u 9m\n.PE");
    expect(cardReadOnly(extra, cards[0], cards)).toBe("count");
    expect(cardReadOnly(SRC, cards[0], cards)).toBeNull();
  });

  it("valor inválido não escreve", () => {
    expect(cardEdit(SRC, cards[0], cards, "tstop", "abc")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(cardEdit(SRC, cards[0], cards, "tstop", "0")).toEqual({ ok: false, reason: "invalid" });
    expect(cardEdit(SRC, cards[1], cards, "points", "1 0")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  describe("com o dune real", () => {
    beforeAll(async () => {
      await ensureDune(
        readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
      );
    });

    it("o fonte reescrito re-extrai com o cartão novo (extractPic)", () => {
      const pic = extractPic(RC_FIGURE);
      const list = analysisCards(pic.netlist);
      expect(list.map((c) => c.text)).toEqual([".tran 20u 5m"]);
      expect(cardReadOnly(RC_FIGURE, list[0], list)).toBeNull();
      const r = cardEdit(RC_FIGURE, list[0], list, "tstop", "10m");
      if (!r.ok) throw new Error(r.reason);
      const next = applySourceEdit(RC_FIGURE, r.edit);
      const again = analysisCards(extractPic(next).netlist);
      expect(again.map((c) => c.text)).toEqual([".tran 20u 10m"]);
      // e o deck denso dele segue o cartão novo
      expect(displayDeck(extractPic(next).netlist)).toContain(".tran 20u 10m 0 1.666667e-5");
    });

    it("netlist com continuação no fonte (dune junta o `+`): localizado e escrito", () => {
      const src = RC_FIGURE.replace(".tran 20u 5m\n", ".tran 20u\n+ 5m\n");
      const pic = extractPic(src);
      const list = analysisCards(pic.netlist);
      expect(list.map((c) => c.text.split(/\s+/).join(" "))).toEqual([".tran 20u 5m"]);
      const r = cardEdit(src, list[0], list, "tstep", "10u");
      if (!r.ok) throw new Error(r.reason);
      const next = applySourceEdit(src, r.edit);
      expect(next).toContain(".tran 10u\n+ 5m\n");
      expect(
        analysisCards(extractPic(next).netlist)[0].fields.find((f) => f.key === "tstep")?.value,
      ).toBeCloseTo(10e-6);
    });
  });
});

describe('contagem nominal do deck (o "deck: M" do rótulo)', () => {
  // conferidas contra o dune real (simulateTyped, npoints de cada plot)
  it.each([
    [".ac dec 10 10 100k", 41],
    [".ac dec 3 1 1.5", 1],
    [".ac oct 5 100 1.6k", 21],
    [".ac oct 3 100 1k", 10],
    [".ac lin 50 1meg 5meg", 50],
    [".dc V1 0 5 0.1", 51],
    [".dc V1 0 5 0.3", 17],
    [".dc V1 0 5 0.1 V2 0 1 0.5", 153],
    [".dc V1 0 1 0.001", 1001],
  ])("%s → %i", (line, n) => {
    expect(nominalPoints(analysisCards(line)[0])).toBe(n);
  });

  it(".tran (adaptativo) e cartão ilegível: sem contagem", () => {
    expect(nominalPoints(analysisCards(".tran 1u 1m")[0])).toBeNull();
    expect(nominalPoints(analysisCards(".ac dec {n} 1 1k")[0])).toBeNull();
  });

  it("casa o k-ésimo plot de um nome com o k-ésimo cartão do tipo (.noise dá dois plots)", () => {
    const cards = analysisCards(".noise v(b) V1 dec 10 1 1k\n.ac dec 10 1 1k\n.ac lin 7 1 2");
    const plots = [
      { plotname: "Noise Spectral Density Curves" },
      { plotname: "Integrated Noise" },
      { plotname: "AC Analysis" },
      { plotname: "AC Analysis" },
    ];
    expect(plots.map((p) => deckPointsOf(plots, p, cards))).toEqual([null, null, 31, 7]);
  });
});
