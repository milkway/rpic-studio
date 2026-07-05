import {
  graphToPic,
  growPage,
  parsePic,
  pickSides,
  PX_PER_INCH,
  type VGraph,
  type VNode,
} from "@/lib/visualGraph";

function node(p: Partial<VNode> & Pick<VNode, "id" | "shape">): VNode {
  return { label: "", x: 0, y: 0, w: 72, h: 48, ...p };
}

const graph: VGraph = {
  nodes: [
    node({ id: "N1", shape: "box", label: "Start", x: 96, y: 96 }),
    node({ id: "N2", shape: "diamond", label: "ok?", x: 288, y: 96, w: 96, h: 72, fill: "lightyellow", stroke: "gray" }),
    node({ id: "N3", shape: "circle", label: "End", x: 480, y: 96, w: 60, h: 60 }),
    node({ id: "N4", shape: "ellipse", label: 'diz "oi"', x: 288, y: 240 }),
  ],
  edges: [
    { id: "e1", from: "N1", to: "N2", arrow: true, fromSide: "e", toSide: "w" },
    { id: "e2", from: "N2", to: "N3", label: "sim", arrow: true, fromSide: "e", toSide: "w" },
    { id: "e3", from: "N2", to: "N4", label: "não", arrow: true, fromSide: "s", toSide: "n" },
  ],
};

