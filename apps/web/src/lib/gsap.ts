import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { CustomEase } from "gsap/CustomEase";
import { CustomWiggle } from "gsap/CustomWiggle";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";

// O player de animação do rpic usa propriedades/eases que exigem plugin
// registrado — sem eles o GSAP emite "Invalid property … Missing plugin?
// gsap.registerPlugin()" e o efeito não roda: `move` → motionPath, `morph` →
// morphSVG (0.8.x); `scramble` → scrambleText, `wiggle` → ease "wiggle(n)" via
// CustomWiggle+CustomEase (0.10.0). `draggable` (diretiva, não efeito) usa a
// classe Draggable — passada a `interactive()` — e InertiaPlugin quando a
// interação pede `inertia`. Todos vêm de graça no gsap ≥ 3.13. Registrar uma
// única vez (idempotente) e reexportar essa instância p/ toda a app usar a MESMA.
gsap.registerPlugin(MotionPathPlugin, MorphSVGPlugin, ScrambleTextPlugin, CustomEase, CustomWiggle, Draggable, InertiaPlugin);

export { gsap, Draggable };
