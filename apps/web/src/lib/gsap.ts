import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";

// O player de animação do rpic (0.8.x) usa as propriedades `motionPath` (efeito
// `move`) e `morphSVG` (efeito `morph`), que exigem esses plugins registrados —
// sem eles o GSAP emite "Invalid property … Missing plugin? gsap.registerPlugin()"
// e o efeito não roda. Ambos vêm de graça no gsap ≥ 3.13. Registrar uma única vez
// (idempotente) e reexportar essa instância p/ toda a app usar a MESMA.
gsap.registerPlugin(MotionPathPlugin, MorphSVGPlugin);

export { gsap };
