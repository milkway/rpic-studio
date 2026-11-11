import { test, expect, type Page } from "@playwright/test";
import { MEASURE_FIGURE, PIN_FIGURE, RLC_FIGURE } from "../src/test/fixtures-sim";

// Figura RC do corpus do dune (corpus/pic/rc.pic).
const RC = `.PS
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

async function openWith(
  page: Page,
  source: string,
  theme: "light" | "dark",
  loadedMark = "spice = 1",
) {
  await page.goto("/");
  await page.evaluate(
    ([src, th]) => {
      localStorage.clear();
      localStorage.setItem(
        "rpic:draft.v1",
        JSON.stringify({ source: src, circuits: true, savedAt: new Date().toISOString() }),
      );
      localStorage.setItem("rpic:theme.v1", th);
      localStorage.setItem("rpic:locale.v1", "en");
    },
    [source, theme] as const,
  );
  await page.reload();
  await expect(page.locator('[data-testid="code-pane"] .cm-content')).toContainText(loadedMark);
}

for (const theme of ["light", "dark"] as const) {
  test(`Simulate roda a figura RC no worker e mostra forma de onda + netlist (${theme})`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWith(page, RC, theme);

    // o wasm do dune só é buscado quando o painel RODA
    const duneRequests: string[] = [];
    page.on("request", (r) => {
      if (/dune_wasm_bg.*\.wasm/.test(r.url())) duneRequests.push(r.url());
    });

    await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
    await expect(page.getByTestId("simulate-panel")).toBeVisible();
    expect(duneRequests).toHaveLength(0);

    await page.getByTestId("sim-run").click();
    await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
      timeout: 20_000,
    });
    expect(duneRequests.length).toBeGreaterThan(0);

    // V e A em gráficos separados (um eixo y por unidade)
    await expect(page.getByTestId("sim-chart-svg")).toHaveCount(2);
    await expect(page.getByTestId("sim-trace-0")).toHaveAttribute("d", /^M/);
    await expect(page.getByTestId("sim-legend").first()).toContainText(/v\(vout\)/i);
    await expect(page.getByTestId("sim-netlist-code")).toContainText("R1 Vin Vout 1k");
    const fig = page.getByTestId("sim-figure");
    await expect(fig.locator("svg")).toBeVisible();

    await page.screenshot({ path: info.outputPath(`simulate-${theme}.png`) });

    // hover na legenda de v(vout) → realce na figura + crosshair no gráfico
    const vout = page.getByTestId("sim-legend").locator("li", { hasText: /v\(vout\)/i });
    await expect(vout).toHaveCount(1);
    await vout.hover();
    await expect(fig).toHaveClass(/has-hl/);
    await expect(fig.locator(".sim-hl").first()).toBeAttached();
    const chart = page.getByTestId("sim-chart-svg").first();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
    await expect(page.getByTestId("sim-tooltip")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`simulate-${theme}-crosshair.png`) });
    await page.getByTestId("sim-netlist-code").locator("div", { hasText: /^R1 / }).hover();
    await expect(fig).toHaveClass(/has-hl/);
    await page.screenshot({ path: info.outputPath(`simulate-${theme}-hover.png`) });
  });
}

test("Cancelar termina uma simulação longa; o worker novo roda a seguinte", async ({ page }) => {
  // passo máximo de 1 ns em 5 ms: 5e6 pontos (sob o orçamento do dune) — ~8 s
  // de simulação; o teste cancela bem antes
  await openWith(page, RC.replace(".tran 20u 5m", ".tran 1n 5m 0 1n"), "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "running");
  await expect(page.getByTestId("sim-status")).toContainText(/\d\.\d s/);
  await page.waitForTimeout(600);
  await page.getByTestId("sim-cancel").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "cancelled");
  // UI viva (o main thread nunca travou) e a próxima execução funciona
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.insertText(RC);
  await expect(page.getByTestId("sim-stale")).toBeVisible();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  // trocar de aba e voltar mantém o resultado
  await page.getByRole("tab", { name: "SVG" }).click();
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await expect(page.getByTestId("sim-chart-svg").first()).toBeVisible();
});

test("diagnóstico de extração pula o editor para a linha", async ({ page }) => {
  const bad =
    ".PS\nspice = 1\nV1: vsource((0,1),(0,0), 1)\nR1: resistor((0,1),(0,0))\nground((0,0))\n.op\n.PE\n";
  await openWith(page, bad, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-error")).toHaveAttribute("data-kind", "pic", {
    timeout: 20_000,
  });
  await page.getByTestId("sim-diagnostics").getByRole("button").first().click();
  // o cursor do CodeMirror foi para a linha 4 (R1 sem valor)
  await expect(page.locator(".cm-activeLine")).toContainText("R1: resistor");
});

test("mobile 390px: aba SIM + painel não alargam a página", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWith(page, RC, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("sim-chart-svg").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByTestId("sim-run")).toBeEnabled();
  await page.screenshot({ path: info.outputPath("simulate-mobile.png") });
});

// Duas etapas RC com fios explícitos nas redes A e Out (alvo do probe).
const RC2 = `.PS
spice = 1
In: (0,1.5); A: (2.25,1.5); Out: (4.5,1.5)
V1: vsource(In, (0,0), PULSE(0 5 0 1u 1u 10m 20m))
R1: resistor(In, (1.5,1.5), 1k)
line from (1.5,1.5) to A
C1: capacitor(A, (2.25,0), 1u)
R2: resistor(A, (3.75,1.5), 4.7k)
line from (3.75,1.5) to Out
C2: capacitor(Out, (4.5,0), 470n)
line from (0,0) to (4.5,0)
ground((1.125,0))
dot at In; dot at A; dot at Out
.tran 20u 12m
.PE
`;

/** Centro (px de página) do 1º clone de acerto da rede — o fio. Um fio
 *  horizontal tem altura 0: o Playwright o acha "invisível", daí o mouse. */
async function netPoint(page: Page, net: string) {
  return page
    .locator(`.sim-hit[data-net="${net}"]`)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
}

test("probe: clicar num fio liga/desliga v(rede); hover realça; toque no celular", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RC2, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  const legend = page.getByTestId("sim-legend");
  await expect(legend.first()).toContainText("v(a)");
  const fig = page.getByTestId("sim-figure");
  const a = await netPoint(page, "A");

  // hover a poucos px do fio (traço de acerto largo): cursor de mão + realce
  await page.mouse.move(a.x, a.y + 4);
  await expect(fig).toHaveClass(/has-hl/);
  expect(
    await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)!).cursor, {
      x: a.x,
      y: a.y + 4,
    }),
  ).toBe("pointer");

  // clique desliga v(a); o fio perde a cor do traço; clique liga de novo
  await page.mouse.click(a.x, a.y + 4);
  await expect(legend.filter({ hasText: "v(a)" })).toHaveCount(0);
  await expect(page.locator('.sim-hit[data-net="A"][role="button"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.mouse.click(a.x, a.y + 4);
  await expect(legend.first()).toContainText("v(a)");
  await expect(fig.locator(".sim-probe").first()).toBeAttached();
  await page.mouse.move(5, 5);
  await page.screenshot({ path: info.outputPath("simulate-probe.png") });

  // teclado: Tab até o alvo da rede, Enter alterna
  await page.locator('.sim-hit[data-net="Out"][role="button"]').focus();
  await page.keyboard.press("Enter");
  await expect(legend.filter({ hasText: "v(out)" })).toHaveCount(0);
});

test("probe no celular (toque) não alarga a página", async ({ browser }, info) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openWith(page, RC2, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  const out = await netPoint(page, "Out");
  // o toque a alguns px do fio ainda acerta (caixa de toque + ajuste do Chromium)
  await page.touchscreen.tap(out.x, out.y + 6);
  await expect(page.getByTestId("sim-legend").filter({ hasText: "v(out)" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath("simulate-probe-mobile.png") });
  await ctx.close();
});

test("scrubber do .tran: arrastar e animar o cursor de tempo", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RC2, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  const time = page.getByTestId("sim-scrubber-time");
  await expect(time).toHaveText("—");
  await page.getByTestId("sim-scrubber-range").fill("500");
  await expect(time).toHaveText("6 ms");
  await expect(page.getByTestId("sim-cursor").first()).toBeVisible();
  await expect(page.getByTestId("sim-legend-value").first()).toContainText(/= .* V/);
  await page.screenshot({ path: info.outputPath("simulate-scrubber.png") });
  // play varre até o fim (12 ms) e para sozinho
  await page.getByTestId("sim-scrubber-play").click();
  await expect(time).toHaveText("12 ms", { timeout: 8_000 });
  await expect(page.getByTestId("sim-scrubber-play")).toHaveAttribute("aria-pressed", "false");
});

// ---- sliders: clicar num componente ajusta o valor e re-roda a sessão ----

/** Centro (px de página) da caixa de acerto de um elemento ajustável. */
async function elementPoint(page: Page, refdes: string) {
  return page.locator(`.sim-hit-el[data-el="${refdes}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}

/** Os `d` de todos os traços desenhados (assinatura do gráfico). */
const traceDs = (page: Page) =>
  page
    .locator('[data-testid^="sim-trace-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("d") ?? "").join("|"));

async function runRC(page: Page) {
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  await expect(page.locator('.sim-hit-el[data-el="R1"]')).toBeAttached();
}

test("slider: clicar no resistor abre o slider ancorado; arrastar muda o gráfico ao vivo", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RC, "light");
  const duneRequests: string[] = [];
  page.on("request", (r) => {
    if (/dune_wasm_bg.*\.wasm/.test(r.url())) duneRequests.push(r.url());
  });
  await runRC(page);
  const loads = duneRequests.length;
  // a fonte só com PULSE (sem DC) não tem slider
  await expect(page.locator('.sim-hit-el[data-el="V1"]')).toHaveCount(0);

  const r1 = await elementPoint(page, "R1");
  await page.mouse.click(r1.x, r1.y);
  const slider = page.getByTestId("sim-slider");
  await expect(slider).toBeVisible();
  await expect(slider).toHaveAttribute("data-refdes", "R1");
  await expect(page.getByTestId("sim-slider-input")).toHaveValue("1k");
  // ancorado SOB o elemento
  const box = (await slider.boundingBox())!;
  expect(box.y).toBeGreaterThan(r1.y);
  expect(Math.abs(box.x + box.width / 2 - r1.x)).toBeLessThan(box.width / 2);

  // arrastar o slider para a direita: o gráfico muda a cada passo, sem soltar
  const before = await traceDs(page);
  const range = page.getByTestId("sim-slider-range");
  const rb = (await range.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.7, rb.y + rb.height / 2, { steps: 8 });
  await expect.poll(() => traceDs(page)).not.toBe(before);
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-rerun", "1");
  const mid = await traceDs(page);
  await page.mouse.move(rb.x + rb.width * 0.95, rb.y + rb.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => traceDs(page)).not.toBe(mid);
  // mesma sessão: nada de wasm novo
  expect(duneRequests.length).toBe(loads);
  await page.screenshot({ path: info.outputPath("simulate-slider.png") });
});

