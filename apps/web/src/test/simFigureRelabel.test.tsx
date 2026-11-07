// Rótulo do elemento alterado na figura do painel: reescreve UM texto (o 1º
// que vale o original, na ordem das formas) ou sobrepõe o valor novo.
import { render, screen } from "@testing-library/react";
import { SimFigure, type SliderElement } from "@/components/simulate/SimFigure";

const svgOf = (groups: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${groups
    .map((g, i) => `<g id="s${i}">${g}</g>`)
    .join("")}</svg>`;

function show(groups: string[], el: Omit<SliderElement, "label" | "shapes">) {
  render(
    <SimFigure
      figure={{ svg: svgOf(groups) }}
      highlight={[]}
      elements={[{ ...el, label: el.refdes, shapes: groups.map((_, i) => i) }]}
    />,
  );
  return screen.getByTestId("sim-figure");
}

describe("SimFigure: rótulo do elemento alterado", () => {
  it("reescreve só o rótulo de valor, não um rótulo de pino igual ao valor", () => {
    const fig = show(['<text x="1" y="1">DC 1</text>', "<line/>", '<text x="2" y="2">1</text>'], {
      refdes: "V1",
      altered: { original: 1, value: 2 },
    });
    const texts = [...fig.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toEqual(["DC 2", "1"]);
    expect(fig.querySelector(".sim-relabel")).toBeNull();
  });

  it("aceita cauda Ω e a forma com espaço", () => {
    const fig = show(['<text x="1" y="1">10 kΩ</text>'], {
      refdes: "R1",
      altered: { original: 1e4, value: 2.2e4 },
    });
    expect(fig.querySelector("text")?.textContent).toBe("22 kΩ");
  });

  it("sem texto que case (rótulo TeX/imagem): sobrepõe o valor novo", () => {
    const fig = show(['<path d="M0 0L1 1"/>', "<line/>"], {
      refdes: "R1",
      altered: { original: 1e3, value: 4.7e3 },
    });
    const over = screen.getByTestId("sim-relabel-R1");
    expect(over.textContent).toBe("4.7k");
    expect(over.closest(".sim-altered")).not.toBeNull();
    expect(fig.querySelectorAll("text")).toHaveLength(1); // só a sobreposição
  });

  it("fonte sob .ac (`DC 1 AC 1`): o slider de acmag reescreve o número do AC, não o do DC", () => {
    const fig = show(['<text x="1" y="1">DC 1 AC 1</text>'], {
      refdes: "V1",
      altered: { original: 1, value: 1.5, keyword: "AC" },
    });
    expect(fig.querySelector("text")?.textContent).toBe("DC 1 AC 1.5");
  });
});
