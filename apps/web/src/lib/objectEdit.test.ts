import { describe, expect, it } from "vitest";
import { readObjectAttrs, setObjectAttr } from "./objectEdit";

describe("setObjectAttr", () => {
  it("anexa fill (shaded) a uma statement sem estilo", () => {
    expect(setObjectAttr('box "A"', 1, 1, "fill", "red")).toBe('box "A" shaded "red"');
  });

  it("substitui um fill existente em vez de duplicar", () => {
    expect(setObjectAttr('box "A" shaded "red"', 1, 1, "fill", "blue")).toBe('box "A" shaded "blue"');
  });

  it("remove o fill com valor vazio", () => {
    expect(setObjectAttr('box "A" shaded "red"', 1, 1, "fill", undefined)).toBe('box "A"');
  });

  it("aceita cor hex", () => {
    expect(setObjectAttr("circle", 1, 1, "fill", "#1b5e20")).toBe('circle shaded "#1b5e20"');
  });

  it("hatch/dash/thick anexam e substituem", () => {
    let s = setObjectAttr("box", 1, 1, "hatch", "crosshatch");
    expect(s).toBe("box crosshatch");
    s = setObjectAttr(s, 1, 1, "hatch", "hatch");
    expect(s).toBe("box hatch");
    s = setObjectAttr(s, 1, 1, "dash", "dashed");
    expect(s).toBe("box hatch dashed");
    s = setObjectAttr(s, 1, 1, "thick", 1.5);
    expect(s).toBe("box hatch dashed thick 1.5");
    s = setObjectAttr(s, 1, 1, "thick", undefined);
    expect(s).toBe("box hatch dashed");
  });

  it("hatch NÃO confunde com hatchangle", () => {
    // hatchangle não deve ser removido pelo regex de hatch (fronteira de palavra)
    const s = setObjectAttr("box hatch hatchangle 30", 1, 1, "hatch", undefined);
    expect(s).toBe("box hatchangle 30");
  });

  it("hatchWid anexa/substitui/remove e absorve a forma longa `hatchwidth`", () => {
    let s = setObjectAttr("box hatch", 1, 1, "hatchWid", 1.5);
    expect(s).toBe("box hatch hatchwid 1.5");
    s = setObjectAttr(s, 1, 1, "hatchWid", 0.4);
    expect(s).toBe("box hatch hatchwid 0.4");
    s = setObjectAttr(s, 1, 1, "hatchWid", undefined);
    expect(s).toBe("box hatch");
    // a forma longa `hatchwidth` também é reconhecida e não duplica ao reescrever
    s = setObjectAttr("box hatch hatchwidth 2", 1, 1, "hatchWid", 1);
    expect(s).toBe("box hatch hatchwid 1");
    // e é lida de volta (round-trip p/ o inspetor)
    expect(readObjectAttrs("box hatch hatchwid 1.2", 1, 1).hatchWid).toBe(1.2);
    expect(readObjectAttrs("box hatch hatchwidth 2", 1, 1).hatchWid).toBe(2);
  });

  it("gradiente: par de cores + ângulo, substitui e remove", () => {
    let s = setObjectAttr("box", 1, 1, "gradient", `"steelblue" "white"`);
    expect(s).toBe('box gradient "steelblue" "white"');
    s = setObjectAttr(s, 1, 1, "gradientAngle", 90);
    expect(s).toBe('box gradient "steelblue" "white" gradientangle 90');
    // troca a cor final: como todo atributo, é removido e RE-ANEXADO ao fim
    // (a ordem não importa ao rpic — `gradientangle` antes de `gradient` compila).
    s = setObjectAttr(s, 1, 1, "gradient", `"steelblue" "gold"`);
    expect(s).toBe('box gradientangle 90 gradient "steelblue" "gold"');
    // remover o gradiente NÃO remove o gradientangle (são atributos distintos)
    s = setObjectAttr(s, 1, 1, "gradient", undefined);
    expect(s).toBe("box gradientangle 90");
    s = setObjectAttr(s, 1, 1, "gradientAngle", undefined);
    expect(s).toBe("box");
  });

  it("gradiente: leitura de volta (from/to/angle) p/ o inspetor", () => {
    const a = readObjectAttrs('box gradient "steelblue" "white" gradientangle 45', 1, 1);
    expect(a.gradientFrom).toBe("steelblue");
    expect(a.gradientTo).toBe("white");
    expect(a.gradientAngle).toBe(45);
    // `gradient` não deve confundir a leitura com `gradientangle` sozinho
    const b = readObjectAttrs("box gradientangle 30", 1, 1);
    expect(b.gradientFrom).toBeUndefined();
    expect(b.gradientAngle).toBe(30);
  });

  it("hachura órfã: readObjectAttrs infere `hatch` de parâmetros SEM a keyword", () => {
    // no rpic um parâmetro sozinho já cria hachura default → o inspetor precisa refletir
    expect(readObjectAttrs("box hatchsep 0.15", 1, 1).hatch).toBe("hatch");
    expect(readObjectAttrs('box hatchcolor "seagreen"', 1, 1).hatch).toBe("hatch");
    expect(readObjectAttrs("box hatchwid 4.25", 1, 1).hatch).toBe("hatch");
    expect(readObjectAttrs("box crosshatch hatchsep 0.15", 1, 1).hatch).toBe("crosshatch");
    expect(readObjectAttrs("box", 1, 1).hatch).toBeUndefined();
  });

  it("remoção COMPLETA de hachura: keyword + TODOS os parâmetros (senão órfão recria)", () => {
    let s = 'box crosshatch hatchsep 0.15 hatchcolor "seagreen" hatchwid 4.25 hatchangle 30';
    for (const k of ["hatch", "hatchAngle", "hatchSep", "hatchWid", "hatchColor"] as const) {
      s = setObjectAttr(s, 1, 1, k, undefined);
    }
    expect(s).toBe("box");
    expect(readObjectAttrs(s, 1, 1).hatch).toBeUndefined();
  });

  it("remoção COMPLETA de gradiente: par + gradientangle (senão o ângulo órfão faz degradê)", () => {
    let s = 'box gradient "steelblue" "white" gradientangle 90';
    for (const k of ["gradient", "gradientAngle"] as const) s = setObjectAttr(s, 1, 1, k, undefined);
    expect(s).toBe("box");
    expect(readObjectAttrs(s, 1, 1).gradientAngle).toBeUndefined();
  });

  it("edita a statement CERTA numa linha com várias (respeita o ;)", () => {
    const src = 'box "A"; circle "B"';
    // col 1 → a caixa (antes do ;)
    expect(setObjectAttr(src, 1, 1, "fill", "red")).toBe('box "A" shaded "red"; circle "B"');
    // col do "circle" (10, 1-based) → o círculo (fim da linha)
    const colCircle = src.indexOf("circle") + 1;
    expect(setObjectAttr(src, 1, colCircle, "fill", "red")).toBe('box "A"; circle "B" shaded "red"');
  });

  it("edita a linha correta num pic multilinha", () => {
    const src = 'box "A"\ncircle "B"\nellipse "C"';
    expect(setObjectAttr(src, 2, 1, "fill", "gray")).toBe('box "A"\ncircle "B" shaded "gray"\nellipse "C"');
  });

  it("escreve DENTRO do bloco de um define (antes do }) — não corrompe", () => {
    const src = "define node { circle rad 0.18 $1 }";
    // col 15 (1-based) = a palavra `circle` dentro do bloco
    expect(setObjectAttr(src, 1, 15, "hatch", "hatch")).toBe("define node { circle rad 0.18 $1 hatch}");
  });

  it("no corpo de um for, para no `;` (não vaza pra próxima statement)", () => {
    const src = "for i = 1 to 4 do { arrow wid 0.4; node(i) }";
    // col 21 (1-based) = `arrow`
    expect(setObjectAttr(src, 1, 21, "fill", "red")).toBe('for i = 1 to 4 do { arrow wid 0.4 shaded "red"; node(i) }');
  });

  it("não altera nada com linha inválida", () => {
    expect(setObjectAttr("box", 9, 1, "fill", "red")).toBe("box");
  });

  it("preserva rótulo com aspas ao anexar (não fecha string errada)", () => {
    expect(setObjectAttr('box "a; b"', 1, 1, "fill", "red")).toBe('box "a; b" shaded "red"');
  });

  it("thin (0.9.0): anexa, é lido de volta e é mutuamente exclusivo com thick", () => {
    const withThin = setObjectAttr("box", 1, 1, "thin", "thin");
    expect(withThin).toBe("box thin");
    expect(readObjectAttrs(withThin, 1, 1).thin).toBe(true);
    // thin → thick substitui (não deixa os dois competindo pela espessura)
    expect(setObjectAttr(withThin, 1, 1, "thick", 2)).toBe("box thick 2");
    // thick → thin idem
    expect(setObjectAttr("box thick 2", 1, 1, "thin", "thin")).toBe("box thin");
    // remover thin
    expect(setObjectAttr(withThin, 1, 1, "thin", undefined)).toBe("box");
  });
});

