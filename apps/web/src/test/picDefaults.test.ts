import { applyDefaults, readDefaults } from "@/lib/picDefaults";

const SRC = '.PS\nbox "a"\narrow\ncircle\n.PE';

describe("applyDefaults / readDefaults", () => {
  it("insere só os valores diferentes do default, logo após .PS", () => {
    const out = applyDefaults(SRC, { boxwid: 1.2, linethick: 2, boxht: 0.5 /* = default */ });
    const lines = out.split("\n");
    expect(lines[0]).toBe(".PS");
    expect(out).toContain("boxwid = 1.2");
    expect(out).toContain("linethick = 2");
    expect(out).not.toContain("boxht"); // igual ao default → não escreve
    // o código original é preservado
    expect(out).toContain('box "a"');
    expect(out).toContain(".PE");
  });

  it("é idempotente: reaplicar reescreve o mesmo bloco, sem empilhar", () => {
    const once = applyDefaults(SRC, { boxwid: 1.2 });
    const twice = applyDefaults(once, { boxwid: 1.5 });
    expect((twice.match(/padrões \(rpic studio\)/g) ?? []).length).toBe(1);
    expect(twice).toContain("boxwid = 1.5");
    expect(twice).not.toContain("boxwid = 1.2");
  });

  it("lê de volta os valores do bloco gerenciado", () => {
    const out = applyDefaults(SRC, { scale: 2, fillval: 0.2 });
    expect(readDefaults(out)).toEqual({ scale: 2, fillval: 0.2 });
  });

  it("remove o bloco quando tudo volta ao default", () => {
    const withBlock = applyDefaults(SRC, { boxwid: 1.2 });
    const cleared = applyDefaults(withBlock, {});
    expect(cleared).not.toContain("padrões");
    expect(cleared).toContain('box "a"');
  });

  it("sem .PS, insere no topo", () => {
    const out = applyDefaults('box "x"', { boxwid: 1 });
    expect(out.startsWith("# ── padrões")).toBe(true);
  });
});
