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

test("typo em comando mostra sugestão e o clique pula para o erro", async ({ page }) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type('box "a"\nbxo "b"');

  // mensagem humanizada + sugestão de correção
  await expect(page.getByTestId("compile-error")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("compile-error-suggestion")).toContainText(/box/);

  // clique na linha pula o cursor para a posição do erro
  await page.getByTestId("compile-error-jump").click();
  const cursorLine = await page.evaluate(() => {
    const active = document.querySelector(".cm-activeLineGutter");
    return active?.textContent;
  });
  expect(cursorLine).toBe("2");
});

test("atributo com typo gera warning com sugestão, sem quebrar o diagrama", async ({ page }) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type('box "a" dashd');

  // compila (warning, não erro) e o aviso aparece com a correção
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("compile-warning-0")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("compile-warning-0-suggestion")).toContainText("dashed");
});

test("circuitos ligam automaticamente quando o código usa a biblioteca", async ({ page }) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type("A:(0,0); B:(2,0)");
  await page.keyboard.press("Enter");
  await page.keyboard.type("resistor(A,B)");
  // o circuito compila (biblioteca auto-carregada, sem interruptor)
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok", {
    timeout: 5_000,
  });
  // o status "ativo" aparece na barra de Padrões
  await page.getByTestId("defaults-button").click();
  await expect(page.getByTestId("feature-circuits").locator("[data-active]")).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("digitar $…$ em rascunho ativa o build math automaticamente (auto-reload)", async ({
  page,
}) => {
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type('box "$x^2$" fit');
  // Fixa a preferência math; em rascunho o app persiste e recarrega sozinho
  // (limite do wasm-bindgen: o build só troca reinicializando).
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("rpic:math.v1")), { timeout: 5_000 })
    .toBe("1");
  // Na volta, o farejador de $…$ sobe o build math e tipografa (svg aninhado
  // com glyph paths, sem texto literal) — tudo sem intervenção do usuário.
  await expect(page.locator('[data-testid="preview-stage"] svg svg path').first()).toBeVisible({
    timeout: 30_000,
  });
});

test("com o build math, $…$ vira tipografia real no preview", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("rpic:math.v1", "1");
    localStorage.setItem(
      "rpic:draft.v1",
      JSON.stringify({ source: 'box "$x^2 + y^2$" fit', circuits: false, savedAt: "" }),
    );
  });
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 30_000 });
  // fórmula tipografada = svg aninhado com glyph paths, sem texto literal
  await expect(page.locator('[data-testid="preview-stage"] svg svg path').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('[data-testid="preview-stage"]')).not.toContainText("$x^2");
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
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

test("menu de exemplos cabe na janela e rola até o último item", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.getByTestId("examples-menu").click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(600);
  // a lista é mais longa que a janela: rola por dentro
  expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const last = menu.getByRole("menuitem").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  const before = await code.textContent();
  await last.click();
  await expect(menu).toBeHidden();
  // o último exemplo carregou no editor
  await expect(code).not.toHaveText(before!);
});
