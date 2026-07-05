import {
  graphToPic,
  readGraph,
  hasVisualGraph,
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
    node({ id: "a", shape: "box", label: "Start", x: 0, y: 0 }),
    node({ id: "b", shape: "diamond", label: "ok?", x: 200, y: 0, fill: "lightyellow", stroke: "gray" }),
    node({ id: "c", shape: "circle", label: "End", x: 400, y: 0 }),
    node({ id: "d", shape: "ellipse", label: 'diz "oi"', x: 200, y: 150 }),
  ],
  edges: [
    { id: "e1", from: "a", to: "b", arrow: true },
    { id: "e2", from: "b", to: "c", label: "sim", arrow: true },
    { id: "e3", from: "b", to: "d", label: "não", arrow: true },
  ],
};

describe("graphToPic", () => {
  const pic = graphToPic(graph);

  it("envolve em .PS/.PE e nomeia nós N1..Nn", () => {
    expect(pic).toContain(".PS");
    expect(pic).toContain(".PE");
    expect(pic).toContain("N1: box");
    expect(pic).toContain("N3: circle");
  });

  it("box usa wid/ht/at; circle usa diam", () => {
    expect(pic).toMatch(/N1: box "Start" wid 0\.75 ht 0\.5 at \(0,0\)/);
    expect(pic).toMatch(/N3: circle "End" diam 0\.5 at \(/);
  });

  it("diamond é polígono fechado com fill/stroke", () => {
    expect(pic).toMatch(/N2: line from .* close shaded "lightyellow" outlined "gray" "ok\?"/);
  });

  it("aresta vira arrow entre compass points, com label no meio", () => {
    expect(pic).toContain("arrow from N1.e to N2.w");
    expect(pic).toMatch(/arrow from N2\.e to N3\.w/);
    expect(pic).toMatch(/"sim" at \([-\d.]+,[-\d.]+\) above/);
  });

  it("inverte y (tela p/ baixo → pic p/ cima)", () => {
    // nó d está ABAIXO na tela (y=150) → y pic negativo
    expect(pic).toMatch(/N4: ellipse .* at \(2\.083,-1\.563\)/);
  });

  it("escapa aspas no label", () => {
    expect(pic).toContain('ellipse "diz \\"oi\\""');
  });
});

describe("readGraph / hasVisualGraph", () => {
  it("round-trip: readGraph(graphToPic(g)) === g", () => {
    const pic = graphToPic(graph);
    expect(hasVisualGraph(pic)).toBe(true);
    expect(readGraph(pic)).toEqual(graph);
  });

  it("source sem grafo → null / false", () => {
    expect(hasVisualGraph('box "a"; arrow; box "b"')).toBe(false);
    expect(readGraph('box "a"')).toBeNull();
  });

  it("grafo corrompido → null (não lança)", () => {
    expect(readGraph("# rpic-studio:visual:v1 @@lixo@@\n.PS\n.PE")).toBeNull();
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
    expect(pickSides(at(0, 300), at(20, 0))).toEqual(["n", "s"]);
  });
});

it("PX_PER_INCH é 96", () => {
  expect(PX_PER_INCH).toBe(96);
});
