// Painel Simular de ponta a ponta em jsdom: worker FALSO que roda o MESMO
// handler do worker real com o dune real (bytes) — protocolo + UI + realce.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { ensureDune, extractPic, openDeck, openSession, renderPic } from "@/lib/dune";
import { applySourceEdit, type SourceEdit } from "@/lib/simSource";
import { I18nProvider } from "@/lib/i18n";
import { applyPrefs } from "@/lib/prefs";
import { measureRows } from "@/lib/simMeasure";
import { SimHost, transferablesOf, type SimRequest, type SimResponse } from "@/lib/simProtocol";
import type { WorkerLike } from "@/lib/simClient";
import { SimulatePanel } from "@/components/simulate/SimulatePanel";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { DIVIDER_FIGURE, MEASURE_FIGURE, PIN_FIGURE, RC_FIGURE, RLC_FIGURE } from "./fixtures-sim";

const require = createRequire(import.meta.url);

// espião em `measureRows`: as linhas de medida são calculadas UMA vez por run
vi.mock("@/lib/simMeasure", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/simMeasure")>();
  return { ...mod, measureRows: vi.fn(mod.measureRows) };
});
// o cabeçalho do painel tem `Tip` (Radix exige o provider, como no App); o
// I18nProvider preenche os `{placeholders}` (o contexto padrão não)
function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </I18nProvider>
  );
}
const render = (ui: Parameters<typeof rtlRender>[0]) => rtlRender(ui, { wrapper: Providers });

beforeAll(async () => {
  await ensureDune(
    readFileSync(require.resolve("@strategicprojects/dune-sim/pkg/dune_wasm_bg.wasm")),
  );
});

const npointsOf = (res: SimResponse) =>
  res.type === "ok" ? res.run.plots.map((p) => p.npoints) : [];

class InlineWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<SimResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  hold = false;
  sent: SimRequest[] = [];
  /** O que o host respondeu a cada pedido (sessão reaberta?). */
  responses: { fresh: boolean; source: string; npoints: number[] }[] = [];
  // a sessão vive no "worker", como no real
  host = new SimHost({ ensure: () => ensureDune(), openSession, renderPic, extractPic, openDeck });
  /** Modo passo a passo: o pedido espera `process()` (o worker o trata) e a
   *  resposta espera `deliver()` (chega à UI) — p/ intercalar a UI entre os dois. */
  manual = false;
  inbox: SimRequest[] = [];
  outbox: SimResponse[] = [];
  postMessage(msg: SimRequest) {
    this.sent.push(msg);
    if (this.hold) return; // "simulação infinita": nunca responde
    if (this.manual) {
      this.inbox.push(msg);
      return;
    }
    void this.host.handle(msg).then((res) => this.reply(msg, res));
  }
  async process() {
    const msg = this.inbox.shift()!;
    const res = await this.host.handle(msg);
    this.responses.push({ fresh: res.fresh, source: msg.source, npoints: npointsOf(res) });
    this.outbox.push(res);
  }
  deliver() {
    const res = this.outbox.shift()!;
    this.onmessage?.({
      data: structuredClone(res, { transfer: transferablesOf(res) }),
    } as MessageEvent<SimResponse>);
  }
  private reply(msg: SimRequest, res: SimResponse) {
    this.responses.push({ fresh: res.fresh, source: msg.source, npoints: npointsOf(res) });
    // como o worker real: os buffers das colunas são TRANSFERIDOS
    this.onmessage?.({
      data: structuredClone(res, { transfer: transferablesOf(res) }),
    } as MessageEvent<SimResponse>);
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

  describe("escrita de volta no fonte (issue #22)", () => {
    /** O painel com o fonte num estado (o "editor"): as posições vêm do
     *  `OverlayMap` da própria execução (dune ≥ 0.3.4). */
    function Harness({
      initial,
      edits,
      workers,
      reject = false,
    }: {
      initial: string;
      edits: SourceEdit[];
      workers: InlineWorker[];
      /** O "editor" recusa a edição (texto divergente/fora do documento). */
      reject?: boolean;
    }) {
      const [source, setSource] = useState(initial);
      return (
        <I18nProvider>
          <pre data-testid="harness-source">{source}</pre>
          <SimulatePanel
            source={source}
            active
            onSourceEdit={(e, base) => {
              if (reject || base !== source) return false;
              edits.push(e);
              setSource((s) => applySourceEdit(s, e));
              return true;
            }}
            workerFactory={() => {
              const w = new InlineWorker();
              workers.push(w);
              return w;
            }}
          />
        </I18nProvider>
      );
    }

    async function openSlider(refdes: string) {
      fireEvent.click(screen.getByTestId("sim-run"));
      await waitFor(() =>
        expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
      );
      const fig = await screen.findByTestId("sim-figure");
      const pad = await waitFor(() => {
        const p = fig.querySelector(`.sim-hit-el[data-el="${refdes}"]`);
        expect(p).not.toBeNull();
        return p!;
      });
      fireEvent.click(pad);
      return fig;
    }
    const srcLine = (prefix: string) =>
      (screen.getByTestId("harness-source").textContent ?? "")
        .split("\n")
        .find((l) => l.startsWith(prefix));

    it("arrastar não escreve; soltar escreve o valor, e o elemento deixa de estar alterado", async () => {
      const edits: SourceEdit[] = [];
      const workers: InlineWorker[] = [];
      render(<Harness initial={RC_FIGURE} edits={edits} workers={workers} />);
      const fig = await openSlider("R1");
      const range = screen.getByTestId("sim-slider-range") as HTMLInputElement;
      const input = screen.getByTestId("sim-slider-input") as HTMLInputElement;

      // arrasto: muda a simulação (alterado), o fonte fica
      fireEvent.change(range, { target: { value: "600" } });
      await waitFor(() => expect(input.value).not.toBe("1k"));
      expect(edits).toHaveLength(0);
      expect(srcLine("R1:")).toBe("R1: resistor(Vin, Vout, 1k)");
      expect(screen.getByTestId("sim-altered-chip")).toBeInTheDocument();
      const dragged = input.value;

      // soltar: o fonte segue o slider; sem chip, reset desabilitado
      fireEvent.pointerUp(range);
      expect(edits).toHaveLength(1);
      expect(srcLine("R1:")).toBe(`R1: resistor(Vin, Vout, ${dragged})`);
      await waitFor(() => expect(screen.queryByTestId("sim-altered-chip")).toBeNull());
      expect(screen.getByTestId("sim-slider-reset")).toBeDisabled();
      expect(screen.getByTestId("sim-writeback")).toHaveAttribute("data-ok", "1");
      expect(screen.queryByTestId("sim-stale")).toBeNull();
      // o worker ADOTOU o fonte novo (mesma sessão, sem worker novo) e
      // redesenhou a figura com o rótulo novo — nada de rótulo em itálico
      expect(workers).toHaveLength(1);
      await waitFor(() =>
        expect(workers[0].sent.at(-1)).toMatchObject({
          alters: {},
          adopt: [expect.objectContaining({ originals: { R1: expect.any(Number) } })],
        }),
      );
      await waitFor(() =>
        expect([...fig.querySelectorAll("text")].some((t) => t.textContent === dragged)).toBe(true),
      );
      expect(fig.querySelector(".sim-altered")).toBeNull();
      // o netlist mostrado acompanha
      await waitFor(() =>
        expect(screen.getByTestId("sim-netlist-code").textContent).toContain(
          `R1 Vin Vout ${dragged}`,
        ),
      );

      // teclado: o passo re-roda na hora, mas só escreve ao SOLTAR a tecla
      fireEvent.keyDown(range, { key: "ArrowRight" });
      await waitFor(() => expect(input.value).not.toBe(dragged));
      expect(edits).toHaveLength(1);
      const stepped = input.value;
      fireEvent.keyUp(range, { key: "ArrowRight" });
      expect(edits).toHaveLength(2);
      expect(srcLine("R1:")).toBe(`R1: resistor(Vin, Vout, ${stepped})`);

      // campo + Enter: idem, sem arredondar o valor digitado
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "4.753k" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(srcLine("R1:")).toBe("R1: resistor(Vin, Vout, 4.753k)");
      await waitFor(() => expect(screen.queryByTestId("sim-altered-chip")).toBeNull());

      // clique/toque PARADO no slider (sem mover): nada de commit nem escrita —
      // não quantiza o valor digitado
      const sent = workers[0].sent.length;
      fireEvent.pointerDown(range);
      fireEvent.pointerUp(range);
      expect(edits).toHaveLength(3);
      expect(srcLine("R1:")).toBe("R1: resistor(Vin, Vout, 4.753k)");
      expect(workers[0].sent).toHaveLength(sent);
    });

    it("duas escritas seguidas: o worker adotou a 1ª mas a UI não soube ainda — a 2ª segue a cadeia, sem reabrir", async () => {
      const edits: SourceEdit[] = [];
      const workers: InlineWorker[] = [];
      render(<Harness initial={RC_FIGURE} edits={edits} workers={workers} />);
      await openSlider("R1");
      const w = workers[0];
      w.manual = true;
      const range = screen.getByTestId("sim-slider-range") as HTMLInputElement;
      const input = screen.getByTestId("sim-slider-input") as HTMLInputElement;

      // 1ª escrita: re-run (R1 alterado) sai; a adoção A→B fica na fila do cliente
      fireEvent.change(range, { target: { value: "600" } });
      fireEvent.pointerUp(range);
      await act(async () => {
        await w.process();
        w.deliver(); // re-run respondido → o cliente manda a adoção A→B
      });
      expect(w.inbox.at(-1)?.adopt).toHaveLength(1);
      // o worker ADOTA B, mas a resposta ainda não chegou à UI…
      await act(() => w.process());
      // …e chega a 2ª escrita (B→C)
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "33k" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(edits).toHaveLength(2);
      expect(srcLine("R1:")).toBe("R1: resistor(Vin, Vout, 33k)");
      // entrega da adoção de B e processa o que vier (a cadeia até C)
      await act(async () => {
        w.deliver();
        while (w.inbox.length) {
          await w.process();
          w.deliver();
        }
      });
      await waitFor(() =>
        expect(screen.getByTestId("sim-netlist-code").textContent).toContain("R1 Vin Vout 33k"),
      );
      // só a execução inicial abriu sessão; nenhuma adoção reabriu
      expect(workers).toHaveLength(1);
      expect(w.responses.filter((r) => r.fresh)).toHaveLength(1);
      expect(screen.queryByTestId("sim-altered-chip")).toBeNull();
    });

    it("valor que não é literal: não escreve, fica alterado e a linha de status diz por quê", async () => {
      const src = RC_FIGURE.replace(
        "R1: resistor(Vin, Vout, 1k)",
        "R1: resistor(Vin, Vout, {1000})",
      );
      const edits: SourceEdit[] = [];
      render(<Harness initial={src} edits={edits} workers={[]} />);
      await openSlider("R1");
      const range = screen.getByTestId("sim-slider-range") as HTMLInputElement;
      fireEvent.change(range, { target: { value: range.max } });
      fireEvent.pointerUp(range);
      expect(edits).toHaveLength(0);
      const note = screen.getByTestId("sim-writeback");
      expect(note).toHaveAttribute("data-ok", "0");
      expect(note.textContent).toMatch(/R1.*not a plain number/);
      expect(screen.getByTestId("sim-altered-chip")).toBeInTheDocument();
    });

    it("sem span confiável (macro wrapper do usuário): não escreve e diz por quê (≠ código mudou)", async () => {
      const src = RC_FIGURE.replace(
        "R1: resistor(Vin, Vout, 1k)",
        "define myr { resistor($1, $2, $3) }\nR1: myr(Vin, Vout, 1k)",
      );
      const edits: SourceEdit[] = [];
      render(<Harness initial={src} edits={edits} workers={[]} />);
      await openSlider("R1");
      const range = screen.getByTestId("sim-slider-range") as HTMLInputElement;
      fireEvent.change(range, { target: { value: range.max } });
      fireEvent.pointerUp(range);
      expect(edits).toHaveLength(0);
      const note = screen.getByTestId("sim-writeback");
      expect(note).toHaveAttribute("data-ok", "0");
      expect(note.textContent).toMatch(/R1.*no trustworthy position/);
      expect(note.textContent).not.toMatch(/changed since/);
      expect(screen.getByTestId("sim-altered-chip")).toBeInTheDocument();
    });

    it("editor que recusa a edição: a sessão não adota, fica alterado e diz que o código mudou", async () => {
      const workers: InlineWorker[] = [];
      render(<Harness initial={RC_FIGURE} edits={[]} workers={workers} reject />);
      await openSlider("R1");
      const range = screen.getByTestId("sim-slider-range") as HTMLInputElement;
      fireEvent.change(range, { target: { value: range.max } });
      fireEvent.pointerUp(range);
      expect(srcLine("R1:")).toBe("R1: resistor(Vin, Vout, 1k)");
      expect(screen.getByTestId("sim-writeback")).toHaveAttribute("data-ok", "0");
      expect(screen.getByTestId("sim-altered-chip")).toBeInTheDocument();
      await waitFor(() => expect(workers[0].sent.at(-1)).toMatchObject({ alters: { R1: 1e5 } }));
      expect(workers[0].sent.some((m) => m.adopt)).toBe(false);
    });

    it("sob .ac a fonte ajusta acmag: cabeçalho, AC no campo e escrita só do sub-trecho", async () => {
      const edits: SourceEdit[] = [];
      const workers: InlineWorker[] = [];
      render(<Harness initial={DIVIDER_FIGURE} edits={edits} workers={workers} />);
      await openSlider("V1");
      const slider = screen.getByTestId("sim-slider");
      expect(slider.textContent).toContain("acmag");
      expect(screen.getByTestId("sim-slider-keyword").textContent).toBe("AC");
      const input = screen.getByTestId("sim-slider-input") as HTMLInputElement;
      expect(input.value).toBe("1");
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "1.5" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(srcLine("V1:")).toBe("V1: vsource(A, (0,0), DC 10 AC 1.5)");
      expect(screen.getByTestId("sim-writeback").textContent).toContain("V1 = AC 1.5");
      await waitFor(() =>
        expect(workers[0].sent.at(-1)).toMatchObject({
          adopt: [expect.objectContaining({ originals: { V1: 1.5 } })],
        }),
      );
    });

    describe("editor de análise (issue #33)", () => {
      async function runIt() {
        fireEvent.click(screen.getByTestId("sim-run"));
        await waitFor(() =>
          expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
        );
      }
      const field = (key: string) => screen.getByTestId(`sim-card-${key}`) as HTMLInputElement;
      const type = (key: string, text: string, enter = true) => {
        const el = field(key);
        fireEvent.focus(el);
        fireEvent.change(el, { target: { value: text } });
        if (enter) fireEvent.keyDown(el, { key: "Enter" });
      };
      const tmaxOf = (res: SimResponse) => {
        if (res.type !== "ok") return NaN;
        const t = res.run.plots[0].columns[0];
        return t[t.length - 1];
      };

      it("campos do .tran; editar o fim escreve o cartão (UMA edição) e re-roda; sliders seguem", async () => {
        const edits: SourceEdit[] = [];
        const workers: InlineWorker[] = [];
        // a escala de tempo de cada resposta, lida ANTES da transferência (que
        // desliga os buffers do lado do worker)
        const results: { fresh: boolean; tmax: number }[] = [];
        render(<Harness initial={RC_FIGURE} edits={edits} workers={workers} />);
        await runIt();
        const card = screen.getByTestId("sim-card");
        expect(card).toHaveAttribute("data-card", "tran:0");
        expect(card).toHaveAttribute("data-readonly", "0");
        expect(card.textContent).toContain(".tran");
        expect([field("tstart").value, field("tstop").value, field("tstep").value]).toEqual([
          "0",
          "5m",
          "20u",
        ]);
        expect(screen.queryByTestId("sim-card-tmax")).toBeNull();

        // um slider alterado (arrasto, sem escrever) antes do cartão
        const w = workers[0];
        const fig = await screen.findByTestId("sim-figure");
        const pad = await waitFor(() => {
          const p = fig.querySelector('.sim-hit-el[data-el="R1"]');
          expect(p).not.toBeNull();
          return p!;
        });
        fireEvent.click(pad);
        fireEvent.change(screen.getByTestId("sim-slider-range"), { target: { value: "600" } });
        await waitFor(() => expect(w.sent.at(-1)?.alters?.R1).toBeDefined());
        const r1 = w.sent.at(-1)!.alters!.R1;
        await waitFor(() => expect(w.responses).toHaveLength(w.sent.length));
        const before = edits.length;

        // o host responde; guardamos as respostas p/ olhar a escala de tempo
        const orig = w.host.handle.bind(w.host);
        w.host.handle = async (m) => {
          const r = await orig(m);
          results.push({ fresh: r.fresh, tmax: tmaxOf(r) });
          return r;
        };
        type("tstop", "10m");
        expect(edits).toHaveLength(before + 1);
        expect(srcLine(".tran")).toBe(".tran 20u 10m");
        expect(screen.getByTestId("sim-writeback")).toHaveAttribute("data-ok", "1");
        expect(screen.getByTestId("sim-writeback").textContent).toContain(".tran 20u 10m");
        // o campo já mostra o valor novo (antes da resposta)
        expect(field("tstop").value).toBe("10m");
        await waitFor(() => expect(results).toHaveLength(1));
        const req = w.sent.at(-1)!;
        expect(req.source).toContain(".tran 20u 10m");
        expect(req.alters).toEqual({ R1: r1 }); // o slider segue alterado
        expect(results[0].fresh).toBe(true); // deck novo = sessão reaberta
        expect(results[0].tmax).toBeCloseTo(10e-3, 9);
        expect(workers).toHaveLength(1);
        // o run novo traz o netlist com o cartão novo; seguir editando funciona
        await waitFor(() =>
          expect(screen.getByTestId("sim-netlist-code").textContent).toContain(".tran 20u 10m"),
        );
        expect(screen.getByTestId("sim-card")).toHaveAttribute("data-readonly", "0");
        expect(screen.getByTestId("sim-altered-chip")).toBeInTheDocument();
        expect(screen.queryByTestId("sim-stale")).toBeNull();
        // TSTART ausente: inserido após o TSTOP
        type("tstart", "1m");
        expect(srcLine(".tran")).toBe(".tran 20u 10m 1m");
        await waitFor(() => expect(results).toHaveLength(2));
        expect(results[1].tmax).toBeCloseTo(10e-3, 9);
      });

      it("valor inválido: fica o antigo + erro visual, nada escrito; Esc desfaz", async () => {
        const edits: SourceEdit[] = [];
        const workers: InlineWorker[] = [];
        render(<Harness initial={RC_FIGURE} edits={edits} workers={workers} />);
        await runIt();
        const n = workers[0].sent.length;
        type("tstop", "abc");
        expect(field("tstop")).toHaveAttribute("aria-invalid", "true");
        expect(edits).toHaveLength(0);
        type("tstop", "0"); // fim = início
        expect(field("tstop")).toHaveAttribute("aria-invalid", "true");
        fireEvent.keyDown(field("tstop"), { key: "Escape" });
        expect(field("tstop").value).toBe("5m");
        expect(field("tstop")).not.toHaveAttribute("aria-invalid");
        fireEvent.blur(field("tstop"));
        expect(edits).toHaveLength(0);
        expect(workers[0].sent).toHaveLength(n);
        // inválido e blur: volta ao antigo, sem escrever
        type("tstep", "-1", false);
        fireEvent.blur(field("tstep"));
        expect(field("tstep").value).toBe("20u");
        expect(edits).toHaveLength(0);
      });

      it(".op só leitura; .ac com pontos por década editáveis", async () => {
        const edits: SourceEdit[] = [];
        render(<Harness initial={DIVIDER_FIGURE} edits={edits} workers={[]} />);
        await runIt();
        const cards = screen.getAllByTestId("sim-card");
        expect(cards.map((c) => [c.dataset.card, c.dataset.readonly])).toEqual([
          ["op:0", "1"],
          ["ac:0", "0"],
        ]);
        expect(cards[1].textContent).toContain(".ac dec");
        expect(cards[1].textContent).toContain("pts/dec");
        type("points", "50");
        expect(srcLine(".ac")).toBe(".ac dec 50 10 100k");
      });

      it("editor que recusa a edição do cartão: nada escrito nem re-rodado, a linha diz por quê", async () => {
        const edits: SourceEdit[] = [];
        const workers: InlineWorker[] = [];
        render(<Harness initial={RC_FIGURE} edits={edits} workers={workers} reject />);
        await runIt();
        const n = workers[0].sent.length;
        type("tstop", "10m");
        expect(edits).toHaveLength(0);
        expect(screen.getByTestId("sim-writeback")).toHaveAttribute("data-ok", "0");
        expect(workers[0].sent).toHaveLength(n);
      });
    });
  });
});

