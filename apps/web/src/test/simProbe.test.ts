import { netTraceName, probeSlots, toggleProbe } from "@/lib/simFigure";

const names = ["v(vin)", "i(v1)", "v(vout)"];

describe("probe por clique (rede ↔ traço)", () => {
  it("netTraceName casa sem caixa; terra e rede ausente → null", () => {
    expect(netTraceName(names, "Vout")).toBe("v(vout)");
    expect(netTraceName(names, "0")).toBeNull();
    expect(netTraceName(names, "nope")).toBeNull();
  });

  it("padrão = os max primeiros, slot = posição", () => {
    expect([...probeSlots(null, names, 2)]).toEqual([
      ["v(vin)", 0],
      ["i(v1)", 1],
    ]);
  });

  it("religar volta à cor natural; ocupada → o MENOR slot livre, sem mexer nos outros", () => {
    let r = toggleProbe(null, names, "v(vin)", 8);
    expect([...r.probes]).toEqual([
      ["i(v1)", 1],
      ["v(vout)", 2],
    ]);
    r = toggleProbe(r.probes, names, "V(VIN)", 8);
    expect(r.probes.get("v(vin)")).toBe(0);
    expect(r.probes.get("v(vout)")).toBe(2);
    // v(vout) fora do padrão (max=2): natural 2 ≥ max → menor livre
    const few = toggleProbe(probeSlots(null, names, 2), names, "i(v1)", 2).probes;
    expect(toggleProbe(few, names, "v(vout)", 2).probes.get("v(vout)")).toBe(1);
  });

  it("slot natural ocupado (por quem religou antes) → menor livre", () => {
    let r = toggleProbe(null, names, "v(vin)", 8); // libera 0
    r = toggleProbe(r.probes, names, "v(vout)", 8); // desliga 2
    r = toggleProbe(r.probes, names, "v(vout)", 8); // religa → natural 2
    expect(r.probes.get("v(vout)")).toBe(2);
  });

  it("cheio → full, sem mudar nada", () => {
    const r = toggleProbe(null, names, "v(vout)", 2);
    expect(r.full).toBe(true);
    expect(r.probes.has("v(vout)")).toBe(false);
  });
});