/** O texto do editor (CodeMirror), linha a linha. */
const editorLine = (page: Page, prefix: string) =>
  page
    .locator('[data-testid="code-pane"] .cm-line')
    .evaluateAll(
      (els, p) => els.map((e) => e.textContent ?? "").find((l) => l.startsWith(p)) ?? null,
      prefix,
    );

test("slider: soltar escreve o valor no código; o gráfico segue e o elemento não fica alterado (#22)", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RC, "light");
  await runRC(page);
  const r1 = await elementPoint(page, "R1");
  await page.mouse.click(r1.x, r1.y);
  const input = page.getByTestId("sim-slider-input");
  await expect(input).toHaveValue("1k");

  // arrastando: só a simulação muda (alterado), o código não
  const before = await traceDs(page);
  const range = page.getByTestId("sim-slider-range");
  const rb = (await range.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width * 0.8, rb.y + rb.height / 2, { steps: 8 });
  await expect.poll(() => traceDs(page)).not.toBe(before);
  await expect(page.getByTestId("sim-altered-chip")).toContainText("1 altered");
  expect(await editorLine(page, "R1:")).toBe("R1: resistor(Vin, Vout, 1k)");

  // soltar: o código segue o slider; sem chip/itálico, sem "código mudou"
  await page.mouse.up();
  const value = await input.inputValue();
  expect(value).not.toBe("1k");
  await expect.poll(() => editorLine(page, "R1:")).toBe(`R1: resistor(Vin, Vout, ${value})`);
  await expect(page.getByTestId("sim-writeback")).toHaveAttribute("data-ok", "1");
  await expect(page.getByTestId("sim-altered-chip")).toHaveCount(0);
  await expect(page.getByTestId("sim-stale")).toHaveCount(0);
  await expect(page.getByTestId("sim-slider-reset")).toBeDisabled();
  const fig = page.getByTestId("sim-figure");
  await expect(fig.locator(".sim-altered")).toHaveCount(0);
  await expect(fig.locator("text", { hasText: new RegExp(`^${value}$`) })).toHaveCount(1);
  await expect(page.getByTestId("sim-netlist-code")).toContainText(`R1 Vin Vout ${value}`);
  const written = await traceDs(page);
  expect(written).not.toBe(before);

  // o gráfico é o de uma execução FRESCA do código novo
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-rerun", "0");
  await expect.poll(() => traceDs(page)).toBe(written);
  await page.screenshot({ path: info.outputPath("simulate-writeback.png") });

  // o undo do editor reverte a escrita (e a simulação fica marcada como velha)
  await page.locator('[data-testid="code-pane"] .cm-content').click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => editorLine(page, "R1:")).toBe("R1: resistor(Vin, Vout, 1k)");
  await expect(page.getByTestId("sim-stale")).toBeVisible();
  await page.getByTestId("sim-run").click();
  await expect.poll(() => traceDs(page)).toBe(before);
});

