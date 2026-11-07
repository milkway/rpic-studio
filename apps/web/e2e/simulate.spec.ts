import { test, expect, type Page } from "@playwright/test";
import { RLC_FIGURE } from "../src/test/fixtures-sim";

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

async function openWith(page: Page, source: string, theme: "light" | "dark") {
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
  await expect(page.locator('[data-testid="code-pane"] .cm-content')).toContainText("spice = 1");
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

  // badge: rótulo da figura reescrito em itálico + chip
  const label = page.locator('[data-testid="sim-figure"] .sim-altered text').first();
  await expect(label).not.toHaveText("1k");
  await expect(label).toHaveCSS("font-style", "italic");
  await expect(page.getByTestId("sim-altered-chip")).toContainText("1 altered");
  await page.screenshot({ path: info.outputPath("simulate-slider.png") });
});

test("slider: teclado (setas/Home), reset e reset-all voltam o gráfico original", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWith(page, RC, "dark");
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
  await page.keyboard.press("Home");
  await expect(page.getByTestId("sim-slider-input")).toHaveValue("1u");
  await expect.poll(() => traceDs(page)).toBe(original); // sessão = execução fresca
  await page.keyboard.press("PageUp");
  await expect(page.getByTestId("sim-slider-input")).toHaveValue("10u");
  await page.getByTestId("sim-slider-reset").click();
  await expect(page.getByTestId("sim-slider-input")).toHaveValue("1u");
  await expect.poll(() => traceDs(page)).toBe(original);

  // dois elementos alterados (o campo aceita notação SPICE) → chip lista; reset all
  await page.keyboard.press("PageDown");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sim-slider")).toHaveCount(0);
  await expect(page.locator('.sim-hit-el[data-el="C1"]')).toBeFocused();
  const r1 = await elementPoint(page, "R1");
  await page.mouse.click(r1.x, r1.y);
  const input = page.getByTestId("sim-slider-input");
  await input.fill("4.7k");
  await input.press("Enter");
  await expect(page.getByTestId("sim-altered-chip")).toContainText("2 altered");
  await page.getByTestId("sim-altered-chip").click();
  await expect(page.getByTestId("sim-altered-list")).toContainText("R1");
  await expect(page.getByTestId("sim-altered-list")).toContainText("C1");
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

test("sem `spice = 1` a mesma figura continua dando o erro do rpic (sem prelude)", async ({ page }) => {
  const unmarked = RLC_FIGURE.replace("spice = 1\n", "");
  await page.goto("/");
  await page.evaluate((src) => {
    localStorage.clear();
    localStorage.setItem(
      "rpic:draft.v1",
      JSON.stringify({ source: src, circuits: true, savedAt: new Date().toISOString() }),
    );
    localStorage.setItem("rpic:locale.v1", "en");
  }, unmarked);
  await page.reload();
  await expect(page.locator('[data-testid="code-pane"] .cm-content')).toContainText("vsource");
  await expect(page.getByTestId("compile-error")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "error");
});
