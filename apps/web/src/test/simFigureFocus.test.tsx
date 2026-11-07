// A escrita de volta redesenha a figura (SVG novo → alvos recriados): o foco
// de teclado volta ao alvo EQUIVALENTE, em vez de cair no `body` (#26).
import { render } from "@testing-library/react";
import { SimFigure, type ProbeNet, type SliderElement } from "@/components/simulate/SimFigure";
import { focusKeyOf, restoreFocus } from "@/lib/simFigure";

const svgWith = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="s0"><line x1="10" y1="50" x2="60" y2="50"/></g><g id="s1"><rect x="60" y="40" width="10" height="20"/><text x="65" y="35">${label}</text></g></svg>`;

const nets: ProbeNet[] = [{ name: "vout", trace: "v(vout)", shapes: [0], color: null }];
const elements: SliderElement[] = [
  { refdes: "C1", shapes: [1], label: "Adjust C1", altered: null },
];

function setup() {
  const view = render(
    <>
      <SimFigure
        figure={{ svg: svgWith("1.21u") }}
        highlight={[]}
        nets={nets}
        elements={elements}
      />
      <button type="button">fora</button>
    </>,
  );
  const redraw = (label: string) =>
    view.rerender(
      <>
        <SimFigure
          figure={{ svg: svgWith(label) }}
          highlight={[]}
          nets={nets}
          elements={elements}
        />
        <button type="button">fora</button>
      </>,
    );
  return { ...view, redraw };
}

it("elemento focado: após o redesenho o foco vai à caixa nova do mesmo elemento", () => {
  const { getByTestId, redraw } = setup();
  const before = getByTestId("sim-el-C1");
  before.focus();
  expect(document.activeElement).toBe(before);
  redraw("1u");
  const after = getByTestId("sim-el-C1");
  expect(after).not.toBe(before);
  expect(before.isConnected).toBe(false);
  expect(document.activeElement).toBe(after);
  // e de novo: o nó restaurado também é rastreado
  redraw("1.21u");
  expect(document.activeElement).toBe(getByTestId("sim-el-C1"));
  expect(document.activeElement).not.toBe(after);
});

it("alvo de rede focado: volta ao alvo de teclado da mesma rede", () => {
  const { getByTestId, redraw } = setup();
  const before = getByTestId("sim-probe-vout");
  expect(before.getAttribute("tabindex")).toBe("0");
  before.focus();
  redraw("1u");
  const after = getByTestId("sim-probe-vout");
  expect(after).not.toBe(before);
  expect(document.activeElement).toBe(after);
});

it("foco fora da figura (ex.: slider aberto) não é roubado pelo redesenho", () => {
  const { getByTestId, getByText, redraw } = setup();
  getByTestId("sim-el-C1").focus();
  const out = getByText("fora");
  out.focus();
  redraw("1u");
  expect(document.activeElement).toBe(out);
  // e o foco perdido DEPOIS de sair da figura também não volta a ela
  out.blur();
  redraw("1.21u");
  expect(document.activeElement).toBe(document.body);
});

it("focusKeyOf/restoreFocus: chaves por elemento e rede; só alvos com tabindex", () => {
  const { getByTestId } = setup();
  const fig = getByTestId("sim-figure");
  expect(focusKeyOf(getByTestId("sim-el-C1"))).toBe("el:C1");
  expect(focusKeyOf(getByTestId("sim-probe-vout"))).toBe("net:vout");
  expect(focusKeyOf(fig)).toBeNull();
  expect(restoreFocus(fig, "el:R9")).toBe(false);
  expect(restoreFocus(fig, "net:vout")).toBe(true);
  expect(document.activeElement).toBe(getByTestId("sim-probe-vout"));
});
