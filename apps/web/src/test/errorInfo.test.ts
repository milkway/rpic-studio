import { explainDiagnostic, explainRawError, suggestWord } from "@/lib/errorInfo";
import type { Diagnostic } from "@strategicprojects/rpic";

function diag(partial: Partial<Diagnostic>): Diagnostic {
  return {
    message: "",
    file: null,
    line: 1,
    col: 1,
    end_col: null,
    kind: "parse",
    found: null,
    expected: null,
    hint: null,
    ...partial,
  };
}

describe("suggestWord (fallback local de sugestão)", () => {
  it("sugere primitivas para typos próximos (transposição = 1)", () => {
    expect(suggestWord("bxo", "")).toBe("box");
    expect(suggestWord("circel", "")).toBe("circle");
  });

  it("sugere macros de circuito fora de escopo do compilador", () => {
    expect(suggestWord("reistor", "")).toBe("resistor");
  });

  it("sugere macros definidas pelo usuário no próprio código", () => {
    expect(suggestWord("nodee", "define node { circle $1 }")).toBe("node");
  });

  it("não sugere nada distante demais", () => {
    expect(suggestWord("xyzzy", "")).toBeNull();
  });
});

describe("explainDiagnostic (estruturado, rpic-lang#178)", () => {
  it("comando desconhecido: span preciso e hint do compilador localizado", () => {
    const info = explainDiagnostic(
      diag({
        message: "expected an object, found `bxo`",
        line: 1,
        col: 1,
        end_col: 4,
        kind: "expected_token",
        found: "`bxo`",
        expected: "an object",
        hint: "did you mean `box`?",
      }),
      'bxo "a"',
      "pt",
    );
    expect(info.tokenLength).toBe(3);
    expect(info.friendly).toContain("“bxo” não é um comando");
    expect(info.suggestion).toBe("Você quis dizer “box”?");
  });

  it("sem hint do compilador, o fallback local sugere macro de circuito", () => {
    const info = explainDiagnostic(
      diag({
        message: "expected an object, found `reistor`",
        line: 2,
        col: 1,
        end_col: 8,
        kind: "expected_token",
        found: "`reistor`",
        expected: "an object",
      }),
      "reistor(A,B)",
      "pt",
    );
    expect(info.suggestion).toContain("“resistor”");
  });

  it("expected/found viram linguagem do usuário", () => {
    const info = explainDiagnostic(
      diag({
        message: "expected ), found end of line",
        col: 13,
        end_col: 14,
        kind: "expected_token",
        found: "end of line",
        expected: ")",
      }),
      "box wid (2*3",
      "pt",
    );
    expect(info.friendly).toBe("Esperava “)”, mas encontrou o fim da linha.");
  });

  it("rótulo desconhecido chega com posição do compilador", () => {
    const info = explainDiagnostic(
      diag({
        message: "unknown label `Alvo`",
        line: 2,
        col: 11,
        end_col: 15,
        kind: "unknown_label",
        found: "Alvo",
      }),
      "box\nline from Alvo.e right",
      "pt",
    );
    expect(info.line).toBe(2);
    expect(info.tokenLength).toBe(4);
    expect(info.friendly).toContain("“Alvo” não existe");
  });

  it("ordinal fora do alcance mostra o disponível", () => {
    const info = explainDiagnostic(
      diag({
        message: "ordinal 3 out of range (available 1)",
        line: 2,
        col: 9,
        end_col: 12,
        kind: "ordinal_out_of_range",
        found: "3",
        expected: "1..1",
      }),
      "",
      "pt",
    );
    expect(info.friendly).toContain("“3”");
    expect(info.friendly).toContain("1..1");
  });

  it("warnings: atributo ignorado com hint e efeito de animação desconhecido", () => {
    const attr = explainDiagnostic(
      diag({
        message: "ignored `dashd`…",
        col: 9,
        end_col: 14,
        kind: "ignored_attribute",
        found: "dashd",
        expected: "an attribute",
        hint: "did you mean `dashed`?",
      }),
      "",
      "pt",
      "warning",
    );
    expect(attr.severity).toBe("warning");
    expect(attr.friendly).toContain("“dashd” não é um atributo válido");
    expect(attr.suggestion).toBe("Você quis dizer “dashed”?");

    const effect = explainDiagnostic(
      diag({
        message: "unknown animation effect `zoom`…",
        kind: "unknown_animation_effect",
        found: "zoom",
        expected: "draw, fade, or pop",
      }),
      "",
      "en",
      "warning",
    );
    expect(effect.friendly).toContain("“zoom”");
    expect(effect.friendly).toContain("draw, fade, or pop");
  });

  it("string sem fechar aponta a aspa de abertura", () => {
    const info = explainDiagnostic(
      diag({ message: "unterminated string literal", col: 5, end_col: 6, kind: "unterminated_string" }),
      'box "x',
      "pt",
    );
    expect(info.col).toBe(5);
    expect(info.friendly).toContain("aspa");
  });

  it("mensagens em inglês quando locale = en", () => {
    const info = explainDiagnostic(
      diag({
        message: "expected an object, found `bxo`",
        end_col: 4,
        kind: "expected_token",
        found: "`bxo`",
        expected: "an object",
        hint: "did you mean `box`?",
      }),
      "",
      "en",
    );
    expect(info.friendly).toContain("is not an rpic command");
    expect(info.suggestion).toBe("Did you mean “box”?");
  });
});

describe("explainRawError (fallback sem diagnóstico estruturado)", () => {
  it("extrai posição do prefixo linha:coluna", () => {
    const info = explainRawError("3:7: something new", "pt");
    expect(info.line).toBe(3);
    expect(info.col).toBe(7);
    expect(info.friendly).toBe("something new");
  });
});
