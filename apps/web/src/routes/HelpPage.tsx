import { AppShell } from "@/components/app-shell/AppShell";

interface Section {
  title: string;
  intro: string;
  rows: [string, string][];
}

// Cheatsheet condensada da spec oficial (rpic.dev/docs/spec).
const sections: Section[] = [
  {
    title: "Primitivas",
    intro:
      "Cada primitiva é solta na posição corrente e move o cursor na direção corrente (right por padrão).",
    rows: [
      ['box "texto"', "retângulo com rótulo centrado"],
      ['circle "a" rad 0.3', "círculo (rad/diam controlam o tamanho)"],
      ['ellipse "doc"', "elipse"],
      ["line; arrow", "linha; seta (line -> é o mesmo que arrow)"],
      ["arc cw from A to B", "arco (cw/ccw para o sentido)"],
      ["spline right 1 then down .5", "curva suave por pontos"],
      ["move right 0.4", "move o cursor sem desenhar"],
      ['brace from A.nw to B.ne up "grupo"', "chave de anotação (extensão)"],
      ["dot at A.c", "ponto marcador (extensão)"],
    ],
  },
  {
    title: "Rótulos e referências",
    intro:
      "Rótulos começam com maiúscula. Objetos anteriores são referenciáveis por ordinal ou rótulo, com cantos de bússola.",
    rows: [
      ['A: box "início"', "nomeia o objeto"],
      ["last box; 2nd circle; 3rd last line", "referência por ordem"],
      ["A.n A.ne A.e … A.c A.start A.end", "cantos e âncoras"],
      ["line from A.e to B.w", "conecta âncoras"],
      ["box with .sw at A.ne", "posiciona pelo canto"],
      ["0.5 between A and B", "ponto intermediário"],
      ["A.e + (0.3, 0.1)", "deslocamento em polegadas"],
    ],
  },
  {
    title: "Atributos de estilo",
    intro: "Combináveis em qualquer primitiva, na ordem que preferir.",
    rows: [
      ["dashed / dotted / invis / thick", "traço"],
      ["fill 0.2", "preenchimento em cinza (0–1)"],
      ['colored "red" / outlined "blue" / shaded "gray"', "cores"],
      ["wid 1.2 ht 0.6 / same", "dimensões (same repete as últimas)"],
      ["hatch / crosshatch hatchangle 30", "hachuras (extensão)"],
      ["gradient / opacity 0.5 / class \"meu-css\"", "extensões visuais"],
      ['"texto" above / below / ljust / rjust', "posição do texto"],
    ],
  },
  {
    title: "Variáveis e controle",
    intro: "pic é uma linguagem de verdade: variáveis, expressões, macros e laços.",
    rows: [
      ["boxwid = 0.7; scale = 2.54", "defaults de dimensão (cm com scale)"],
      ["x = 3 * sin(0.5)", "expressões e funções embutidas"],
      ["define node { circle rad .18 $1 }", "macro com argumentos $1…$9"],
      ['node("A")', "chamada de macro"],
      ["for i = 1 to 4 do { arrow; box }", "laço"],
      ["if x > 2 then { … } else { … }", "condicional"],
      ['print x; print sprintf("%g", i)', "diagnóstico no painel"],
      ["reset", "restaura os defaults"],
    ],
  },
  {
    title: "Animação (extensão rpic)",
    intro:
      "animate gera uma timeline GSAP tocada no preview. Efeitos: draw (traça), fade, pop.",
    rows: [
      ['animate 1st box with "pop" for 0.4', "efeito com duração"],
      ['animate 1st arrow with "draw" after 1st box', "encadeia após outro objeto"],
      ['animate 2nd box with "fade" at 1.2', "início em tempo absoluto"],
      ['animate last circle with "pop" delay 0.3', "atraso extra"],
    ],
  },
  {
    title: "Circuitos (ligue o interruptor no editor)",
    intro:
      "A biblioteca nativa traz ~79 macros de elementos elétricos que conectam dois pontos nomeados.",
    rows: [
      ["A:(0,0); B:(2,0)", "declare os nós como posições"],
      ["resistor(A,B); capacitor(B,C)", "elementos de dois terminais"],
      ["battery(A,B); lamp(C,D); fuse(E,F)", "fonte, lâmpada, fusível"],
      ["and_gate(P); or_gate(Q); xor_gate(R)", "portas lógicas"],
      ["ground(P); wire(A,B); dot at A", "terra, fio, junção"],
      ['current(A,B); clabel((x,y),"9V")', "sentido de corrente e rótulos"],
    ],
  },
];

/** Referência rápida da linguagem, em uma página só. */
export function HelpPage() {
  return (
    <AppShell>
      <div className="h-full overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-(--color-text)">
            A linguagem rpic
          </h1>
          <p className="mt-2 max-w-2xl text-(--color-text-body)">
            rpic é a linguagem <em>pic</em> de Brian Kernighan (1982), modernizada: você descreve o
            desenho em texto — "uma caixa, uma seta, um círculo" — e o compilador cuida da
            geometria. Referência completa em{" "}
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
              <section key={s.title}>
                <h2 className="font-display text-xl font-semibold text-(--color-text)">
                  {s.title}
                </h2>
                <p className="mt-1 text-sm text-(--color-text-body)">{s.intro}</p>
                <div className="mt-3 overflow-hidden rounded-(--radius-md) border border-(--color-border)">
                  {s.rows.map(([code, desc], i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 gap-1 border-b border-(--color-border) bg-(--color-surface) px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,55%)_1fr] sm:gap-4"
                    >
                      <code className="font-mono text-[13px] break-words text-(--color-text)">
                        {code}
                      </code>
                      <span className="text-sm text-(--color-text-body)">{desc}</span>
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
