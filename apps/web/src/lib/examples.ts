// Exemplos curados: do repositório rpic-lang (examples/) e adaptações dos
// diagramas do pikup (box.pe.gov.br/app/pikup) portadas de Pikchr para rpic.
// `circuits` indica que precisa da biblioteca nativa; `tags` vira badges.
import type { Locale } from "./i18n";

interface Localized {
  en: string;
  pt: string;
}

export type ExampleTag =
  | "basics"
  | "animation"
  | "macros"
  | "extensions"
  | "circuits"
  | "flow"
  | "blocks"
  | "graph";

export const TAG_META: Record<ExampleTag, { label: Localized; dot: string }> = {
  basics: { label: { en: "Basics", pt: "Básico" }, dot: "#64748b" },
  animation: { label: { en: "Animation", pt: "Animação" }, dot: "#d97706" },
  macros: { label: { en: "Macros", pt: "Macros" }, dot: "#7c3aed" },
  extensions: { label: { en: "Extensions", pt: "Extensões" }, dot: "#0f766e" },
  circuits: { label: { en: "Circuits", pt: "Circuitos" }, dot: "#2e7d32" },
  flow: { label: { en: "Flowchart", pt: "Fluxograma" }, dot: "#c2410c" },
  blocks: { label: { en: "Block diagram", pt: "Diagrama de blocos" }, dot: "#1d4ed8" },
  graph: { label: { en: "Graph", pt: "Grafo" }, dot: "#be185d" },
};

export interface Example {
  id: string;
  title: Localized;
  description: Localized;
  tags: ExampleTag[];
  circuits: boolean;
  source: string;
}

export const WELCOME_SOURCES: Record<Locale, string> = {
  en: `.PS
# welcome to rpic studio — edit and watch the drawing happen
ellipse "idea"
arrow
box "rpic" fill 0.92
arrow
ellipse "diagram"

animate 1st ellipse with "pop" for 0.4
animate 1st arrow with "draw" after 1st ellipse
animate 1st box with "fade" after 1st arrow
animate 2nd arrow with "draw" after 1st box
animate 2nd ellipse with "pop" after 2nd arrow
.PE`,
  pt: `.PS
# bem-vindo ao rpic studio — edite e veja o desenho acontecer
ellipse "ideia"
arrow
box "rpic" fill 0.92
arrow
ellipse "diagrama"

animate 1st ellipse with "pop" for 0.4
animate 1st arrow with "draw" after 1st ellipse
animate 1st box with "fade" after 1st arrow
animate 2nd arrow with "draw" after 1st box
animate 2nd ellipse with "pop" after 2nd arrow
.PE`,
};

