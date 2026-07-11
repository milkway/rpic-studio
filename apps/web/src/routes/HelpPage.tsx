import { AppShell } from "@/components/app-shell/AppShell";
import { useI18n, type Locale } from "@/lib/i18n";

interface Localized {
  en: string;
  pt: string;
}

interface Section {
  title: Localized;
  intro: Localized;
  rows: [string, Localized][];
}

// Cheatsheet condensada da spec oficial (rpic.dev/docs/spec), nos dois idiomas.
const sections: Section[] = [
  {
    title: { en: "Primitives", pt: "Primitivas" },
    intro: {
      en: "Each primitive is dropped at the current position and moves the cursor in the current direction (right by default).",
      pt: "Cada primitiva é solta na posição corrente e move o cursor na direção corrente (right por padrão).",
    },
    rows: [
      ['box "text"', { en: "rectangle with centered label", pt: "retângulo com rótulo centrado" }],
      ['circle "a" rad 0.3', { en: "circle (rad/diam set the size)", pt: "círculo (rad/diam controlam o tamanho)" }],
      ['ellipse "doc"', { en: "ellipse", pt: "elipse" }],
      ["line; arrow", { en: "line; arrow (line -> is the same as arrow)", pt: "linha; seta (line -> é o mesmo que arrow)" }],
      ["arc cw from A to B", { en: "arc (cw/ccw for direction)", pt: "arco (cw/ccw para o sentido)" }],
      ["spline right 1 then down .5", { en: "smooth curve through points", pt: "curva suave por pontos" }],
      ["move right 0.4", { en: "moves the cursor without drawing", pt: "move o cursor sem desenhar" }],
      ['brace from A.nw to B.ne up "group"', { en: "annotation brace (extension)", pt: "chave de anotação (extensão)" }],
      ["dot at A.c", { en: "marker dot (extension)", pt: "ponto marcador (extensão)" }],
    ],
  },
  {
    title: { en: "Labels and references", pt: "Rótulos e referências" },
    intro: {
      en: "Labels start with an uppercase letter. Earlier objects can be referenced by order or label, with compass corners.",
      pt: "Rótulos começam com maiúscula. Objetos anteriores são referenciáveis por ordinal ou rótulo, com cantos de bússola.",
    },
    rows: [
      ['A: box "start"', { en: "names the object", pt: "nomeia o objeto" }],
      ["last box; 2nd circle; 3rd last line", { en: "reference by order", pt: "referência por ordem" }],
      ["A.n A.ne A.e … A.c A.start A.end", { en: "corners and anchors", pt: "cantos e âncoras" }],
      ["line from A.e to B.w", { en: "connects anchors", pt: "conecta âncoras" }],
      ["box with .sw at A.ne", { en: "places by a corner", pt: "posiciona pelo canto" }],
      ["0.5 between A and B", { en: "midpoint between places", pt: "ponto intermediário" }],
      ["A.e + (0.3, 0.1)", { en: "offset in inches", pt: "deslocamento em polegadas" }],
    ],
  },
  {
    title: { en: "Style attributes", pt: "Atributos de estilo" },
    intro: {
      en: "Combinable on any primitive, in any order.",
      pt: "Combináveis em qualquer primitiva, na ordem que preferir.",
    },
    rows: [
      ["dashed / dotted / invis / thick / thin", { en: "stroke style", pt: "traço" }],
      ["fill 0.2", { en: "grayscale fill (0–1)", pt: "preenchimento em cinza (0–1)" }],
      ['colored "red" / outlined "blue" / shaded "gray"', { en: "colors", pt: "cores" }],
      ["accent = 0x1b5e20; box shaded accent", { en: "colour variables — and (expr) computes a tint", pt: "cores em variáveis — e (expr) calcula um tom" }],
      ["wid 1.2 ht 0.6 / same", { en: "dimensions (same repeats the last ones)", pt: "dimensões (same repete as últimas)" }],
      ["hatch / crosshatch hatchangle 30", { en: "hatching (extension)", pt: "hachuras (extensão)" }],
      ['gradient / opacity 0.5 / class "my-css"', { en: "visual extensions", pt: "extensões visuais" }],
      ['box "docs" link "https://rpic.dev"', { en: "clickable hyperlink in the SVG (also: link A \"url\")", pt: "hyperlink clicável no SVG (também: link A \"url\")" }],
      ['"text" above / below / ljust / rjust', { en: "text placement", pt: "posição do texto" }],
    ],
  },
  {
    title: { en: "Variables and control flow", pt: "Variáveis e controle" },
    intro: {
      en: "pic is a real language: variables, expressions, macros and loops.",
      pt: "pic é uma linguagem de verdade: variáveis, expressões, macros e laços.",
    },
    rows: [
      ["boxwid = 0.7; scale = 2.54", { en: "dimension defaults (cm with scale)", pt: "defaults de dimensão (cm com scale)" }],
      ["x = 3 * sin(0.5)", { en: "expressions and built-in functions", pt: "expressões e funções embutidas" }],
      ["define node { circle rad .18 $1 }", { en: "macro with arguments $1…$9", pt: "macro com argumentos $1…$9" }],
      ['node("A")', { en: "macro call", pt: "chamada de macro" }],
      ["for i = 1 to 4 do { arrow; box }", { en: "loop", pt: "laço" }],
      ["if x > 2 then { … } else { … }", { en: "conditional", pt: "condicional" }],
      ['print x; print sprintf("%g", i)', { en: "diagnostics in the panel", pt: "diagnóstico no painel" }],
      ["reset", { en: "restores the defaults", pt: "restaura os defaults" }],
    ],
  },
  {
    title: { en: "Animation (rpic extension)", pt: "Animação (extensão rpic)" },
    intro: {
      en: "animate builds a GSAP timeline played in the preview. Effects: draw, fade, pop, slide, move, highlight, morph, type, scramble, wiggle.",
      pt: "animate gera uma timeline GSAP tocada no preview. Efeitos: draw, fade, pop, slide, move, highlight, morph, type, scramble, wiggle.",
    },
    rows: [
      ['animate 1st box with "pop" for 0.4', { en: "effect with a duration", pt: "efeito com duração" }],
      ['animate 1st arrow with "draw" after 1st box', { en: "chains after another object", pt: "encadeia após outro objeto" }],
      ['animate 2nd box with "fade" at 1.2', { en: "starts at an absolute time", pt: "início em tempo absoluto" }],
      ['animate last circle with "pop" delay 0.3', { en: "extra delay", pt: "atraso extra" }],
      ['animate B with "slide" from left', { en: "slide in from a direction", pt: "entra deslizando de uma direção" }],
      ['animate D with "move" along L', { en: "travel along a line/arrow path", pt: "viaja pela linha/seta (caminho)" }],
      ['animate A with "morph" into B', { en: "morph one shape into another", pt: "transforma uma forma na outra" }],
      ['animate C with "highlight" to "crimson"', { en: "recolour + pulse an object", pt: "recolore + pulsa um objeto" }],
      ['… repeat -1 yoyo ease "sine.inOut"', { en: "loop, ping-pong, custom easing", pt: "laço, vai-e-volta, easing custom" }],
      ["animate [ … ] with \"pop\" stagger 0.1", { en: "fan an effect across a block", pt: "espalha um efeito pelo bloco" }],
      ['animate B with "fade" out', { en: "play the effect as an exit", pt: "toca o efeito como saída" }],
      ["animate scroll", { en: "scrub the timeline (slider in the preview; ScrollTrigger on your site)", pt: "arrastar a timeline (slider no preview; ScrollTrigger no seu site)" }],
      ['animate L with "draw" from 20% to 80%', { en: "trace only a window of the stroke", pt: "traça só um trecho do traço" }],
      ['animate T with "type" by word', { en: "typewriter label, by char or word", pt: "legenda datilografada, por letra ou palavra" }],
      ['animate T with "scramble" by "01"', { en: "decode-style reveal (custom charset)", pt: "revelação decodificada (charset custom)" }],
      ['animate B with "wiggle" wiggles 8', { en: "attention shake, n oscillations", pt: "balanço de atenção, n oscilações" }],
      ["draggable Chip inertia bounds Field", { en: "grabbable in the browser (momentum, confined)", pt: "agarrável no navegador (inércia, confinado)" }],
    ],
  },
  {
    title: { en: "Circuits (flip the switch in the editor)", pt: "Circuitos (ligue o interruptor no editor)" },
    intro: {
      en: "The native library ships ~80 electrical-element macros that connect named points — the Circuits menu in the editor inserts any of them.",
      pt: "A biblioteca nativa traz ~80 macros de elementos elétricos que conectam pontos nomeados — o menu Circuitos do editor insere qualquer uma delas.",
    },
    rows: [
      ["A:(0,0); B:(2,0)", { en: "declare nodes as positions", pt: "declare os nós como posições" }],
      ["resistor(A,B); capacitor(B,C)", { en: "two-terminal elements", pt: "elementos de dois terminais" }],
      ["battery(A,B); lamp(C,D); fuse(E,F)", { en: "source, lamp, fuse", pt: "fonte, lâmpada, fusível" }],
      ["and_gate(P); or_gate(Q); xor_gate(R)", { en: "logic gates", pt: "portas lógicas" }],
      ["ground(P); wire(A,B); dot at A", { en: "ground, wire, junction", pt: "terra, fio, junção" }],
      ['current(A,B); clabel((x,y),"9V")', { en: "current direction and labels", pt: "sentido de corrente e rótulos" }],
    ],
  },
];

