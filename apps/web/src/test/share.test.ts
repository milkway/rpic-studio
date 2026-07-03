import { decodeShareHash, encodeShareHash } from "@/lib/share";

describe("share por URL (lz-string no fragment)", () => {
  it("faz roundtrip do código", () => {
    const source = '.PS\nbox "olá"\narrow\ncircle "fim"\n.PE';
    const hash = encodeShareHash({ source, circuits: false });
    expect(hash.startsWith("#pic=")).toBe(true);
    expect(decodeShareHash(hash)).toEqual({ source, circuits: false });
  });

  it("preserva UTF-8 (acentos, math e emoji)", () => {
    const source = '.PS\nbox "situação média" "custo ≥ R$ 10"\ncircle "π ≈ 3,14 🎯"\n.PE';
    const decoded = decodeShareHash(encodeShareHash({ source, circuits: false }));
    expect(decoded?.source).toBe(source);
  });

  it("carrega a flag de circuitos", () => {
    const hash = encodeShareHash({ source: "resistor(A,B)", circuits: true });
    expect(hash).toContain("&circuits=1");
    expect(decodeShareHash(hash)?.circuits).toBe(true);
  });

  it("roundtrip de diagrama grande (payload pode conter '+')", () => {
    const source = ".PS\n" + 'box "x" ; arrow ; box "y"\n'.repeat(50) + ".PE";
    const hash = encodeShareHash({ source, circuits: true });
    const payload = hash.slice("#pic=".length).split("&")[0];
    // o alfabeto URI-safe do lz-string não usa /, = nem & (mas usa + e -)
    expect(payload).not.toMatch(/[/=&]/);
    expect(decodeShareHash(hash)).toEqual({ source, circuits: true });
  });

  it("retorna null para hash vazio, alheio ou vazio de payload", () => {
    expect(decodeShareHash("")).toBeNull();
    expect(decodeShareHash("#outra=coisa")).toBeNull();
    expect(decodeShareHash("#pic=")).toBeNull();
  });
});