describe("grade fina (issue #33; o toggle dos passos finos, #19)", () => {
  afterEach(() => window.localStorage.clear());

  it("alternar re-roda UMA vez (reabre no deck denso) com ≥ 600 pontos, rotula e persiste", async () => {
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
    const toggle = screen.getByTestId("sim-fine");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    const w = workers[0];
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].fine).toBeUndefined();
    const coarse = w.responses[0].npoints[0];
    // modo desligado: sem rótulo de grade
    expect(screen.queryByTestId("sim-grid")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(w.responses).toHaveLength(2));
    expect(w.sent).toHaveLength(2); // UM re-run
    expect(w.sent[1]).toMatchObject({ source: RC_FIGURE, fine: true });
    expect(w.responses[1].fresh).toBe(true); // outro deck = sessão reaberta no worker
    const dense = w.responses[1].npoints[0];
    expect(dense).toBeGreaterThanOrEqual(600);
    expect(dense).toBeGreaterThan(coarse);
    expect(workers).toHaveLength(1);
    // o gráfico diz que é a grade de exibição (.tran: contagem do deck é
    // adaptativa — não é mostrada)
    await waitFor(() =>
      expect(screen.getByTestId("sim-grid")).toHaveAttribute("data-grid", "dense"),
    );
    expect(screen.getByTestId("sim-grid").textContent).toBe(`display grid · ${dense} points`);
    // e o netlist mostrado segue o deck FIEL
    expect(screen.getByTestId("sim-netlist-code").textContent).toContain(".tran 20u 5m");
    expect(screen.getByTestId("sim-netlist-code").textContent).not.toContain("8.333333e-6");
    expect(JSON.parse(window.localStorage.getItem("rpic:settings.v1")!).simFineSteps).toBe(true);

    // slider no modo fino: o re-run leva o modo
    const fig = await screen.findByTestId("sim-figure");
    const pad = await waitFor(() => {
      const p = fig.querySelector('.sim-hit-el[data-el="R1"]');
      expect(p).not.toBeNull();
      return p!;
    });
    fireEvent.click(pad);
    const input = screen.getByTestId("sim-slider-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2k" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(w.sent.at(-1)).toMatchObject({ alters: { R1: 2000 }, fine: true }));

    // desligar volta ao deck como está
    fireEvent.click(toggle);
    await waitFor(() => expect(w.sent.at(-1)?.fine).toBeUndefined());
    await waitFor(() => expect(w.responses.at(-1)?.npoints[0]).toBe(coarse));
    expect(JSON.parse(window.localStorage.getItem("rpic:settings.v1")!).simFineSteps).toBe(false);
    await waitFor(() => expect(screen.queryByTestId("sim-grid")).toBeNull());
  });

  it("rótulo do gráfico: deck já denso = grade do deck; denso que falha = recuo dito", async () => {
    window.localStorage.setItem("rpic:settings.v1", JSON.stringify({ simFineSteps: true }));
    // PIN_FIGURE: `.tran 1u 1m` já tem TMAX efetivo ≤ span/600 — nada a refinar
    const a = render(
      <SimulatePanel source={PIN_FIGURE} active workerFactory={() => new InlineWorker()} />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-grid")).toHaveAttribute("data-grid", "deck"),
    );
    expect(screen.getByTestId("sim-grid").textContent).toMatch(/^deck grid · \d+ points$/);
    a.unmount();
    // o deck denso não abre: o gráfico é o do deck, e o rótulo diz
    render(
      <SimulatePanel
        source={RC_FIGURE}
        active
        workerFactory={() => {
          const w = new InlineWorker();
          w.host = new SimHost({
            ensure: () => ensureDune(),
            openSession,
            renderPic,
            extractPic,
            openDeck: () => {
              throw new Error("dense deck refused");
            },
          });
          return w;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-grid")).toHaveAttribute("data-grid", "fallback"),
    );
    expect(screen.getByTestId("sim-grid").textContent).toMatch(
      /^deck grid · \d+ points \(dense run failed\)$/,
    );
  });

  it(".ac denso: rótulo com a contagem EXATA do cartão fiel; medidas marcadas como da grade", async () => {
    window.localStorage.setItem("rpic:settings.v1", JSON.stringify({ simFineSteps: true }));
    // RLC: `.ac dec 50 10 100k` = 50·4 + 1 = 201 no deck; denso = 150/déc → 601
    const a = render(
      <SimulatePanel source={RLC_FIGURE} active workerFactory={() => new InlineWorker()} />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-grid")).toHaveAttribute("data-grid", "dense"),
    );
    expect(screen.getByTestId("sim-grid").textContent).toBe(
      "display grid · 601 points (deck: 201)",
    );
    a.unmount();
    // `.measure` sob a grade densa: o cabeçalho do painel diz de onde vêm
    render(
      <SimulatePanel source={MEASURE_FIGURE} active workerFactory={() => new InlineWorker()} />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getAllByTestId("sim-measures-grid").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByTestId("sim-measures-grid")[0].textContent).toBe("(display grid)");
  });

  it("o modo salvo vale no 1º Simular; prefs da conta (rpic:prefs) são relidas", async () => {
    window.localStorage.setItem("rpic:settings.v1", JSON.stringify({ simFineSteps: true }));
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
    expect(screen.getByTestId("sim-fine")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("sim-run"));
    expect(workers[0].sent[0]).toMatchObject({ fine: true });
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    act(() => applyPrefs({ settings: { layout: "horizontal", simFineSteps: false } }));
    expect(screen.getByTestId("sim-fine")).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(workers[0].sent).toHaveLength(2));
    expect(workers[0].sent[1].fine).toBeUndefined();
  });
});

