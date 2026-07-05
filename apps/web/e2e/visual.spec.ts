import { test, expect } from "@playwright/test";

// Edição visual SOBRE o render real (painel direito): barra de ícones adiciona
// formas, alças sobre o diagrama movem/conectam; o código pic fica sempre ao
// vivo à esquerda. O grafo viaja embutido no source.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
  // Adicionar forma sobre o exemplo de boas-vindas substitui o código: aceitar.
  page.on("dialog", (d) => d.accept());
});

test("adicionar forma gera pic (código à esquerda) e alça sobre o render", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("code-pane")).toContainText("N1: box", { timeout: 5_000 });
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Text", {
    timeout: 5_000,
  });
  await expect(page.getByTestId("visual-handle")).toHaveCount(1, { timeout: 5_000 });
});

test("clicar a alça abre o inspetor; editar rótulo atualiza código e render", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  const handle = page.getByTestId("visual-handle").first();
  await expect(handle).toBeVisible({ timeout: 5_000 });
  await handle.click();
  await page.getByTestId("visual-label-input").fill("Alpha");
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Alpha", {
    timeout: 5_000,
  });
  await expect(page.getByTestId("code-pane")).toContainText('box "Alpha"');
});

test("conectar dois nós pela alça cria uma seta", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-handle")).toHaveCount(2, { timeout: 5_000 });

  const from = (await page.getByTestId("visual-connect-handle").nth(0).boundingBox())!;
  const toBox = (await page.getByTestId("visual-handle").nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId("code-pane")).toContainText("arrow from", { timeout: 5_000 });
  await expect(page.getByTestId("visual-edge-marker")).toHaveCount(1);
});

test("o grafo sobrevive a reload (embutido no source do rascunho)", async ({ page }) => {
  await page.getByTestId("visual-add-ellipse").click();
  const handle = page.getByTestId("visual-handle").first();
  await expect(handle).toBeVisible({ timeout: 5_000 });
  await handle.click();
  await page.getByTestId("visual-label-input").fill("Persist");
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Persist", {
    timeout: 5_000,
  });

  await page.waitForTimeout(700); // autosave (debounce 500ms)
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
  await expect(page.getByTestId("visual-handle")).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Persist");
});
