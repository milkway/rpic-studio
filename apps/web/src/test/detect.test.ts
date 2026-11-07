import { detectCircuits, detectGeo, detectSpice, detectTexLabels } from "@/lib/detect";
import { examples } from "@/lib/examples";

describe("detectCircuits", () => {
  it("detecta chamadas a macros da biblioteca", () => {
    expect(detectCircuits("A:(0,0); B:(2,0)\nresistor(A,B)")).toBe(true);
    expect(detectCircuits("and_gate(G1)")).toBe(true);
    expect(detectCircuits("battery (SW, NW)")).toBe(true);
  });

  it("não dispara em código sem circuitos", () => {
    expect(detectCircuits('box "resistor"; arrow; circle "x"')).toBe(false);
    expect(detectCircuits("define node { circle rad .18 $1 }\nnode(\"A\")")).toBe(false);
  });

  it("ignora strings e comentários", () => {
    expect(detectCircuits('box "use resistor(A,B) aqui"')).toBe(false);
    expect(detectCircuits("box # resistor(A,B) só no comentário")).toBe(false);
  });

  it("nome de macro sem chamada não conta", () => {
    expect(detectCircuits("wire = 3\nbox wid wire")).toBe(false);
  });
});

describe("detectTexLabels", () => {
  it("detecta rótulo inteiramente delimitado por $…$", () => {
    expect(detectTexLabels('box "$x^2 + y^2$"')).toBe(true);
    expect(detectTexLabels('circle "$\\alpha$" rad 0.3')).toBe(true);
  });

  it("não dispara em cifrão avulso ou argumento de macro", () => {
    expect(detectTexLabels('box "custa $10"')).toBe(false);
    expect(detectTexLabels("define node { circle $1 }")).toBe(false);
    expect(detectTexLabels('box "a"')).toBe(false);
  });
});

describe("detectSpice", () => {
  it("detecta a marca spice = 1 (com/sem espaços, após ;)", () => {
    expect(detectSpice(".PS\nspice = 1\nR1: resistor(A,B,1k)\n.PE")).toBe(true);
    expect(detectSpice("spice=1")).toBe(true);
    expect(detectSpice("x = 2; spice = 1")).toBe(true);
    expect(detectSpice("  spice = 1 # marca")).toBe(true);
  });

  it("não dispara em comentário, string, outro valor ou outro nome", () => {
    expect(detectSpice("# spice = 1")).toBe(false);
    expect(detectSpice('box "spice = 1"')).toBe(false);
    expect(detectSpice("spice = 0")).toBe(false);
    expect(detectSpice("spice = 10")).toBe(false);
    expect(detectSpice("spice = 1.5")).toBe(false);
    expect(detectSpice("myspice = 1")).toBe(false);
  });
});

describe("detectGeo", () => {
  it("detecta a âncora geo_lon/geo_lat", () => {
    expect(detectGeo("geo_lon = -34.8711\ngeo_lat = -8.0631\ndot")).toBe(true);
    expect(detectGeo("  geo_lat=-8")).toBe(true);
    expect(detectGeo('box "a"; geo_lon = -34.9')).toBe(true);
  });

  it("detecta pontos de controle <Label>_lon/_lat", () => {
    expect(detectGeo("Recife: (0, 0)\nRecife_lon = -34.8711")).toBe(true);
    expect(detectGeo("A: (0,0)\nA_lat = -8.06")).toBe(true);
    expect(detectGeo("Site_2_lon = 1")).toBe(true);
  });

  it("detecta registro aberto por bloco: [, { e then", () => {
    expect(detectGeo("B: [geo_lon = -34.87; geo_lat = -8.06; box]")).toBe(true);
    expect(detectGeo("[ A_lat = -8.06 ]")).toBe(true);
    expect(detectGeo("if 1 then { geo_lon = -34.87 }")).toBe(true);
    expect(detectGeo("for i = 1 to 1 do {Recife_lon = -34.87}")).toBe(true);
    expect(detectGeo("if 1 then geo_lat = -8")).toBe(true);
    expect(detectGeo("if 1 then { x = geo_lon }")).toBe(false);
    expect(detectGeo("athen geo_lon = 1")).toBe(false);
  });

  it("todos os exemplos geo do rpic-lang disparam", () => {
    for (const ex of examples.filter((e) => e.tags.includes("maps"))) {
      expect(detectGeo(ex.source), ex.id).toBe(true);
    }
  });

  it("não dispara sem registro geográfico", () => {
    expect(detectGeo('box "a"; arrow; circle')).toBe(false);
    expect(detectGeo("geo_scale = 400")).toBe(false);
    expect(detectGeo("x = geo_lon")).toBe(false);
    expect(detectGeo("lon = 3\nlat = 4")).toBe(false);
    expect(detectGeo("a_lon = 3")).toBe(false); // rótulo pic começa com maiúscula
    expect(detectGeo("if geo_lon == 1 then { box }")).toBe(false);
  });

  it("ignora strings e comentários", () => {
    expect(detectGeo("# geo_lon = -34.87")).toBe(false);
    expect(detectGeo('box "Recife_lon = -34"')).toBe(false);
  });

  it("nenhum exemplo não-geo dispara", () => {
    for (const ex of examples.filter((e) => !e.tags.includes("maps"))) {
      expect(detectGeo(ex.source), ex.id).toBe(false);
    }
  });
});
