// CSS custom por diagrama, para o keyword `class` do rpic virar estilo real.
// Filosofia do studio: o CÓDIGO é a fonte da verdade → o CSS mora NO PRÓPRIO pic,
// como um bloco de comentário (linhas `#`, ignoradas pelo compilador) delimitado
// por marcadores idempotentes (igual ao bloco de Defaults). Assim viaja de graça
// em save/share/reload (tudo carrega só o `source`). O studio lê esse bloco e
// injeta um `<style>` no SVG (preview + exports .svg/clipboard/png-cliente).

const BEGIN = "# ── css (rpic studio) ──";
const END = "# ───────────────────────";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BLOCK_RE = new RegExp(`${escapeRe(BEGIN)}\\n([\\s\\S]*?)\\n${escapeRe(END)}`);
const REMOVE_RE = new RegExp(`\\n*${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}\\n?`, "g");

/** Lê o CSS custom guardado no bloco (sem os prefixos `# ` de comentário). */
export function readCss(source: string): string {
  const m = BLOCK_RE.exec(source);
  if (!m) return "";
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^#\s?/, ""))
    .join("\n");
}

/** Grava (ou remove, se vazio) o bloco de CSS no fim do `source`, idempotente. */
export function applyCss(source: string, css: string): string {
  const cleaned = source.replace(REMOVE_RE, "").replace(/\s+$/, "");
  if (!css.trim()) return cleaned ? `${cleaned}\n` : "";
  // conteúdo CRU (não trimado) p/ o textarea controlado round-trippar 1:1.
  const body = css
    .split("\n")
    .map((l) => `# ${l}`)
    .join("\n");
  return `${cleaned}\n\n${BEGIN}\n${body}\n${END}\n`;
}

/** Injeta o CSS como `<style>` logo após a tag `<svg …>` (scoped ao SVG, viaja
 *  nos exports). No-op quando não há CSS.
 *  SEGURANÇA: o CSS pode ser NÃO confiável (diagrama vindo de link `#pic=`) e o
 *  SVG assado é usado CRU nos exports/clipboard (sem passar pelo DOMPurify do
 *  preview). Um `</style>` no CSS fecharia o elemento e injetaria HTML (XSS).
 *  Neutralizamos a tag de fechamento e os delimitadores de comentário HTML — o
 *  CSS legítimo nunca precisa deles (o parser CSS ignora CDO/CDC de qualquer
 *  forma; `\/` é um escape válido). É o ÚNICO ponto que constrói o `<style>`. */
export function injectCss(svg: string, css: string): string {
  const c = css.trim();
  if (!c || !svg) return svg;
  const safe = c
    .replace(/<\/(style)/gi, "<\\/$1")
    .replace(/<!--/g, "")
    .replace(/-->/g, "");
  return svg.replace(/(<svg\b[^>]*>)/, `$1<style>${safe}</style>`);
}