test("slider de fonte sob .ac move acmag: o Bode muda e o código ganha AC x (#22)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RLC_FIGURE, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  // o gráfico se re-escala sozinho: a forma do Bode não muda com a magnitude,
  // os TICKS do eixo y (texto do gráfico) sim
  const ticks = () =>
    page.getByTestId("sim-chart-svg").evaluateAll((els) => els.map((e) => e.textContent).join("|"));
  const before = await ticks();
  const v1 = await elementPoint(page, "V1");
  await page.mouse.click(v1.x, v1.y);
  const slider = page.getByTestId("sim-slider");
  await expect(slider).toHaveAttribute("data-refdes", "V1");
  await expect(slider).toContainText("acmag");
  await expect(page.getByTestId("sim-slider-keyword")).toHaveText("AC");
  const input = page.getByTestId("sim-slider-input");
  await expect(input).toHaveValue("1");
  await input.fill("10");
  await input.press("Enter");
  await expect.poll(ticks).not.toBe(before);
  await expect.poll(() => editorLine(page, "V1:")).toBe("V1: vsource(In, (0,0), AC 10)");
  await expect(page.getByTestId("sim-altered-chip")).toHaveCount(0);
});

test("slider: teclado escreve no fim do passo; valor não-literal fica alterado e reset/reset-all voltam", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // R1 com expressão SPICE `{1000}`: não é número literal → sem escrita de volta
  await openWith(
    page,
    RC.replace("R1: resistor(Vin, Vout, 1k)", "R1: resistor(Vin, Vout, {1000})"),
    "dark",
  );
  await runRC(page);
  const original = await traceDs(page);

  // teclado: Tab até o alvo do elemento e Enter abre; o foco vai ao slider
  await page.locator('.sim-hit-el[data-el="C1"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sim-slider")).toHaveAttribute("data-refdes", "C1");
  await expect(page.getByTestId("sim-slider-range")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("sim-slider-input")).toHaveValue("1.21u");
  await expect.poll(() => traceDs(page)).not.toBe(original);
  // o passo terminou (tecla solta): escrito, não alterado
  await expect.poll(() => editorLine(page, "C1:")).toBe("C1: capacitor(Vout, (2.5,0), 1.21u)");
  await expect(page.getByTestId("sim-altered-chip")).toHaveCount(0);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => editorLine(page, "C1:")).toBe("C1: capacitor(Vout, (2.5,0), 1u)");
  await expect.poll(() => traceDs(page)).toBe(original);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sim-slider")).toHaveCount(0);
  // a figura do fonte escrito (`1u`, sem rótulo reescrito de "alterado") chega
  // num re-run próprio, antes OU depois do Esc: espera ela, e o foco tem de ter
  // sobrevivido ao redesenho (#26) — e o clique em R1 abaixo mede a figura final
  await expect
    .poll(() =>
      page
        .getByTestId("sim-figure")
        .evaluate(
          (fig) =>
            [...fig.querySelectorAll("text")].some((t) => t.textContent === "1u") &&
            fig.querySelector("text[data-orig-text], .sim-altered") === null,
        ),
    )
    .toBe(true);
  await expect(page.locator('.sim-hit-el[data-el="C1"]')).toBeFocused();

  // R1 não-literal: fica alterado (chip, itálico) e a linha de status explica
  const r1 = await elementPoint(page, "R1");
  await page.mouse.click(r1.x, r1.y);
  const input = page.getByTestId("sim-slider-input");
  await input.fill("4.7k");
  await input.press("Enter");
  await expect(page.getByTestId("sim-writeback")).toHaveAttribute("data-ok", "0");
  await expect(page.getByTestId("sim-writeback")).toContainText("not a plain number");
  expect(await editorLine(page, "R1:")).toBe("R1: resistor(Vin, Vout, {1000})");
  await expect(page.getByTestId("sim-altered-chip")).toContainText("1 altered");
  const label = page.locator('[data-testid="sim-figure"] .sim-altered text').first();
  await expect(label).toHaveCSS("font-style", "italic");
  await expect.poll(() => traceDs(page)).not.toBe(original);
  await page.getByTestId("sim-slider-reset").click();
  await expect(page.getByTestId("sim-altered-chip")).toHaveCount(0);
  await expect.poll(() => traceDs(page)).toBe(original);
  await page.getByTestId("sim-slider-range").press("PageUp");
  await page.getByTestId("sim-altered-chip").click();
  await expect(page.getByTestId("sim-altered-list")).toContainText("R1");
  await page.getByTestId("sim-reset-all").click();
  await expect(page.getByTestId("sim-altered-chip")).toHaveCount(0);
  await expect.poll(() => traceDs(page)).toBe(original);
  await expect(page.locator('[data-testid="sim-figure"] .sim-altered')).toHaveCount(0);
});

