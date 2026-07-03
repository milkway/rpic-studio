// Snippets prontos dos bindings oficiais do rpic (Python: rpiclang no PyPI;
// R: milkway/rpic-r) com o código do diagrama atual embutido — paridade com
// as abas RMarkdown/Quarto do pikup, mas para o ecossistema rpic.
import type { Locale } from "./i18n";

const COMMENTS = {
  en: {
    pyInstall: "pip install rpiclang  (imports as `rpic`)",
    pyPng: "PNG (2x) and PDF, if you need them:",
    rInstall: 'remotes::install_github("milkway/rpic-r")',
    rPng: "PNG (2x) and PDF, if you need them:",
  },
  pt: {
    pyInstall: "pip install rpiclang  (importa como `rpic`)",
    pyPng: "PNG (2x) e PDF, se precisar:",
    rInstall: 'remotes::install_github("milkway/rpic-r")',
    rPng: "PNG (2x) e PDF, se precisar:",
  },
};

export function toPythonSnippet(source: string, circuits: boolean, locale: Locale): string {
  const c = COMMENTS[locale];
  const opts = circuits ? ", circuits=True" : "";
  return [
    `# ${c.pyInstall}`,
    "import rpic",
    "",
    'src = """',
    source.trim(),
    '"""',
    "",
    `svg = rpic.render_svg(src${opts})`,
    'open("diagram.svg", "w").write(svg)',
    "",
    `# ${c.pyPng}`,
    `open("diagram.png", "wb").write(rpic.render_png(src, scale=2.0${opts}))`,
    `open("diagram.pdf", "wb").write(rpic.render_pdf(src${opts}))`,
    "",
  ].join("\n");
}

export function toRSnippet(source: string, circuits: boolean, locale: Locale): string {
  const c = COMMENTS[locale];
  const opts = circuits ? ", circuits = TRUE" : "";
  return [
    `# ${c.rInstall}`,
    "library(rpic)",
    "",
    'src <- r"(',
    source.trim(),
    ')"',
    "",
    `svg <- rpic_svg(src${opts})`,
    'writeLines(svg, "diagram.svg")',
    "",
    `# ${c.rPng}`,
    `rpic_png(src, "diagram.png", scale = 2${opts})`,
    `rpic_pdf(src, "diagram.pdf"${opts})`,
    "",
  ].join("\n");
}