describe("graphToPic", () => {
  const pic = graphToPic(graph);

  it("envolve em .PS/.PE, SEM blob embutido", () => {
    expect(pic).toContain(".PS");
    expect(pic).toContain(".PE");
    expect(pic).not.toContain("rpic-studio:visual");
    expect(pic).not.toMatch(/^#/m);
  });

  it("box usa wid/ht/at; circle usa diam; nomes N1..Nn", () => {
    expect(pic).toMatch(/N1: box "Start" wid 0\.75 ht 0\.5 at \(1,-1\)/);
    expect(pic).toMatch(/N3: circle "End" diam 0\.625 at \(/);
  });

  it("diamond é polígono fechado com fill/stroke", () => {
    expect(pic).toMatch(/N2: line from .* close shaded "lightyellow" outlined "gray" "ok\?"/);
  });

  it("aresta usa os lados escolhidos, com label no meio", () => {
    expect(pic).toContain("arrow from N1.e to N2.w");
    expect(pic).toContain("arrow from N2.s to N4.n");
    expect(pic).toMatch(/"sim" at \([-\d.]+,[-\d.]+\) above/);
  });

  it("escapa aspas no label", () => {
    expect(pic).toContain('ellipse "diz \\"oi\\""');
  });
});

describe("parsePic (round-trip)", () => {
  it("reconstrói o grafo do pic gerado", () => {
    const back = parsePic(graphToPic(graph));
    expect(back).not.toBeNull();
    expect(back!.nodes.map((n) => [n.shape, n.label, n.x, n.y, n.w, n.h])).toEqual([
      ["box", "Start", 96, 96, 72, 48],
      ["diamond", "ok?", 288, 96, 96, 72],
      ["circle", "End", 480, 96, 60, 60],
      ["ellipse", 'diz "oi"', 288, 240, 72, 48],
    ]);
    expect(back!.nodes[1].fill).toBe("lightyellow");
    expect(back!.nodes[1].stroke).toBe("gray");
    expect(back!.edges.map((e) => [e.from, e.to, e.fromSide, e.toSide, e.label ?? null])).toEqual([
      ["N1", "N2", "e", "w", null],
      ["N2", "N3", "e", "w", "sim"],
      ["N2", "N4", "s", "n", "não"],
    ]);
  });

  it("estável: parse(gen(parse(gen))) não faz drift", () => {
    const once = parsePic(graphToPic(graph))!;
    const twice = parsePic(graphToPic(once))!;
    expect(twice.nodes).toEqual(once.nodes);
  });

  it("pic escrito à mão (sem o formato gerado) → null", () => {
    expect(parsePic('box "a"; arrow; box "b"')).toBeNull();
    expect(parsePic(".PS\nbox\ncircle\n.PE")).toBeNull();
  });
});

describe("conectores livres (VLine)", () => {
  it("linha livre ponto-a-ponto e seta ancorada→livre round-trippam", () => {
    const g: VGraph = {
      nodes: [node({ id: "N1", shape: "box", x: 96, y: 96 })],
      edges: [],
      lines: [
        { id: "L0", arrow: false, a: { x: 0, y: 0 }, b: { x: 192, y: 96 } },
        { id: "L1", arrow: true, a: { node: "N1", side: "e" }, b: { x: 300, y: 200 } },
      ],
    };
    const pic = graphToPic(g);
    expect(pic).toContain("line from (0,0) to (2,-1)");
    expect(pic).toMatch(/arrow from N1\.e to \(3\.125,-2\.083\)/);
    const back = parsePic(pic)!;
    expect(back.lines).toEqual(g.lines);
    // a linha livre NÃO vira aresta nó-a-nó
    expect(back.edges).toHaveLength(0);
  });
});

describe("estilos por objeto (Fase 2)", () => {
  it("nó com hatch/dashed/thick round-trippa e gera pic", () => {
    const g: VGraph = {
      nodes: [node({ id: "N1", shape: "box", x: 96, y: 96, fill: "lightblue", hatch: "crosshatch", dash: "dashed", thick: 1.5 })],
      edges: [],
    };
    const pic = graphToPic(g);
    expect(pic).toMatch(/box wid .* shaded "lightblue" crosshatch dashed thick 1\.5/);
    const n = parsePic(pic)!.nodes[0];
    expect(n.hatch).toBe("crosshatch");
    expect(n.dash).toBe("dashed");
    expect(n.thick).toBe(1.5);
  });

  it("conector: pontas (fim/início/ambas) e tracejado round-trippam", () => {
    const g: VGraph = {
      nodes: [],
      edges: [],
      lines: [
        { id: "L0", arrow: true, back: true, dash: "dotted", a: { x: 0, y: 0 }, b: { x: 96, y: 0 } },
        { id: "L1", arrow: false, back: true, a: { x: 0, y: 96 }, b: { x: 96, y: 96 } },
      ],
    };
    const pic = graphToPic(g);
    expect(pic).toContain("line <-> from (0,0) to (1,0) dotted");
    expect(pic).toContain("line <- from (0,-1) to (1,-1)");
    expect(parsePic(pic)!.lines).toEqual(g.lines);
  });
});

describe("página (fixa o viewBox)", () => {
  it("cresce envolvendo os nós + margem e nunca encolhe", () => {
    const p1 = growPage(graph.nodes)!;
    expect(p1.w).toBeGreaterThan(480); // envolve x∈[96..480] + margem
    // adicionar um nó bem à direita cresce a página; remover não encolhe
    const wider = growPage([...graph.nodes, node({ id: "X", shape: "box", x: 900, y: 96 })], p1)!;
    expect(wider.w).toBeGreaterThan(p1.w);
    const back = growPage(graph.nodes, wider)!;
    expect(back.w).toBe(wider.w); // não encolheu
  });

  it("a moldura PAGE round-trippa e NÃO vira nó", () => {
    const withPage: VGraph = { ...graph, page: growPage(graph.nodes) };
    const pic = graphToPic(withPage);
    expect(pic).toMatch(/PAGE: box wid [\d.]+ ht [\d.]+ at \([-\d.]+,[-\d.]+\) outlined "#ffffff"/);
    const back = parsePic(pic)!;
    expect(back.nodes.map((n) => n.id)).not.toContain("PAGE"); // não é objeto
    expect(back.page).toEqual(withPage.page);
  });
});

describe("pickSides", () => {
  const at = (x: number, y: number): VNode => node({ id: "n", shape: "box", x, y });
  it("horizontal domina → e/w", () => {
    expect(pickSides(at(0, 0), at(300, 20))).toEqual(["e", "w"]);
    expect(pickSides(at(300, 0), at(0, 20))).toEqual(["w", "e"]);
  });
  it("vertical domina → s/n (tela p/ baixo = sul)", () => {
    expect(pickSides(at(0, 0), at(20, 300))).toEqual(["s", "n"]);
  });
});

it("PX_PER_INCH é 96", () => {
  expect(PX_PER_INCH).toBe(96);
});