export const examples: Example[] = [
  {
    id: "welcome",
    title: { en: "Welcome (animated)", pt: "Boas-vindas (animado)" },
    description: {
      en: "Basic primitives with the animate extension — rpic's calling card.",
      pt: "Primitivas básicas com a extensão animate — o cartão de visita do rpic.",
    },
    tags: ["basics", "animation"],
    circuits: false,
    source: WELCOME_SOURCES.en,
  },
  {
    id: "pipeline",
    title: { en: "Kernighan's pipeline", pt: "Pipeline do Kernighan" },
    description: {
      en: "The classic diagram from the original pic paper (1982).",
      pt: "O diagrama clássico do paper original do pic (1982).",
    },
    tags: ["basics"],
    circuits: false,
    source: `.PS
ellipse "document"
arrow
box "PIC"
arrow
box "TBL/EQN" "(optional)" dashed
arrow
box "TROFF"
arrow
ellipse "typesetter"
.PE`,
  },
  {
    id: "triagem",
    title: { en: "Triage flow (health care)", pt: "Fluxo de triagem (saúde)" },
    description: {
      en: "Patient intake with risk classification and color-coded deadlines — adapted from pikup.",
      pt: "Acolhimento com classificação de risco e prazos por cor — adaptado do pikup.",
    },
    tags: ["flow"],
    circuits: false,
    source: `.PS
# Fluxo de acolhimento com classificação de risco (adaptado do pikup)
boxht = 0.32
B1: box "Chegada" rad 0.16 wid 1.8 shaded "#e2efe3"
arrow down 0.3 from B1.s - (0.62,0)
B2: box "Espontânea" rad 0.05 wid 1.05
arrow down 0.3 from B1.s + (0.62,0)
B3: box "Regulação" rad 0.05 wid 1.05
line from B2.s down 0.3 then right 0.62
line from B3.s down 0.3 then left 0.62
A: box "Acolhimento" rad 0.05 wid 1.3 with .n at (B1.x, B2.s.y - 0.3)
arrow down 0.25 from A.s
S: box "Sinais Vitais" "Téc. de Enfermagem" rad 0.1 ht 0.5 wid 1.6
arrow down 0.25 from S.s
C: box "Classificação de Risco" "Enfermeiro" rad 0.1 ht 0.5 wid 1.9
line -> from C.s down 0.15 then left 1.1 then down 0.2
box "até 10 min" wid 0.95 shaded "#f16913" outlined "none"
arrow from C.s down 0.35
box "até 60 min" wid 0.95 shaded "#ffd320" outlined "none"
line -> from C.s down 0.15 then right 1.1 then down 0.2
box "até 120 min" wid 0.95 shaded "#74c476" outlined "none"
.PE`,
  },
  {
    id: "redeneural",
    title: { en: "Audio classifier", pt: "Classificador de áudio" },
    description: {
      en: "Microphone, band-pass filters and a neural network — adapted from pikup.",
      pt: "Microfone, filtros passa-faixa e rede neural — adaptado do pikup.",
    },
    tags: ["blocks"],
    circuits: false,
    source: `.PS
# Classificador de áudio com rede neural (adaptado do pikup)
d = 1
B1: box "Microfone"
L1: line from B1.e right d/2
L2: arrow up d/3.2 then right d/2
L3: arrow from L1.end down d/3.2 then right d/2
B2: box "Filtro PF" "em f₀" with .w at L2.end
B3: box "Filtro PF" "em f₁" with .w at L3.end
L4: arrow from B2.e right d/2 then down d/3.2 then right d/2
L5: arrow from B3.e right d/2 then up d/3.2 then right d/2
B4: box "Rede" "Neural" shaded "#83CAFF" with .w at (L4.end.x, B1.y)
.PE`,
  },
  {
    id: "sensores",
    title: { en: "Alarm system", pt: "Sistema de alarme" },
    description: {
      en: "Sensors, FSK/FM links and a neural network fan-out — adapted from pikup.",
      pt: "Sensores, enlaces FSK/FM e rede neural com saídas — adaptado do pikup.",
    },
    tags: ["blocks"],
    circuits: false,
    source: `.PS
# Sistema de alarme com sensores e rede neural (adaptado do pikup)
d = 0.75
B1: box "Agente" "Externo"
arrow from B1.s down d/4 then left 1.5*d then down d/4
B2: box "Sensores" "Digitais"
arrow from B1.s down d/4 then right 1.5*d then down d/4
B3: box "Sensores" "Analógicos"
arrow from B2.s down d/2
B4: box "Transmissor" "FSK"
arrow from B3.s down d/2
B5: box "Transmissor" "FM"
arrow from B4.s down d/2
B6: box "Receptor" "FSK"
arrow from B5.s down d/2
B7: box "Receptor" "FM"
L7: line from B6.s down d/2 then right 3.9*d
L8: line from B7.s down d/4 then right 0.9*d
B8: box "Rede" "Neural" shaded "#83CAFF" with .w at 0.5 between L7.end and L8.end
arrow from B8.e right d
B9: box "Controle" "de Acesso"
arrow from B8.e + (0, boxht/6) right d/2 then up d then right d/2
B10: box "Alarme"
arrow from B8.e - (0, boxht/6) right d/2 then down d then right d/2
B11: box "Anúncio"
.PE`,
  },
  {
    id: "receptoram",
    title: { en: "AM receiver", pt: "Receptor AM" },
    description: {
      en: "Signal-processing blocks with a feedback loop — adapted from pikup.",
      pt: "Blocos de processamento de sinal com realimentação — adaptado do pikup.",
    },
    tags: ["blocks"],
    circuits: false,
    source: `.PS
# Receptor AM com realimentação (adaptado do pikup)
margin = 0.18
d = 0.75
L1: arrow right d/2
"RF " rjust at L1.w - (0.05,0)
C1: circle rad d/4 with .w at L1.e
"+" at C1.c
L2: arrow from C1.e right d/2
B1: box "A" wid d ht 3*d/4
L3: arrow right d
B2: box "Detetor de" "envelope" wid d ht 3*d/4 with .w at L3.e
L4: arrow from L3.c down d then left d/2
B4: box "B" wid d ht 3*d/4
line -> from B4.w left (B4.w.x - C1.x) then to C1.s
L5: arrow from B2.e right d/2
"BF" ljust at L5.end + (0.05,0)
L6: line <- from B1.n up d/2
B3: box "oscilador" ht d/2 wid 3*d/4
.PE`,
  },
  {
    id: "hexagonos",
    title: { en: "Hexagonal cells", pt: "Células hexagonais" },
    description: {
      en: "A macro drawing hexagons with square-root trigonometry — adapted from pikup.",
      pt: "Macro que desenha hexágonos com trigonometria — adaptado do pikup.",
    },
    tags: ["macros"],
    circuits: false,
    source: `.PS
# Células hexagonais com macro e trigonometria (adaptado do pikup)
d = 1
define cell {
  move to ($2, $3)
  A: line up d*sqrt(3)/2 right d/2
  line right d
  C: line down d*sqrt(3)/2 right d/2
  line down d*sqrt(3)/2 left d/2
  line left d
  line up d*sqrt(3)/2 left d/2
  $1 at A.start + (d, 0)
  move to C.end
}
j = d*sqrt(3)/2
i = d/2
cell("", 0, 0)
d = d * 0.5
cell("", 0, 0)
cell("", 3*i/2, j/2)
cell("", 3*i/2, -j/2)
"colmeia" at (2*i, -j - 0.22)
.PE`,
  },
  {
    id: "commits",
    title: { en: "Commit graph", pt: "Grafo de commits" },
    description: {
      en: "Trunk and branches, the classic from pikchr.org — adapted to rpic.",
      pt: "Trunk e branches, o clássico do pikchr.org — adaptado para rpic.",
    },
    tags: ["graph"],
    circuits: false,
    source: `.PS
# Grafo de commits com branch (clássico do pikchr.org)
linewid = linewid * 0.5
circlerad = 0.18
C0: circle "C₀"
arrow
C1: circle "C₁"
arrow
C2: circle "C₂"
arrow
C4: circle "C₄"
arrow
C6: circle "C₆"
C3: circle "C₃" at C2 + (0.55, 0.55)
arrow
C5: circle "C₅"
arrow from C2 to C3 chop
P3: circle "C₃'" at C6 + (0.55, 0.55)
arrow from P3.e right
P5: circle "C₅'"
arrow from C6 to P3 chop
T: box ht 0.55 wid (P5.e.x - C0.w.x) + 0.3 with .w at C0.w - (0.15, 0) fill 0.96 behind C0
"trunk" ljust at T.sw + (0.08, -0.14)
X1: box dashed ht 0.55 wid (C5.e.x - C3.w.x) + 0.3 with .w at C3.w - (0.15, 0)
"branch" at X1.n + (0, 0.14)
X2: box dashed ht 0.55 wid (P5.e.x - P3.w.x) + 0.3 with .w at P3.w - (0.15, 0)
"branch" at X2.n + (0, 0.14)
.PE`,
  },
  {
    id: "control",
    title: { en: "Macros and loops", pt: "Macros e laços" },
    description: {
      en: "define, for and sprintf generating a chain of nodes.",
      pt: "define, for e sprintf gerando uma cadeia de nós.",
    },
    tags: ["basics", "macros"],
    circuits: false,
    source: `.PS
define node { circle rad 0.18 $1 }
node("A")
for i = 1 to 4 do { arrow wid 0.4; node(sprintf("%g", i)) }
.PE`,
  },
  {
    id: "brace",
    title: { en: "Annotation braces", pt: "Chaves de anotação" },
    description: {
      en: "The brace extension grouping blocks with labels.",
      pt: "A extensão brace agrupando blocos com rótulos.",
    },
    tags: ["extensions"],
    circuits: false,
    source: `.PS
right
gap = .16
A: box "parse" at (0,0)
B: box "eval" at (1.35,0)
C: box "svg" at (2.7,0)
brace from A.nw + (0,gap) to C.ne + (0,gap) up "front end" wid .18 thick 1.8
brace from A.sw - (0,gap) to C.se - (0,gap) down "regression tests" wid .18 thick 1.8 bracepos .6
.PE`,
  },
  {
    id: "classes",
    title: { en: "CSS classes", pt: "Classes CSS" },
    description: {
      en: "The class extension hooks shapes to host CSS — the studio ships storage, critical, dataflow and pulse (hover “web” and “db”!).",
      pt: "A extensão class liga formas ao CSS do host — o studio traz storage, critical, dataflow e pulse (passe o mouse em “web” e “db”!).",
    },
    tags: ["extensions"],
    circuits: false,
    source: `.PS
# A extensão class marca os grupos SVG para o CSS do host estilizar.
# O studio já estiliza: storage, critical, dataflow e pulse.
W: box "web" wid 0.6 ht 0.45
D: circle "db" rad 0.28 at W + (1.25, 0)
A: box "ALERT" wid 0.7 ht 0.45 at D + (1.35, 0)
arrow from W.e to D.w class "dataflow"
arrow from D.e to A.w class "dataflow"
class W "storage"
class D "storage"
class A "critical pulse"
.PE`,
  },
  {
    id: "hatch",
    title: { en: "Hatching and fills", pt: "Hachuras e preenchimento" },
    description: {
      en: "hatch, crosshatch, angles and colors — technical-drawing textures.",
      pt: "hatch, crosshatch, ângulos e cores — texturas de desenho técnico.",
    },
    tags: ["extensions"],
    circuits: false,
    source: `.PS
boxwid = 0.78
boxht = 0.52

A: box "hatch" hatch
move right 1.05
B: box "crosshatch" crosshatch hatchsep 0.05 hatchwid 1.1
move right 1.05
C: circle "angle" "30" diam 0.58 hatch hatchangle 30 hatchcolor blue

move down 0.9
move left 2.1
D: ellipse "fill" "+ hatch" fill 0.92 hatch hatchangle -35 hatchsep 0.045
move right 1.25
line right 0.85 then up 0.52 then left 0.85 then down 0.52 \\
  crosshatch hatchangle 45 hatchsep 0.045 hatchwid 0.9 hatchcolor red
"path" at last line.c
.PE`,
  },
  {
    id: "rlc",
    title: { en: "RLC circuit", pt: "Circuito RLC" },
    description: {
      en: "Battery, resistor, capacitor and inductor from the circuit library.",
      pt: "Bateria, resistor, capacitor e indutor da biblioteca de circuitos.",
    },
    tags: ["circuits"],
    circuits: true,
    source: `.PS
SW: (0,0)
NW: (0,1.4)
NE: (2.6,1.4)
SE: (2.6,0)
battery(SW, NW)
resistor(NW, NE)
capacitor(NE, SE)
inductor(SE, SW)
dot at NW; dot at NE; dot at SE; dot at SW
.PE`,
  },
  {
    id: "logic",
    title: { en: "Logic gates", pt: "Portas lógicas" },
    description: {
      en: "AND, OR, XOR and NAND from the circuit library.",
      pt: "AND, OR, XOR e NAND da biblioteca de circuitos.",
    },
    tags: ["circuits"],
    circuits: true,
    source: `.PS
margin = 0.08
G1: (0,0)
G2: (1.4,0)
G3: (2.8,0)
G4: (4.2,0)
and_gate(G1)
or_gate(G2)
xor_gate(G3)
nand_gate(G4)
"AND" at G1 - (0,0.55)
"OR" at G2 - (0,0.55)
"XOR" at G3 - (0,0.55)
"NAND" at G4 - (0,0.55)
.PE`,
  },
  {
    id: "flashlight",
    title: { en: "Flashlight (full circuit)", pt: "Lanterna (circuito completo)" },
    description: {
      en: "Fuse, switch, lamp and current direction, with labels.",
      pt: "Fusível, chave, lâmpada e sentido de corrente com rótulos.",
    },
    tags: ["circuits"],
    circuits: true,
    source: `.PS
margin = 0.08
SW:(0,0)
NW:(0,1.4)
TA:(1.2,1.4)
TB:(2.1,1.4)
NE:(3.2,1.4)
SE:(3.2,0)
battery(SW,NW)
fuse(NW,TA)
switch(TA,TB)
wire(TB,NE)
lamp(NE,SE)
wire(SE,SW)
current(SW,NW)
clabel((-0.5,0.7),"9V")
clabel((0.65,1.66),"F1")
clabel((3.7,0.7),"L1")
.PE`,
  },
];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}