test("slider no celular: bottom sheet, toque abre, sem overflow horizontal", async ({
  browser,
}, info) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openWith(page, RC2, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  const r2 = await elementPoint(page, "R2");
  await page.touchscreen.tap(r2.x, r2.y);
  const sheet = page.getByTestId("sim-slider");
  await expect(sheet).toHaveAttribute("data-refdes", "R2");
  const b = (await sheet.boundingBox())!;
  expect(Math.round(b.x)).toBe(0);
  expect(Math.round(b.width)).toBe(390);
  expect(Math.round(b.y + b.height)).toBe(844);
  const before = await traceDs(page);
  await page.getByTestId("sim-slider-range").fill("700");
  await expect.poll(() => traceDs(page)).not.toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath("simulate-slider-mobile.png") });
  await ctx.close();
});

test("preview de fonte spice usa o prelude do dune: sem erro falso, e o SIM simula (#17)", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const duneRequests: string[] = [];
  page.on("request", (r) => {
    if (/dune_wasm_bg.*\.wasm/.test(r.url())) duneRequests.push(r.url());
  });
  await openWith(page, RLC_FIGURE, "light");
  // uma fonte spice abre na aba Simular (#40): a figura está na aba Imagem
  await page.getByRole("tab", { name: /^(Image|IMG)$/ }).click();
  const stage = page.getByTestId("preview-stage");
  await expect(stage.locator('svg g[id="s0"]')).toBeAttached({ timeout: 20_000 });
  // além da carência do "vermelho preguiçoso" (600 ms): nenhum erro aparece
  await page.waitForTimeout(1_200);
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("compile-error")).toHaveCount(0);
  // o prelude é texto: o preview não baixa o wasm do dune
  expect(duneRequests).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("spice-preview-rlc.png") });

  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("sim-chart-svg").first()).toBeVisible();
  await expect(page.getByTestId("sim-netlist-code")).toContainText("V1 In 0 AC 1");
  await expect(page.getByTestId("compile-error")).toHaveCount(0);
});

