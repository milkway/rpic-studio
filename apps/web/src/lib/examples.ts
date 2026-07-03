// Exemplos curados do repositório rpic-lang (examples/) — cada um demonstra
// um recurso da linguagem. `circuits` indica que precisa da biblioteca nativa.

export interface Example {
  id: string;
  title: string;
  description: string;
  circuits: boolean;
  source: string;
}

export const WELCOME_SOURCE = `.PS
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
.PE`;

export const examples: Example[] = [
  {
    id: "welcome",
    title: "Boas-vindas (animado)",
    description: "Primitivas básicas com a extensão animate — o cartão de visita do rpic.",
    circuits: false,
    source: WELCOME_SOURCE,
  },
  {
    id: "pipeline",
    title: "Pipeline do Kernighan",
    description: "O diagrama clássico do paper original do pic (1982).",
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
    id: "control",
    title: "Macros e laços",
    description: "define, for e sprintf gerando uma cadeia de nós.",
    circuits: false,
    source: `.PS
define node { circle rad 0.18 $1 }
node("A")
for i = 1 to 4 do { arrow wid 0.4; node(sprintf("%g", i)) }
.PE`,
  },
  {
    id: "brace",
    title: "Chaves de anotação",
    description: "A extensão brace agrupando blocos com rótulos.",
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
    id: "hatch",
    title: "Hachuras e preenchimento",
    description: "hatch, crosshatch, ângulos e cores — texturas de desenho técnico.",
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
    title: "Circuito RLC",
    description: "Bateria, resistor, capacitor e indutor da biblioteca de circuitos.",
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
    title: "Portas lógicas",
    description: "AND, OR, XOR e NAND da biblioteca de circuitos.",
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
    title: "Lanterna (circuito completo)",
    description: "Fusível, chave, lâmpada e sentido de corrente com rótulos.",
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
