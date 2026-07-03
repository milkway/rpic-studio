import { test, expect } from "@playwright/test";

test("baixa o código .pic e o vetor .svg", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });

  await page.getByTestId("export-button").click();
  const picDownload = page.waitForEvent("download");
  await page.getByTestId("export-pic").click();
  expect((await picDownload).suggestedFilename()).toBe("diagrama.pic");

  await page.getByTestId("export-button").click();
  const svgDownload = page.waitForEvent("download");
  await page.getByTestId("export-svg").click();
  expect((await svgDownload).suggestedFilename()).toBe("diagrama.svg");
});

test("galeria de exemplos abre um exemplo no editor", async ({ page }) => {
  await page.goto("/exemplos");
  await page.getByRole("button", { name: /Circuito RLC/ }).click();
  await page.waitForURL("**/");
  await expect(page.locator('[data-testid="code-pane"] .cm-content')).toContainText("resistor", {
    timeout: 20_000,
  });
  // a flag de circuitos veio junto
  await expect(page.locator("#circuits-switch")).toHaveAttribute("data-state", "checked");
});
