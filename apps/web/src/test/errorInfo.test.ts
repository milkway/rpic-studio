import { explainError, suggestWord } from "@/lib/errorInfo";

describe("suggestWord (você quis dizer…?)", () => {
  it("sugere primitivas para typos próximos", () => {
    expect(suggestWord("bxo", "")).toBe("box");
    expect(suggestWord("circel", "")).toBe("circle");
    expect(suggestWord("arow", "")).toBe("arrow");
  });

  it("sugere macros de circuito", () => {
    expect(suggestWord("reistor", "")).toBe("resistor");
    expect(suggestWord("bateri", "")).toBe("battery");
  });

  it("sugere macros definidas pelo usuário no próprio código", () => {
    expect(suggestWord("nodee", "define node { circle $1 }")).toBe("node");
  });

  it("não sugere nada distante demais", () => {
    expect(suggestWord("xyzzy", "")).toBeNull();
  });
});

describe("explainError", () => {
  it("comando desconhecido: posição, extensão do token e sugestão", () => {
    const info = explainError('1:1: expected an object, found Name("bxo")', 'bxo "a"', "pt");
    expect(info.line).toBe(1);
    expect(info.col).toBe(1);
    expect(info.tokenLength).toBe(3);
    expect(info.friendly).toContain("“bxo” não é um comando");
    expect(info.suggestion).toContain("“box”");
  });

  it("traduz tokens internos do parser", () => {
    const info = explainError("1:13: expected Rparen, found Newline", "box wid (2*3", "pt");
    expect(info.friendly).toContain("“)” de fechamento");
    expect(info.friendly).toContain("fim da linha");
    expect(info.friendly).not.toContain("Rparen");
  });

  it("rótulo desconhecido: localiza a ocorrência no código (compilador não dá posição)", () => {
    const info = explainError("unknown label `Alvo`", "box\nline from Alvo.e right", "pt");
    expect(info.line).toBe(2);
    expect(info.col).toBe(11);
    expect(info.tokenLength).toBe(4);
    expect(info.friendly).toContain("“Alvo” não existe");
  });

  it("ordinal fora do alcance: aponta a referência ordinal", () => {
    const info = explainError("ordinal out of range", 'box "a"\nanimate 3rd box with "pop"', "pt");
    expect(info.line).toBe(2);
    expect(info.friendly).toContain("ordinal");
  });

  it("string sem fechar e bloco sem fechar têm mensagens específicas", () => {
    expect(explainError("2:1: unterminated string literal", 'box "x', "pt").friendly).toContain(
      "aspa",
    );
    expect(
      explainError("1:1: define: unterminated `{` body", "define n { box", "pt").friendly,
    ).toContain("não foi fechado");
  });

  it("mensagens em inglês quando locale = en", () => {
    const info = explainError('1:1: expected an object, found Name("bxo")', "", "en");
    expect(info.friendly).toContain("is not an rpic command");
    expect(info.suggestion).toContain("Did you mean");
  });

  it("formato desconhecido cai no texto original sem posição duplicada", () => {
    const info = explainError("3:7: something new", "", "pt");
    expect(info.line).toBe(3);
    expect(info.friendly).toBe("something new");
  });
});
