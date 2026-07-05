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

test("cor livre (hex) e rotação de rótulo (v0.7.0)", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-inspector")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("visual-label-input").fill("giro");
  // cor hex custom (setter nativo p/ o React captar)
  await page.locator('[data-testid="visual-inspector"] input[type="color"]').first().evaluate((el: HTMLInputElement, val: string) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    s.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, "#ff33cc");
  await page.locator('[data-testid="visual-inspector"] button:has-text("90°")').click();
  await expect(page.getByTestId("code-pane")).toContainText('shaded "#ff33cc"', { timeout: 5_000 });
  await expect(page.getByTestId("code-pane")).toContainText("rotated 90");
  await expect
    .poll(() => page.evaluate(() => /rotate\(/.test(document.querySelector('[data-testid="preview-stage"] svg')?.innerHTML || "")))
    .toBe(true);
});

test("fonte por objeto: bold/italic/família/tamanho no código e no SVG", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-inspector")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("visual-label-input").fill("Serifada");
  await page.getByTestId("visual-bold").click();
  await page.getByTestId("visual-italic").click();
  await page.getByTestId("visual-font-family").selectOption("Georgia");
  await page.getByTestId("visual-fontsize").selectOption("14");
  await expect(page.getByTestId("code-pane")).toContainText('bold italic font "Georgia" fontsize 14', { timeout: 5_000 });
  // o WASM 0.7.0 emite os atributos no <text>
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = document.querySelector('[data-testid="preview-stage"] svg')?.innerHTML || "";
        return s.includes('font-weight="bold"') && s.includes('font-style="italic"');
      }),
    )
    .toBe(true);
});

test("texto: rótulo multilinha, objeto solto e toggle math", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-inspector")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("visual-label-input").fill("Passo 1\nPasso 2");
  await expect(page.getByTestId("code-pane")).toContainText('"Passo 1" "Passo 2"', { timeout: 5_000 });

  // texto solto (sem forma)
  await page.getByTestId("visual-add-text").click();
  await page.getByTestId("visual-label-input").fill("E=mc^2");
  await expect(page.getByTestId("code-pane")).toContainText('"E=mc^2" at', { timeout: 5_000 });
  // math wrap
  await page.getByTestId("visual-math-toggle").check();
  await expect(page.getByTestId("code-pane")).toContainText('"$E=mc^2$"', { timeout: 5_000 });
});

test("estilos por objeto: hatch/dashed no nó, pontas na seta", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-inspector")).toBeVisible({ timeout: 5_000 });
  // nó: crosshatch + dashed
  await page.locator('[data-testid="visual-inspector"] button:has-text("▦")').click();
  await page.locator('[data-testid="visual-inspector"] button:has-text("╌╌")').click();
  await expect(page.getByTestId("code-pane")).toContainText("crosshatch", { timeout: 5_000 });
  await expect(page.getByTestId("code-pane")).toContainText("dashed");

  // conector livre com pontas nos dois lados
  await page.getByTestId("visual-add-circle").click();
  await page.waitForTimeout(300);
  await page.getByTestId("visual-tool-arrow").click();
  const cv = (await page.getByTestId("preview-canvas").boundingBox())!;
  await page.mouse.move(cv.x + cv.width * 0.4, cv.y + cv.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(cv.x + cv.width * 0.7, cv.y + cv.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("visual-inspector")).toBeVisible();
  await page.locator('[data-testid="visual-inspector"] button:has-text("↔")').click();
  await expect(page.getByTestId("code-pane")).toContainText("line <-> from", { timeout: 5_000 });
});

test("desenhar linha livre ponto-a-ponto (sem forçar âncora)", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-handle")).toHaveCount(1, { timeout: 5_000 });
  await page.waitForTimeout(400);
  await page.getByTestId("visual-tool-line").click();
  await expect(page.getByTestId("visual-draw-layer")).toBeVisible();
  const cv = (await page.getByTestId("preview-canvas").boundingBox())!;
  await page.mouse.move(cv.x + cv.width * 0.4, cv.y + cv.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(cv.x + cv.width * 0.7, cv.y + cv.height * 0.75, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("code-pane")).toContainText(/line from \([-\d.]+,[-\d.]+\) to \(/, {
    timeout: 5_000,
  });
  await expect(page.getByTestId("visual-line-hit")).toHaveCount(1);
  // volta para a ferramenta de seleção após desenhar
  await expect(page.getByTestId("visual-draw-layer")).toHaveCount(0);
});

test("mover um objeto NÃO desloca os outros (página fixa)", async ({ page }) => {
  await page.getByTestId("visual-add-box").click();
  await page.getByTestId("visual-add-box").click();
  await expect(page.getByTestId("visual-handle")).toHaveCount(2, { timeout: 5_000 });
  await page.waitForTimeout(500);
  const posA = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="preview-stage"] #s0') as SVGGraphicsElement;
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), t: Math.round(r.top) };
    });
  const before = await posA();
  const b = (await page.getByTestId("visual-handle").nth(1).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 250, b.y + 260, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await posA();
  expect(Math.abs(after.l - before.l)).toBeLessThan(4);
  expect(Math.abs(after.t - before.t)).toBeLessThan(4);
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
