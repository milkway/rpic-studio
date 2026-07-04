import { test, expect } from "@playwright/test";

test("baixa o código .pic e o vetor .svg", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });

  await page.getByTestId("export-button").click();
  const picDownload = page.waitForEvent("download");
  await page.getByTestId("export-pic").click();
  expect((await picDownload).suggestedFilename()).toBe("diagram.pic");

  await page.getByTestId("export-button").click();
  const svgDownload = page.waitForEvent("download");
  await page.getByTestId("export-svg").click();
  expect((await svgDownload).suggestedFilename()).toBe("diagram.svg");
});

test("galeria de exemplos abre um exemplo no editor", async ({ page }) => {
  await page.goto("/exemplos");
  await page.getByTestId("example-open-rlc").click();
  await page.waitForURL("**/");
  await expect(page.locator('[data-testid="code-pane"] .cm-content')).toContainText("resistor", {
    timeout: 20_000,
  });
  // a flag de circuitos veio junto
  await expect(page.locator("#circuits-switch")).toHaveAttribute("data-state", "checked");
});

test("galeria: filtro por badge e código visível no cartão", async ({ page }) => {
  await page.goto("/exemplos");
  // o código aparece no cartão (con highlight)
  await expect(
    page.getByTestId("example-pipeline").locator(".cm-content"),
  ).toContainText("TROFF", { timeout: 20_000 });

  // filtra por Circuits: só exemplos de circuito ficam visíveis
  await page.getByTestId("tag-filter").getByRole("button", { name: /Circuits/ }).click();
  await expect(page.getByTestId("example-rlc")).toBeVisible();
  await expect(page.getByTestId("example-pipeline")).toHaveCount(0);
});

test("galeria: exemplo animado tem botão de replay que toca a animação", async ({ page }) => {
  await page.goto("/exemplos");
  const welcome = page.getByTestId("example-welcome");
  await expect(welcome.locator(".rpic-stage svg")).toBeVisible({ timeout: 20_000 });

  const replay = welcome.getByTestId("thumb-replay");
  await expect(replay).toBeVisible();
  // sem replay, o SVG estático não tem estilos inline
  expect(await welcome.locator(".rpic-stage svg [style]").count()).toBe(0);
  await replay.click();
  // a timeline GSAP aplica estilos inline (transform/opacity) nos grupos
  await expect
    .poll(async () => welcome.locator(".rpic-stage svg [style]").count(), { timeout: 3_000 })
    .toBeGreaterThan(0);

  // exemplo sem animação não mostra o botão
  await expect(page.getByTestId("example-pipeline").getByTestId("thumb-replay")).toHaveCount(0);
});
