// Animações GSAP reutilizáveis do rpic studio — microinterações discretas
// que reforçam a sensação de "desenho acontecendo". Respeita
// prefers-reduced-motion em todas.

import { gsap } from "gsap";

export const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Entrada com fade + leve subida, em sequência (stagger). */
export function fadeUp(targets: gsap.TweenTarget, opts: { delay?: number; stagger?: number } = {}) {
  if (prefersReduced()) return;
  // fromTo com destino explícito evita que re-execuções (React StrictMode)
  // capturem estado intermediário e deixem o elemento invisível.
  gsap.killTweensOf(targets);
  gsap.fromTo(
    targets,
    { opacity: 0, y: 10 },
    {
      opacity: 1,
      y: 0,
      duration: 0.45,
      ease: "power2.out",
      delay: opts.delay ?? 0,
      stagger: opts.stagger ?? 0.05,
      overwrite: "auto",
    },
  );
}

/** Pulso de atenção (ex.: botão copiado, diagrama salvo). */
export function pulse(target: gsap.TweenTarget) {
  if (prefersReduced()) return;
  gsap.fromTo(
    target,
    { scale: 1 },
    { scale: 1.05, duration: 0.16, yoyo: true, repeat: 1, ease: "power1.inOut" },
  );
}

/** Fade suave de troca de conteúdo (ex.: preview recompilado). */
export function crossFade(target: gsap.TweenTarget, duration = 0.25) {
  if (prefersReduced()) return;
  gsap.fromTo(target, { opacity: 0.35 }, { opacity: 1, duration, ease: "power1.out" });
}
