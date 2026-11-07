import {
  formatSpice,
  KEY_STEP,
  parseSpiceNumber,
  POS_CENTER,
  POS_MAX,
  posOf,
  relabel,
  unitOf,
  valueAt,
  withAlter,
} from "@/lib/simValues";

describe("números SPICE", () => {
  it("lê sufixos do SPICE3 (M = mili, meg = mega) e ignora a unidade", () => {
    expect(parseSpiceNumber("4.7k")).toBe(4700);
    expect(parseSpiceNumber("10u")).toBeCloseTo(1e-5);
    expect(parseSpiceNumber("10µ")).toBeCloseTo(1e-5);
    expect(parseSpiceNumber("1meg")).toBe(1e6);
    expect(parseSpiceNumber("1M")).toBe(1e-3);
    expect(parseSpiceNumber("2.2e3")).toBe(2200);
    expect(parseSpiceNumber("1kohm")).toBe(1000);
    expect(parseSpiceNumber("5V")).toBe(5);
    expect(parseSpiceNumber("−3")).toBe(-3);
    expect(parseSpiceNumber("abc")).toBeNull();
    expect(parseSpiceNumber("")).toBeNull();
  });

  it("escreve com 3 algarismos e sufixo SPICE (ida e volta)", () => {
    expect(formatSpice(2200)).toBe("2.2k");
    expect(formatSpice(4.7e-7)).toBe("470n");
    expect(formatSpice(1e6)).toBe("1meg");
    expect(formatSpice(0.5)).toBe("500m");
    expect(formatSpice(-10)).toBe("-10");
    for (const v of [1, 1e3, 3.3e-6, 4.7e5, 12e9])
      expect(parseSpiceNumber(formatSpice(v))).toBeCloseTo(v, 12);
  });
});

describe("escala log do slider", () => {
  it("centro = original; pontas = ÷100 e ×100; ida e volta", () => {
    expect(valueAt(POS_CENTER, 1000)).toBe(1000);
    expect(valueAt(0, 1000)).toBe(10);
    expect(valueAt(POS_MAX, 1000)).toBe(1e5);
    expect(posOf(1000, 1000)).toBe(POS_CENTER);
    expect(posOf(1e9, 1000)).toBe(POS_MAX); // fora da faixa: gruda
    expect(posOf(-1, 1000)).toBe(0);
    // uma seta = 1/12 de década (≈ E12)
    expect(valueAt(POS_CENTER + KEY_STEP, 1000)).toBe(1210);
    // valor negativo: a magnitude anda em log, o sinal fica
    expect(valueAt(POS_MAX, -5)).toBe(-500);
  });

  it("unidade pelo tipo do elemento", () => {
    expect(unitOf("R1")).toBe("Ω");
    expect(unitOf("c2")).toBe("F");
    expect(unitOf("L1")).toBe("H");
    expect(unitOf("V1")).toBe("V");
    expect(unitOf("I3")).toBe("A");
    expect(unitOf("E1")).toBe("");
  });

  it("withAlter: voltar ao original remove a entrada", () => {
    const c = { refdes: "R1", param: "resistance", value: 1000, unit: "Ω" };
    expect(withAlter({}, c, 2000)).toEqual({ R1: 2000 });
    expect(withAlter({ R1: 2000, C1: 1 }, c, 1000)).toEqual({ C1: 1 });
    expect(withAlter({ R1: 2000 }, c, null)).toEqual({});
  });

  it("relabel troca o token que vale o original", () => {
    expect(relabel("1k", 1000, 2200)).toBe("2.2k");
    expect(relabel("DC 10 AC 1", 10, 22)).toBe("DC 22 AC 1");
    expect(relabel("PULSE(0 5 0 1u)", 3, 4)).toBeNull();
  });
});
