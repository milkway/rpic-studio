// Dois terminais próximos (elemento curto): os círculos de acerto se
// sobrepõem; o clique vai para o pino de CENTRO mais próximo, não para o
// desenhado por último (review #3 do PR #25).
import { fireEvent, render } from "@testing-library/react";
import { SimFigure, type ProbeNet } from "@/components/simulate/SimFigure";

// um fio de 19.2 unidades SVG (0.2") entre os dois terminais
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="s0"><line x1="10" y1="50" x2="29.2" y2="50"/></g></svg>`;

const nets: ProbeNet[] = [
  { name: "a", trace: "v(a)", shapes: [], pins: [{ x: 0, y: 0 }], color: null },
  { name: "b", trace: "v(b)", shapes: [], pins: [{ x: 0.2, y: 0 }], color: null },
];

/** O frame do viewBox 100×100: a origem pic em (10, 50) unidades SVG. */
const CANVAS = {
  w: 100 / 96,
  h: 100 / 96,
  origin: [10 / 96, 50 / 96] as [number, number],
  rescale: 1,
};

/** Caixa de tela de um círculo: centro (cx, cy) em px, raio 11 px. */
function place(el: Element, cx: number, cy: number) {
  el.getBoundingClientRect = () =>
    ({ left: cx - 11, top: cy - 11, width: 22, height: 22, x: cx - 11, y: cy - 11 }) as DOMRect;
}

it("dois pinos a 20 px: cada um alterna a SUA rede, mesmo onde os círculos se sobrepõem", () => {
  const toggled: string[] = [];
  const { getByTestId } = render(
    <SimFigure
      figure={{ svg: SVG }}
      highlight={[]}
      nets={nets}
      canvas={CANVAS}
      onToggleNet={(n) => toggled.push(n)}
    />,
  );
  const fig = getByTestId("sim-figure");
  const a = fig.querySelector('.sim-hit-pin[data-net="a"] circle')!;
  const b = fig.querySelector('.sim-hit-pin[data-net="b"] circle')!;
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  // posições no SVG: o frame do `canvas` põe os terminais nas pontas do fio
  expect(Number(a.getAttribute("cx"))).toBeCloseTo(10);
  expect(Number(b.getAttribute("cx"))).toBeCloseTo(29.2);
  place(a, 100, 100);
  place(b, 120, 100); // 20 px: os círculos de raio 11 se sobrepõem em 2 px
  fireEvent.click(a, { clientX: 100, clientY: 100 });
  fireEvent.click(b, { clientX: 120, clientY: 100 });
  // na faixa sobreposta o evento cai no DE CIMA (b, desenhado depois) — mas o
  // centro mais próximo é o de a
  fireEvent.click(b, { clientX: 109.5, clientY: 100 });
  fireEvent.click(b, { clientX: 110.5, clientY: 100 });
  expect(toggled).toEqual(["a", "b", "a", "b"]);
  // teclado (sem posição): o alvo do próprio evento
  fireEvent.keyDown(a.parentElement!, { key: "Enter" });
  expect(toggled.at(-1)).toBe("a");
});
