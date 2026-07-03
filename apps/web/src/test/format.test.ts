import { formatXml, toMarkdownSnippet } from "@/lib/exports";

describe("formatXml", () => {
  it("indenta tags aninhadas por profundidade", () => {
    const input = `<svg width="10"><g id="s0"><rect x="1"/><text>olá</text></g></svg>`;
    expect(formatXml(input)).toBe(
      [
        `<svg width="10">`,
        `  <g id="s0">`,
        `    <rect x="1"/>`,
        `    <text>olá</text>`,
        `  </g>`,
        `</svg>`,
      ].join("\n"),
    );
  });

  it("não aumenta profundidade em self-closing nem em abre-e-fecha na mesma linha", () => {
    const out = formatXml(`<svg><defs><stop offset="0"/></defs><line x1="0"/></svg>`);
    const lines = out.split("\n");
    expect(lines[3]).toBe(`  </defs>`);
    expect(lines[4]).toBe(`  <line x1="0"/>`);
  });
});

describe("toMarkdownSnippet", () => {
  it("gera documento com imagem embutida e bloco de código pic", () => {
    const md = toMarkdownSnippet(`<svg></svg>`, `box "a"`, {
      image: "img",
      sourceBlock: "src",
      title: "diagram",
    });
    expect(md).toContain("![diagram](data:image/svg+xml;base64,");
    expect(md).toContain("```pic");
    expect(md).toContain(`box "a"`);
    expect(md).toContain("<!-- img -->");
    expect(md).toContain("<!-- src -->");
  });
});
