// Figura RC do corpus do dune (corpus/pic/rc.pic): degrau 0→5 V, τ = 1 ms.
export const RC_FIGURE = `.PS
# RC low-pass driven by a 0 -> 5 V step; tau = R1*C1 = 1 ms.
spice = 1
Vin: (0,1.5); Vout: (2.5,1.5)
V1: vsource(Vin, (0,0), PULSE(0 5 0 1u 1u 10m 20m))
R1: resistor(Vin, Vout, 1k)
C1: capacitor(Vout, (2.5,0), 1u)
line from V1.N to C1.N
ground((1.25,0))
dot at Vin; dot at Vout
"in" above at Vin + (0,0.05)
"out" above at Vout + (0,0.05)
.tran 20u 5m
.PE
`;

/** Divisor com .op e .ac (plot sem escala + plot complexo). */
export const DIVIDER_FIGURE = `.PS
spice = 1
A: (0,1); B: (1.5,1)
V1: vsource(A, (0,0), DC 10 AC 1)
R1: resistor(A, B, 1k)
C1: capacitor(B, (1.5,0), 1u)
line from V1.N to C1.N
ground((0.75,0))
.op
.ac dec 10 10 100k
.PE
`;

/** RLC série passa-faixa (issue #17): `vsource` e o resto vêm do prelude do
 *  dune — sem ele o rpic do Studio rejeita a linha do `V1:` (5:12). */
export const RLC_FIGURE = `.PS
# Series RLC band-pass: f0 = 1/(2*pi*sqrt(L1*C1)) ~ 1.6 kHz, out across R1.
spice = 1
In: (0,1.5); A: (1.5,1.5); Out: (3,1.5)
V1: vsource(In, (0,0), AC 1)
L1: inductor(In, A, 10m)
C1: capacitor(A, Out, 1u)
R1: resistor(Out, (3,0), 100)
line from (3,0) to (0,0)
ground((1.5,0))
dot at Out
"out" above at Out + (0,0.05)
.ac dec 50 10 100k
.PE
`;

/** RC com DOIS `.measure` (issue #20): o tempo de subida 10–90 % (TRIG/TARG,
 *  ≈ 2,2·τ = 2,2 ms) e um WHEN que nunca acontece (linha com `error`). */
export const MEASURE_FIGURE = RC_FIGURE.replace(
  ".tran 20u 5m\n",
  ".tran 20u 5m\n" +
    ".measure tran trise TRIG v(Vout) VAL=0.5 RISE=1 TARG v(Vout) VAL=4.5 RISE=1\n" +
    ".meas tran never WHEN v(Vout)=100\n",
);

/** Divisor ligado PINO A PINO (issue #21): sem `line` entre os elementos, as
 *  redes n1/n2 não têm forma própria no mapa — só os terminais (`pins`). */
export const PIN_FIGURE = `.PS
spice = 1
V1: vsource((0,1),(0,0), DC 5)
R1: resistor(V1.P, (1.5,1), 1k)
R2: resistor(R1.N, (1.5,0), 2k)
ground((0,0)); line from V1.N to R2.N
.tran 1u 1m
.PE
`;
