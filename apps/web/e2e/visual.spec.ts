import { test, expect } from "@playwright/test";

// Edição visual SOBRE o render real (painel direito): barra de ícones adiciona
// formas, alças/âncoras sobre o diagrama movem/conectam; o código pic fica
// sempre ao vivo à esquerda e o grafo é reconstruído lendo esse código (parse).
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

test("conectar da âncora .e do nó A ao nó B cria a seta N1.e -> N2.w", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-handle")).toHaveCount(2, { timeout: 5_000 });
  await page.waitForTimeout(400); // deixa o layout assentar antes de medir

  const a = (await page.getByTestId("visual-handle").nth(0).boundingBox())!;
  const b = (await page.getByTestId("visual-handle").nth(1).boundingBox())!;
  // aproxima do lado leste do nó A → revela a âncora .e
  const ex = a.x + a.width - 3;
  const ey = a.y + a.height / 2;
  await page.mouse.move(ex, ey);
  await expect(page.getByTestId("visual-anchor-e")).toBeVisible({ timeout: 3_000 });
  // arrasta da âncora .e até o centro do nó B (à direita)
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId("code-pane")).toContainText("arrow from N1.e to N2.w", { timeout: 5_000 });
});

test("selecionar a seta pela linha e reancorar a ponta muda o lado", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-handle")).toHaveCount(2, { timeout: 5_000 });
  await page.waitForTimeout(400);
  const a = (await page.getByTestId("visual-handle").nth(0).boundingBox())!;
  const b = (await page.getByTestId("visual-handle").nth(1).boundingBox())!;
  // conecta A.e -> B
  await page.mouse.move(a.x + a.width - 3, a.y + a.height / 2);
  await expect(page.getByTestId("visual-anchor-e")).toBeVisible({ timeout: 3_000 });
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.25, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("code-pane")).toContainText("arrow from N1.e to N2.w", { timeout: 5_000 });

  // a seta é selecionável pela linha (sem "bola"); ao conectar já fica selecionada,
  // então as pontas de reancoragem aparecem
  await expect(page.getByTestId("visual-edge-hit")).toHaveCount(1);
  await expect(page.getByTestId("visual-endpoint-from")).toBeVisible({ timeout: 3_000 });
  // arrasta a ponta de origem para o TOPO do nó A → lado .n
  const from = (await page.getByTestId("visual-endpoint-from").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("code-pane")).toContainText("arrow from N1.n to N2.w", { timeout: 5_000 });
});

test("o grafo sobrevive a reload (reconstruído do código do rascunho)", async ({ page }) => {
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
