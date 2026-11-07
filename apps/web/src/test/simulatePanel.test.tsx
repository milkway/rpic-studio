// Painel Simular de ponta a ponta em jsdom: worker FALSO que roda o MESMO
// handler do worker real com o dune real (bytes) — protocolo + UI + realce.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ensureDune, openSession, renderPic } from "@/lib/dune";
import { SimHost, transferablesOf, type SimRequest, type SimResponse } from "@/lib/simProtocol";
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
  sent: SimRequest[] = [];
  // a sessão vive no "worker", como no real
  host = new SimHost({ ensure: () => ensureDune(), openSession, renderPic });
  postMessage(msg: SimRequest) {
    this.sent.push(msg);
    if (this.hold) return; // "simulação infinita": nunca responde
    void this.host.handle(msg).then((res) =>
      // como o worker real: os buffers das colunas são TRANSFERIDOS
      this.onmessage?.({
        data: structuredClone(res, { transfer: transferablesOf(res) }),
      } as MessageEvent<SimResponse>),
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

  it("probe: clicar numa rede da figura liga/desliga v(rede) e pinta a rede", async () => {
    render(<SimulatePanel source={RC_FIGURE} active workerFactory={() => new InlineWorker()} />);
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    const fig = await screen.findByTestId("sim-figure");
    const legendText = () =>
      screen
        .getAllByTestId("sim-legend")
        .map((l) => l.textContent ?? "")
        .join(" ")
        .toLowerCase();
    expect(legendText()).toContain("v(vout)");
    // a rede Vout (o ponto) tem clone de acerto; a terra não é sondável
    const hit = await waitFor(() => {
      const h = fig.querySelector('.sim-hit[data-net="Vout"][role="button"]');
      expect(h).not.toBeNull();
      return h!;
    });
    expect(fig.querySelector('.sim-hit[data-net="0"]')).toBeNull();
    expect(hit.hasAttribute("id")).toBe(false);
    // ligada por padrão → pintada na cor do traço
    expect(hit.getAttribute("aria-pressed")).toBe("true");
    expect(fig.querySelectorAll(".sim-probe").length).toBeGreaterThan(0);

    // hover realça a rede na figura
    fireEvent.pointerOver(hit);
    expect(fig.classList.contains("has-hl")).toBe(true);
    fireEvent.pointerLeave(fig);
    expect(fig.classList.contains("has-hl")).toBe(false);

    // clique desliga: some do gráfico e da cor
    fireEvent.click(hit);
    expect(legendText()).not.toContain("v(vout)");
    expect(legendText()).toContain("v(vin)");
    expect(hit.getAttribute("aria-pressed")).toBe("false");
    // teclado (Enter) liga de novo, com a cor do traço no grupo original
    fireEvent.keyDown(hit, { key: "Enter" });
    expect(legendText()).toContain("v(vout)");
    const probed = fig.querySelector<SVGElement>(".sim-probe")!;
    expect(probed.style.getPropertyValue("--probe-color")).toMatch(/var\(--color-trace-\d\)/);
  });

  it("slider: clicar no elemento abre, arrastar re-roda a sessão, Home/reset desfaz", async () => {
    const workers: InlineWorker[] = [];
    render(
      <SimulatePanel
        source={RC_FIGURE}
        active
        workerFactory={() => {
          const w = new InlineWorker();
          workers.push(w);
          return w;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    const fig = await screen.findByTestId("sim-figure");
    // R1 e C1 têm alvo; V1 (só PULSE) não
    const pad = await waitFor(() => {
      const p = fig.querySelector('.sim-hit-el[data-el="R1"]');
      expect(p).not.toBeNull();
      return p!;
    });
    expect(fig.querySelector('.sim-hit-el[data-el="C1"]')).not.toBeNull();
    expect(fig.querySelector('.sim-hit-el[data-el="V1"]')).toBeNull();
    expect(pad.getAttribute("role")).toBe("button");

    // cursor no fim do .tran: o valor de v(vout) na legenda é a sonda do resultado
    fireEvent.change(screen.getByTestId("sim-scrubber-range"), { target: { value: "1000" } });
    const voutAt = () =>
      screen
        .getAllByTestId("sim-legend-value")
        .map((v) => v.textContent ?? "")
        .join(" ");
    const before = voutAt();

    fireEvent.click(pad);
    const slider = screen.getByTestId("sim-slider");
    expect(slider).toHaveAttribute("data-refdes", "R1");
    expect(pad.getAttribute("aria-expanded")).toBe("true");
    const input = screen.getByTestId("sim-slider-input") as HTMLInputElement;
    expect(input.value).toBe("1k");
    const range = screen.getByTestId("sim-slider-range") as HTMLInputElement;
    expect(document.activeElement).toBe(range);

    // "arrastar" até ×100 e soltar: re-run na MESMA sessão (sem worker novo)
    fireEvent.change(range, { target: { value: range.max } });
    fireEvent.pointerUp(range);
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-rerun", "1"),
    );
    await waitFor(() => expect(voutAt()).not.toBe(before));
    expect(workers).toHaveLength(1);
    expect(workers[0].sent.at(-1)).toMatchObject({ alters: { R1: 1e5 } });
    expect(input.value).toBe("100k");
    // cursor do scrubber sobreviveu ao re-run
    expect(screen.getAllByTestId("sim-cursor").length).toBeGreaterThan(0);
    // badge: rótulo desenhado reescrito + chip
    await waitFor(() => expect(fig.querySelector(".sim-altered text")?.textContent).toBe("100k"));
    expect(screen.getByTestId("sim-altered-chip").textContent).toMatch(/altered/);

    // teclado: seta = um passo; Home = valor original
    fireEvent.keyDown(range, { key: "ArrowLeft" });
    await waitFor(() => expect(input.value).toBe("82.5k"));
    fireEvent.keyDown(range, { key: "Home" });
    await waitFor(() => expect(input.value).toBe("1k"));
    await waitFor(() => expect(voutAt()).toBe(before));
    expect(fig.querySelector(".sim-altered")).toBeNull();
    expect(screen.queryByTestId("sim-altered-chip")).toBeNull();

    // campo numérico (notação SPICE) e reset pelo botão
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "4.7k" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(workers[0].sent.at(-1)).toMatchObject({ alters: { R1: 4700 } }));
    fireEvent.click(screen.getByTestId("sim-slider-reset"));
    await waitFor(() => expect(workers[0].sent.at(-1)).toMatchObject({ alters: {} }));
    // Esc fecha
    fireEvent.keyDown(range, { key: "Escape" });
    expect(screen.queryByTestId("sim-slider")).toBeNull();
  });

  it("scrubber do .tran: cursor de tempo nos gráficos + valores na legenda", async () => {
    render(<SimulatePanel source={RC_FIGURE} active workerFactory={() => new InlineWorker()} />);
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    expect(screen.queryByTestId("sim-cursor")).toBeNull();
    // fim do intervalo (5 ms): v(vout) ≈ 4.97 V
    fireEvent.change(screen.getByTestId("sim-scrubber-range"), { target: { value: "1000" } });
    expect(screen.getByTestId("sim-scrubber-time").textContent).toBe("5 ms");
    expect(screen.getAllByTestId("sim-cursor")).toHaveLength(2); // V e A
    const values = screen.getAllByTestId("sim-legend-value").map((v) => v.textContent);
    expect(values.some((v) => /4\.96\d? V/.test(v ?? ""))).toBe(true);
    fireEvent.click(screen.getByTestId("sim-scrubber-clear"));
    expect(screen.queryByTestId("sim-cursor")).toBeNull();
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

  it("slider re-ancora quando o contêiner da figura muda de tamanho (ResizeObserver)", async () => {
    const observers: { cb: ResizeObserverCallback; targets: Element[]; off: boolean }[] = [];
    class FakeRO {
      rec: { cb: ResizeObserverCallback; targets: Element[]; off: boolean };
      constructor(cb: ResizeObserverCallback) {
        this.rec = { cb, targets: [], off: false };
        observers.push(this.rec);
      }
      observe(el: Element) {
        this.rec.targets.push(el);
      }
      unobserve() {}
      disconnect() {
        this.rec.off = true;
      }
    }
    vi.stubGlobal("ResizeObserver", FakeRO);
    try {
      render(<SimulatePanel source={RC_FIGURE} active workerFactory={() => new InlineWorker()} />);
      fireEvent.click(screen.getByTestId("sim-run"));
      const fig = await screen.findByTestId("sim-figure");
      const pad = await waitFor(() => {
        const p = fig.querySelector('.sim-hit-el[data-el="R1"]');
        expect(p).not.toBeNull();
        return p!;
      });
      fireEvent.click(pad);
      const wrap = fig.parentElement!;
      const live = observers.find((o) => !o.off && o.targets.includes(wrap));
      expect(live).toBeDefined();
      // o contêiner "cresce" (alça do split): o slider vai para baixo do elemento
      const rect = (x: number, y: number, w: number, h: number) =>
        ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;
      wrap.getBoundingClientRect = () => rect(0, 0, 800, 300);
      (pad as Element).getBoundingClientRect = () => rect(300, 50, 40, 20);
      act(() => live!.cb([], live as unknown as ResizeObserver));
      const slider = screen.getByTestId("sim-slider");
      expect(slider.style.getPropertyValue("--sl-top")).toBe("76px");
      expect(slider.style.getPropertyValue("--sl-left")).toBe("160px");
      // fechar desconecta
      fireEvent.click(screen.getByTestId("sim-slider-close"));
      expect(live!.off).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
