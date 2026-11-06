import { detectCircuits, detectSpice, detectTexLabels } from "@/lib/detect";

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