describe("painel de medidas .measure (issue #20)", () => {
  const rowsOf = (panel: HTMLElement) =>
    [...panel.querySelectorAll<HTMLElement>('[data-testid="sim-measure"]')].map((li) => ({
      name: li.dataset.name,
      error: li.dataset.error,
      text: li.textContent ?? "",
    }));

  it("sem .measure não aparece", async () => {
    render(<SimulatePanel source={RC_FIGURE} active workerFactory={() => new InlineWorker()} />);
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    expect(screen.queryByTestId("sim-measures")).toBeNull();
  });

  it("valor SI + trig/targ; a que falha mostra a razão; o slider atualiza e ela fica", async () => {
    render(
      <SimulatePanel source={MEASURE_FIGURE} active workerFactory={() => new InlineWorker()} />,
    );
    fireEvent.click(screen.getByTestId("sim-run"));
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-state", "done"),
    );
    const panel = await screen.findByTestId("sim-measures");
    let rows = rowsOf(panel);
    expect(rows.map((r) => [r.name, r.error])).toEqual([
      ["trise", "0"],
      ["never", "1"],
    ]);
    // 10–90 % de um RC com τ = 1 ms ≈ 2,2 ms
    expect(rows[0].text).toContain("2.2 ms");
    expect(rows[0].text).toMatch(/trig 10\d µs · targ 2\.3 ms/);
    expect(rows[1].text).toContain("out of interval (WHEN)");

    // slider: R1 → 2k dobra τ; o valor acompanha o re-run, a falha continua lá
    const fig = await screen.findByTestId("sim-figure");
    const pad = await waitFor(() => {
      const p = fig.querySelector('.sim-hit-el[data-el="R1"]');
      expect(p).not.toBeNull();
      return p!;
    });
    // abrir o slider re-renderiza e monta a 2ª instância do painel: sem recalcular
    const spy = vi.mocked(measureRows);
    const before = spy.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    fireEvent.click(pad);
    expect(spy.mock.calls.length).toBe(before);
    // celular: o sheet do slider traz as medidas no topo (acima dos controles)
    expect(screen.getByTestId("sim-slider-top")).toContainElement(
      screen.getAllByTestId("sim-measures")[1],
    );
    const input = screen.getByTestId("sim-slider-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2k" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("sim-status")).toHaveAttribute("data-rerun", "1"),
    );
    await waitFor(() =>
      expect(rowsOf(screen.getAllByTestId("sim-measures")[0])[0].text).toContain("4.39 ms"),
    );
    rows = rowsOf(screen.getAllByTestId("sim-measures")[0]);
    expect(rows[1]).toMatchObject({ name: "never", error: "1" });
    // o re-run (um run novo) recalcula UMA vez para as duas instâncias
    expect(spy.mock.calls.length).toBe(before + 1);
  });
});

