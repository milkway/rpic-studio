import { test, expect, type Page } from "@playwright/test";

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
