import { test, expect } from "@playwright/test";

// Modo visual: a tela de nós GERA pic; o preview (WASM real no browser) reflete.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
  // Trocar do exemplo de boas-vindas para o visual substitui o código: aceitar.
  page.on("dialog", (d) => d.accept());
});

test("adicionar forma no visual gera pic e o preview renderiza", async ({ page }) => {
  await page.getByTestId("mode-visual").click();
  await expect(page.getByTestId("visual-canvas")).toBeVisible();

  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-node")).toHaveCount(1);
  // rótulo padrão "Text" aparece no diagrama compilado
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Text", {
    timeout: 5_000,
  });

  // editar o rótulo pelo inspetor → preview atualiza
  const label = page.getByTestId("visual-label-input");
  await label.fill("Alpha");
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Alpha", {
    timeout: 5_000,
  });
});

test("losango preenchido e volta ao código mostram o pic gerado", async ({ page }) => {
  await page.getByTestId("mode-visual").click();
  await page.getByTestId("visual-add-diamond").click();
  await expect(page.getByTestId("visual-node")).toHaveCount(1);

  // voltar ao código: CodePane traz o pic gerado + o grafo embutido
  await page.getByTestId("mode-code").click();
  const code = page.getByTestId("code-pane");
  await expect(code).toContainText("N1: line from");
  await expect(code).toContainText("rpic-studio:visual");
  // banner de aviso no modo código
  await expect(page.getByTestId("visual-code-banner")).toBeVisible();
});

test("conectar dois nós por arraste cria uma seta", async ({ page }) => {
  await page.getByTestId("mode-visual").click();
  await page.getByTestId("visual-add-box").click();
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-node")).toHaveCount(2);

  const nodes = page.getByTestId("visual-node");
  // conecta: arrasta da alça do nó B até o canto sup-esquerdo do nó A (dentro
  // de A, fora da área que B sobrepõe no cascade → alvo inequívoco).
  const handleB = (await page.getByTestId("visual-connect-handle").nth(1).boundingBox())!;
  const a = (await nodes.nth(0).boundingBox())!;
  await page.mouse.move(handleB.x + handleB.width / 2, handleB.y + handleB.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 14, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId("visual-edge")).toHaveCount(1);
  // e o pic gerado tem a seta
  await page.getByTestId("mode-code").click();
  await expect(page.getByTestId("code-pane")).toContainText("arrow from");
});

test("o grafo sobrevive a reload (embutido no source do rascunho)", async ({ page }) => {
  await page.getByTestId("mode-visual").click();
  await page.getByTestId("visual-add-ellipse").click();
  await page.getByTestId("visual-label-input").fill("Persist");
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Persist", {
    timeout: 5_000,
  });

  // autosave (debounce 500ms) → reload
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForSelector('[data-testid="visual-canvas"]', { timeout: 20_000 });
  await expect(page.getByTestId("visual-node")).toHaveCount(1);
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText("Persist", {
    timeout: 5_000,
  });
});