describe("probe nos terminais (issue #21)", () => {
  it("figura pino a pino: alvo em cada terminal; clicar liga/desliga v(rede); corpo = slider", async () => {
    render(<SimulatePanel source={PIN_FIGURE} active workerFactory={() => new InlineWorker()} />);
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
    expect(legendText()).toContain("v(n2)");
    // n1/n2 não têm forma no mapa: os alvos são os terminais
    const pin = await waitFor(() => {
      const p = fig.querySelector<SVGGElement>('.sim-hit-pin[data-net="n2"]');
      expect(p).not.toBeNull();
      return p!;
    });
    expect(fig.querySelectorAll('.sim-hit-pin[data-net="n2"]')).toHaveLength(1); // R1.N = R2.P
    expect(fig.querySelectorAll('.sim-hit-pin[data-net="n1"]')).toHaveLength(1); // V1.P = R1.P
    expect(fig.querySelector('.sim-hit-pin[data-net="0"]')).toBeNull(); // terra não sonda
    expect(fig.querySelector('.sim-hit:not(.sim-hit-pin)[data-net="n2"]')).toBeNull();
    // na ponta do resistor R1 (o fim do zigue-zague desenhado), por cima da caixa do elemento
    const circle = pin.querySelector("circle")!;
    const r1 = fig.querySelector('[id="s10"] polyline, [id="s9"] polyline, [id="s11"] polyline');
    const last = r1?.getAttribute("points")?.trim().split(/\s+/).at(-1)?.split(",").map(Number);
    expect(last).toBeDefined();
    expect(Number(circle.getAttribute("cx"))).toBeCloseTo(last![0], 3);
    expect(Number(circle.getAttribute("cy"))).toBeCloseTo(last![1], 3);
    expect(pin.parentNode?.lastChild).toBe(fig.querySelector(".sim-hit-pin:last-of-type"));
    // teclado: a rede sem forma tem o alvo no 1º terminal
    expect(pin.getAttribute("role")).toBe("button");
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(pin.classList.contains("sim-pin-on")).toBe(true);

    fireEvent.click(circle);
    expect(legendText()).not.toContain("v(n2)");
    expect(legendText()).toContain("v(n1)");
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    expect(pin.classList.contains("sim-pin-on")).toBe(false);
    fireEvent.keyDown(pin, { key: "Enter" });
    expect(legendText()).toContain("v(n2)");
    expect(pin.style.getPropertyValue("--probe-color")).toMatch(/var\(--color-trace-\d\)/);
    // o corpo do elemento continua abrindo o slider
    fireEvent.click(fig.querySelector('.sim-hit-el[data-el="R1"]')!);
    expect(screen.getByTestId("sim-slider")).toHaveAttribute("data-refdes", "R1");
  });

  it("figura com fios: os terminais somam alvos à rede, o fio segue sendo o alvo de teclado", async () => {
    render(<SimulatePanel source={RC_FIGURE} active workerFactory={() => new InlineWorker()} />);
    fireEvent.click(screen.getByTestId("sim-run"));
    const fig = await screen.findByTestId("sim-figure");
    await waitFor(() =>
      expect(fig.querySelectorAll('.sim-hit-pin[data-net="Vout"]').length).toBeGreaterThan(0),
    );
    expect(fig.querySelectorAll('.sim-hit[data-net="Vout"][role="button"]')).toHaveLength(1);
    expect(fig.querySelector('.sim-hit-pin[data-net="Vout"]')?.hasAttribute("role")).toBe(false);
  });
});
