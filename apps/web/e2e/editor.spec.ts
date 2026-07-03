import { test, expect } from "@playwright/test";

// Limpa o rascunho para cada teste partir do exemplo de boas-vindas.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
});

test("digitar código re-renderiza o diagrama ao vivo", async ({ page }) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type('box "peabiru"');
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("peabiru", {
    timeout: 5_000,
  });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});

test("erro de sintaxe mostra o painel de diagnóstico e preserva o último SVG", async ({ page }) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type('box "ok"');
  // espera a compilação boa acontecer de fato (debounce de 200ms)
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("ok", {
    timeout: 5_000,
  });

  await page.keyboard.type("\nisto não é pic válido !!!");
  await expect(page.getByTestId("compile-error")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "error");
  // o último diagrama bom continua visível
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("ok");
});

test("circuitos ligam automaticamente quando o código usa a biblioteca", async ({ page }) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type("A:(0,0); B:(2,0)");
  await page.keyboard.press("Enter");
  await page.keyboard.type("resistor(A,B)");
  // o interruptor liga sozinho e o circuito compila
  await expect(page.locator("#circuits-switch")).toHaveAttribute("data-state", "checked");
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok", {
    timeout: 5_000,
  });
});

test("exemplo com animação exibe o botão de replay", async ({ page }) => {
  // o welcome (default sem rascunho) tem manifesto de animação
  await expect(page.getByTestId("replay-button")).toBeVisible();
});

test("abas SVG e Markdown mostram o código gerado", async ({ page }) => {
  await page.getByRole("tab", { name: "SVG" }).click();
  await expect(page.getByTestId("code-view-svg")).toContainText("<svg");
  await page.getByRole("tab", { name: "Markdown" }).click();
  await expect(page.getByTestId("code-view-markdown")).toContainText("![diagram](data:image");
  // documento estruturado: imagem embutida + bloco de código pic
  await expect(page.getByTestId("code-view-markdown")).toContainText("```pic");
});

test("abas Python e R trazem snippets dos bindings com o código atual", async ({ page }) => {
  await page.getByRole("tab", { name: "Python" }).click();
  await expect(page.getByTestId("code-view-python")).toContainText("import rpic");
  await expect(page.getByTestId("code-view-python")).toContainText("rpic.render_svg(src)");
  await expect(page.getByTestId("code-view-python")).toContainText("ellipse");

  await page.getByRole("tab", { name: "R", exact: true }).click();
  await expect(page.getByTestId("code-view-r")).toContainText("library(rpic)");
  await expect(page.getByTestId("code-view-r")).toContainText("rpic_svg(src)");
});