test("fonte spice: elemento do prelude é inspecionável — duplo-clique pula para a linha da chamada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RLC_FIGURE, "light");
  // uma fonte spice abre na aba Simular (#40): a figura está na aba Imagem
  await page.getByRole("tab", { name: /^(Image|IMG)$/ }).click();
  const stage = page.getByTestId("preview-stage");
  await expect(stage.locator('svg g[id="s0"]')).toBeAttached({ timeout: 20_000 });
  await expect(page.getByTestId("objects-handle").first()).toBeAttached({ timeout: 5_000 });
  // rótulo de valor do R1 ("100"), desenhado DENTRO do macro `resistor` do prelude
  const label = stage.locator("svg text", { hasText: /^100$/ });
  const bb = (await label.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  // coordenadas pic funcionam (o mapeamento achou âncora)
  await expect(page.getByTestId("pic-coords")).toBeVisible({ timeout: 5_000 });
  await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const r1Line = RLC_FIGURE.split("\n").findIndex((l) => l.startsWith("R1: resistor")) + 1;
  await expect
    .poll(() => page.evaluate(() => document.querySelector(".cm-activeLineGutter")?.textContent))
    .toBe(String(r1Line));
});

test("sem `spice = 1` a mesma figura continua dando o erro do rpic (sem prelude)", async ({
  page,
}) => {
  await openWith(page, RLC_FIGURE.replace("spice = 1\n", ""), "light", "vsource");
  await expect(page.getByTestId("compile-error")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "error");
});

