import { test, expect } from "@playwright/test";

// Limpa o rascunho para cada teste partir do exemplo de boas-vindas.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
});

test("paleta de circuitos insere um resistor e a biblioteca compila", async ({ page }) => {
  // Parte de um documento vazio para o snippet ficar fácil de checar.
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type(".PS\n.PE");

  await page.getByTestId("circuits-menu").click();
  await expect(page.getByTestId("circuits-palette")).toBeVisible();
  await page.getByTestId("circuit-el-resistor").click();

  // O code-pane ganhou `copy "circuits"` e a chamada do macro.
  await expect(code).toContainText('copy "circuits"');
  await expect(code).toContainText("resistor(");

  // O preview compila sem erro (biblioteca auto-carregada).
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok", {
    timeout: 5_000,
  });
});

test("inserir dois elementos não colide nomes de ponto", async ({ page }) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type(".PS\n.PE");

  await page.getByTestId("circuits-menu").click();
  await page.getByTestId("circuit-el-resistor").click();

  await page.getByTestId("circuits-menu").click();
  await page.getByTestId("circuit-el-capacitor").click();

  // Só um `copy "circuits"` (idempotente), mas os dois elementos presentes.
  const text = (await code.textContent()) ?? "";
  expect(text.match(/copy\s+"circuits"/g)?.length).toBe(1);
  expect(text).toContain("resistor(");
  expect(text).toContain("capacitor(");

  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok", {
    timeout: 5_000,
  });
});