const pageIntro: Record<Locale, { title: string; body: [string, string, string] }> = {
  en: {
    title: "The rpic language",
    body: [
      "rpic is Brian Kernighan's ",
      "pic",
      ' (1982), modernized: you describe the drawing in text — "a box, an arrow, a circle" — and the compiler takes care of the geometry. Full reference at ',
    ],
  },
  pt: {
    title: "A linguagem rpic",
    body: [
      "rpic é a linguagem ",
      "pic",
      ' de Brian Kernighan (1982), modernizada: você descreve o desenho em texto — "uma caixa, uma seta, um círculo" — e o compilador cuida da geometria. Referência completa em ',
    ],
  },
};

/** Referência rápida da linguagem, em uma página só. */
export function HelpPage() {
  const { locale } = useI18n();
  const intro = pageIntro[locale];

  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-(--color-text)">
            {intro.title}
          </h1>
          <p className="mt-2 max-w-2xl text-(--color-text-body)">
            {intro.body[0]}
            <em>{intro.body[1]}</em>
            {intro.body[2]}
            <a
              href="https://rpic.dev"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-(--color-accent) underline underline-offset-2"
            >
              rpic.dev
            </a>
            .
          </p>

          <div className="mt-10 space-y-10">
            {sections.map((s) => (
              <section key={s.title.en}>
                <h2 className="font-display text-xl font-semibold text-(--color-text)">
                  {s.title[locale]}
                </h2>
                <p className="mt-1 text-sm text-(--color-text-body)">{s.intro[locale]}</p>
                <div className="mt-3 overflow-hidden rounded-(--radius-md) border border-(--color-border)">
                  {s.rows.map(([code, desc], i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 gap-1 border-b border-(--color-border) bg-(--color-surface) px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,55%)_1fr] sm:gap-4"
                    >
                      <code className="font-mono text-[13px] break-words text-(--color-text)">
                        {code}
                      </code>
                      <span className="text-sm text-(--color-text-body)">{desc[locale]}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