describe("cores em variáveis/expressões (0.9.0) — substituir, não duplicar", () => {
  it("outlined <variável>: trocar a cor SUBSTITUI (não anexa outro outlined)", () => {
    const src = 'A: box "accent" outlined accent';
    expect(setObjectAttr(src, 1, 1, "stroke", "darkorange")).toBe('A: box "accent" outlined "darkorange"');
  });

  it("repara statement já duplicada (outlined var + outlined string → um só)", () => {
    const src = 'B: box "mist" shaded mist outlined accent outlined "darkorange"';
    expect(setObjectAttr(src, 1, 1, "stroke", "crimson")).toBe('B: box "mist" shaded mist outlined "crimson"');
  });

  it("shaded <expr entre parênteses> e literal 0x… também substituem", () => {
    const src = 'C: circle "tint" rad 0.3 shaded (mist + 0x101010) outlined accent';
    expect(setObjectAttr(src, 1, 1, "fill", "lightblue")).toBe('C: circle "tint" rad 0.3 outlined accent shaded "lightblue"');
    expect(setObjectAttr("box shaded 0x1b5e20", 1, 1, "fill", "white")).toBe('box shaded "white"');
  });

  it("readObjectAttrs devolve o texto cru das formas sem aspas", () => {
    const attrs = readObjectAttrs('box shaded (mist + 0x101010) outlined accent hatchcolor 0x333333', 1, 1);
    expect(attrs.fill).toBe("(mist + 0x101010)");
    expect(attrs.stroke).toBe("accent");
    expect(attrs.hatchColor).toBe("0x333333");
  });

  it("gradient com cores bareword: lê o par e substitui sem sobra", () => {
    const src = "box gradient mist accent";
    expect(readObjectAttrs(src, 1, 1)).toMatchObject({ gradientFrom: "mist", gradientTo: "accent" });
    expect(setObjectAttr(src, 1, 1, "gradient", '"gold" "white"')).toBe('box gradient "gold" "white"');
    expect(setObjectAttr(src, 1, 1, "gradient", undefined)).toBe("box");
  });

  it("remover a cor em forma de variável limpa o token inteiro", () => {
    expect(setObjectAttr("box outlined accent", 1, 1, "stroke", undefined)).toBe("box");
  });
});

describe("link (0.11.0)", () => {
  it("anexa, substitui (último vence) e remove o hyperlink", () => {
    const withLink = setObjectAttr('box "docs"', 1, 1, "link", "https://rpic.dev");
    expect(withLink).toBe('box "docs" link "https://rpic.dev"');
    expect(readObjectAttrs(withLink, 1, 1).link).toBe("https://rpic.dev");
    expect(setObjectAttr(withLink, 1, 1, "link", "https://rpic.dev/docs")).toBe('box "docs" link "https://rpic.dev/docs"');
    expect(setObjectAttr(withLink, 1, 1, "link", undefined)).toBe('box "docs"');
  });
});
