// Painel Simular de ponta a ponta em jsdom: worker FALSO que roda o MESMO
// handler do worker real com o dune real (bytes) — protocolo + UI + realce.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ensureDune, renderPic, simulatePic } from "@/lib/dune";
import { handleSimRequest, type SimRequest, type SimResponse } from "@/lib/simProtocol";
import type { WorkerLike } from "@/lib/simClient";
import { SimulatePanel } from "@/components/simulate/SimulatePanel";
import { RC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await ensureDune(
    readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
  );
});

class InlineWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<SimResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  hold = false;
  postMessage(msg: SimRequest) {
    if (this.hold) return; // "simulação infinita": nunca responde
    void handleSimRequest(msg, { ensure: () => ensureDune(), simulatePic, renderPic }).then((res) =>
      this.onmessage?.({ data: res } as MessageEvent<SimResponse>),
    );
  }
  terminate() {
    this.terminated = true;
  }
}

describe("SimulatePanel", () => {
  it("sem spice = 1 o botão fica desabilitado e explica", () => {
    render(
      <SimulatePanel
        source={'.PS\nbox "a"\n.PE'}
        active
        workerFactory={() => new InlineWorker()}
      />,
    );
    expect(screen.getByTestId("sim-run")).toBeDisabled();
  });

  it("roda a figura RC: gráfico, legenda, netlist, figura e realce por hover", async () => {
    const jumps: [number, number?][] = [];
    render(
      <SimulatePanel
        source={RC_FIGURE}
        active
        onJumpToLine={(l, c) => jumps.push([l, c])}
        workerFactory={() => new InlineWorker()}
      />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    // V e A em gráficos separados (nunca dois eixos y)
    expect(screen.getAllByTestId("sim-chart-svg")).toHaveLength(2);
    expect(screen.getByTestId("sim-trace-0").getAttribute("d")).toMatch(/^M/);
    const legend = screen.getAllByTestId("sim-legend")[0];
    expect(legend.textContent?.toLowerCase()).toContain("v(vout)");
    expect(screen.getByTestId("sim-netlist-code").textContent).toContain("R1 Vin Vout 1k");

    // a figura do painel tem os grupos sN; hover na legenda de v(vout) realça a rede
    const fig = await screen.findByTestId("sim-figure");
    await waitFor(() => expect(fig.querySelector('[id="s0"]')).not.toBeNull());
    const item = [...legend.querySelectorAll("li")].find((li) =>
      /v\(vout\)/i.test(li.textContent ?? ""),
    )!;
    fireEvent.pointerEnter(item);
    expect(fig.classList.contains("has-hl")).toBe(true);
    expect(fig.querySelectorAll(".sim-hl").length).toBeGreaterThan(0);
    fireEvent.pointerLeave(item);
    expect(fig.classList.contains("has-hl")).toBe(false);

    // hover numa linha de elemento do netlist realça o elemento
    const r1Line = [...screen.getByTestId("sim-netlist-code").children].find((d) =>
      d.textContent?.startsWith("R1 "),
    )!;
    fireEvent.pointerEnter(r1Line);
    expect(fig.querySelectorAll(".sim-hl").length).toBeGreaterThan(0);
  });

  it("erro de extração mostra diagnóstico que pula para a linha", async () => {
    const jumps: [number, number?][] = [];
    const src =
      ".PS\nspice = 1\nV1: vsource((0,1),(0,0), 1)\nR1: resistor((0,1),(0,0))\nground((0,0))\n.op\n.PE\n";
    render(
      <SimulatePanel
        source={src}
        active
        onJumpToLine={(l, c) => jumps.push([l, c])}
        workerFactory={() => new InlineWorker()}
      />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-error")).toHaveAttribute("data-kind", "pic"),
    );
    const jump = screen.getAllByTestId(/^sim-diag-\d+-jump$/)[0];
    fireEvent.click(jump);
    expect(jumps[0][0]).toBe(4);
    // o netlist parcial vem junto (.pic do erro)
    expect(screen.getByTestId("sim-netlist-code").textContent).toMatch(/R1 /);
  });

  it("Cancelar termina o worker", async () => {
    const workers: InlineWorker[] = [];
    render(
      <SimulatePanel
        source={RC_FIGURE}
        active
        workerFactory={() => {
          const w = new InlineWorker();
          w.hold = true;
          workers.push(w);
          return w;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "running");
    await act(async () => fireEvent.click(screen.getByTestId("sim-cancel")));
    expect(workers[0].terminated).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "cancelled"),
    );
  });
});