// ---- issues #19/#20/#21 ----

test("passos finos: alternar re-roda a sessão com mais pontos e persiste (#19)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RC, "light");
  await runRC(page);
  const before = await traceDs(page);
  const fine = page.getByTestId("sim-fine");
  await expect(fine).toHaveAttribute("aria-pressed", "false");
  await fine.click();
  await expect(fine).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-rerun", "1");
  await expect.poll(() => traceDs(page)).not.toBe(before);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("rpic:settings.v1")!).simFineSteps),
  ).toBe(true);
  // tooltip: modo de visualização, o deck não muda (o Radix não reabre logo
  // após o clique no gatilho: sai e volta)
  await page.mouse.move(5, 5);
  await fine.hover();
  await expect(page.getByRole("tooltip")).toContainText("the code and the netlist stay the deck's");
  await page.reload();
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await expect(page.getByTestId("sim-fine")).toHaveAttribute("aria-pressed", "true");
});

test("medidas .measure: valor, detalhe e falha; no celular ficam acima do sheet (#20)", async ({
  browser,
}, info) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openWith(page, MEASURE_FIGURE, "light");
  await runRC(page);
  const panel = page.getByTestId("sim-measures").first();
  await expect(panel).toBeVisible();
  const rows = panel.getByTestId("sim-measure");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("2.2 ms");
  await expect(rows.nth(0)).toContainText("trig");
  await expect(rows.nth(1)).toHaveAttribute("data-error", "1");
  await expect(rows.nth(1)).toContainText("out of interval (WHEN)");

  // abre o slider de R1 (bottom sheet): as medidas sobem para o topo do sheet
  await page.locator('.sim-hit-el[data-el="R1"]').dispatchEvent("click");
  const sheet = page.getByTestId("sim-slider");
  await expect(sheet).toBeVisible();
  const top = sheet.getByTestId("sim-measures");
  await expect(top).toBeVisible();
  const tb = (await top.boundingBox())!;
  const rb = (await page.getByTestId("sim-slider-range").boundingBox())!;
  expect(tb.y + tb.height).toBeLessThanOrEqual(rb.y);
  expect(tb.y).toBeGreaterThanOrEqual(0);
  // o valor acompanha o slider
  const input = page.getByTestId("sim-slider-input");
  await input.fill("2k");
  await input.press("Enter");
  await expect(top.getByTestId("sim-measure").first()).toContainText("4.39 ms");
  await expect(top.getByTestId("sim-measure").nth(1)).toHaveAttribute("data-error", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath("simulate-measures-mobile.png") });
  await ctx.close();
});

test("terminais: figura pino a pino sonda a rede no pino; corpo abre o slider (#21)", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, PIN_FIGURE, "light");
  await page.getByRole("tab", { name: /Simulate|SIM/ }).click();
  await page.getByTestId("sim-run").click();
  await expect(page.getByTestId("sim-status")).toHaveAttribute("data-state", "done", {
    timeout: 20_000,
  });
  const legend = page.getByTestId("sim-legend");
  await expect(legend.first()).toContainText("v(n2)");
  const pin = page.locator('.sim-hit-pin[data-net="n2"]');
  await expect(pin).toHaveCount(1);
  const c = await pin.evaluate((el) => {
    const r = el.querySelector("circle")!.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  });
  expect(c.w).toBeGreaterThanOrEqual(10); // alvo de toque, não um ponto de 1px
  // o pino ganha do corpo do elemento sob ele
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest(".sim-hit-pin")?.getAttribute("data-net"),
      c,
    ),
  ).toBe("n2");
  await page.mouse.click(c.x, c.y);
  await expect(legend.filter({ hasText: "v(n2)" })).toHaveCount(0);
  await page.mouse.click(c.x, c.y);
  await expect(legend.first()).toContainText("v(n2)");
  await page.screenshot({ path: info.outputPath("simulate-pins.png") });
  // o meio do resistor continua sendo o slider
  const r1 = await elementPoint(page, "R1");
  await page.mouse.click(r1.x, r1.y);
  await expect(page.getByTestId("sim-slider")).toHaveAttribute("data-refdes", "R1");
});
