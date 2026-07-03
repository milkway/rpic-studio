import { tokenizeLine } from "@/components/editor/rpicLanguage";

function styleOf(line: string, text: string): string | null | undefined {
  return tokenizeLine(line).find((t) => t.text === text)?.style;
}

describe("gramática rpic (porte do tmLanguage)", () => {
  it("comentários", () => {
    expect(styleOf("box # até o fim", "# até o fim")).toBe("comment");
  });

  it("strings (inclusive com aspas escapadas)", () => {
    expect(styleOf('box "olá mundo"', '"olá mundo"')).toBe("string");
    expect(styleOf('box "diz \\"oi\\""', '"diz \\"oi\\""')).toBe("string");
  });

  it("diretivas .PS/.PE", () => {
    expect(styleOf(".PS", ".PS")).toBe("directive");
    expect(styleOf(".PE", ".PE")).toBe("directive");
  });

  it("rótulos (maiúscula seguida de dois-pontos)", () => {
    expect(styleOf("Sum: box", "Sum")).toBe("labelName");
    // maiúscula sem dois-pontos não é rótulo
    expect(styleOf("Sum box", "Sum")).not.toBe("labelName");
  });

  it("ordinais", () => {
    expect(styleOf("animate 1st box", "1st")).toBe("ordinal");
    expect(styleOf("2nd last circle", "2nd last")).toBe("ordinal");
    expect(styleOf("last box", "last")).toBe("ordinal");
  });

  it("controle, primitivas, atributos e envvars", () => {
    expect(styleOf("define node { }", "define")).toBe("controlKeyword");
    expect(styleOf("animate 1st box", "animate")).toBe("controlKeyword");
    expect(styleOf("box dashed", "box")).toBe("primitive");
    expect(styleOf("box dashed", "dashed")).toBe("attribute");
    expect(styleOf("boxwid = 0.7", "boxwid")).toBe("envvar");
  });

  it("extensões rpic têm escopo próprio", () => {
    expect(styleOf("box hatch", "hatch")).toBe("extension");
    expect(styleOf("margin = 0.1", "margin")).toBe("extension");
  });

  it("cantos, números, setas e macros", () => {
    expect(styleOf("line from A.ne to B.sw", ".ne")).toBe("corner");
    expect(styleOf("wid 0.75", "0.75")).toBe("number");
    expect(styleOf("line <-> from A to B", "<->")).toBe("arrowop");
    expect(styleOf("resistor(A,B)", "resistor")).toBe("macroName");
    expect(styleOf("x = sprintf(\"%g\", i)", "sprintf")).toBe("builtinFunction");
  });
});
