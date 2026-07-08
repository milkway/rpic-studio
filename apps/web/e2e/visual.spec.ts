import { test, expect } from "@playwright/test";

// Edição visual de ESTILO sobre o render real: clicar num objeto de QUALQUER pic
// abre um inspetor que escreve o atributo (cor/hatch/traço/fonte) na LINHA de
// código daquele objeto. O código é a fonte da verdade; o visual só estiliza.

async function loadDraft(page: import("@playwright/test").Page, source: string) {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("rpic:draft.v1", JSON.stringify({ source: s, circuits: false, savedAt: "" }));
  }, source);
  await page.reload();
  await page.waitForSelector('[data-testid="objects-handle"]', { timeout: 20_000 });
}

test("clicar num objeto abre o inspetor e o fill escreve `shaded` na sua linha", async ({ page }) => {
  await loadDraft(page, 'box "A"\ncircle "B"');
  await expect(page.getByTestId("objects-handle")).toHaveCount(2, { timeout: 5_000 });
  await page.getByTestId("objects-handle").nth(1).click(); // circle "B" (linha 2)
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("objects-inspector").getByTitle("lightblue", { exact: true }).click();
  await expect(page.getByTestId("code-pane")).toContainText('circle "B" shaded "lightblue"', { timeout: 5_000 });
  await expect(page.getByTestId("code-pane")).toContainText('box "A"'); // linha 1 intacta
});

test("hatch + parâmetros (ângulo) escrevem na linha do objeto", async ({ page }) => {
  await loadDraft(page, 'box "A"');
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("objects-inspector").getByText("▧", { exact: true }).click();
  await expect(page.getByTestId("code-pane")).toContainText("hatch", { timeout: 5_000 });
  // os parâmetros só aparecem com hachura ativa; 135° só existe na hatchAngle
  // (a ROTATE tem 0/45/90/−45), evitando ambiguidade de texto no e2e
  await page.getByTestId("objects-inspector").getByText("135°", { exact: true }).click();
  await expect(page.getByTestId("code-pane")).toContainText("hatchangle 135", { timeout: 5_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});

test("gradiente: o toggle semeia o par `gradient` e o ângulo ajusta", async ({ page }) => {
  await loadDraft(page, 'box "A"');
  const insp = page.getByTestId("objects-inspector");
  await page.getByTestId("objects-handle").first().click();
  await expect(insp).toBeVisible({ timeout: 5_000 });
  // ▨ é exclusivo do toggle de gradiente (hachura usa ▧/▦); liga com par default
  await insp.getByText("▨", { exact: true }).click();
  await expect(page.getByTestId("code-pane")).toContainText('gradient "steelblue" "white"', { timeout: 5_000 });
  // revela cor-final + ângulo; 135° só existe na gradientAngle aqui (rotate é 0/45/90/−45)
  await expect(insp.getByText("Gradient to")).toBeVisible();
  await insp.getByText("135°", { exact: true }).click();
  await expect(page.getByTestId("code-pane")).toContainText("gradientangle 135", { timeout: 5_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});

test("dimensões, rotação e fonte de um box escrevem na sua linha", async ({ page }) => {
  await loadDraft(page, 'box "Hi"');
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("objects-wid").fill("1.5");
  await page.getByTestId("objects-wid").blur();
  await page.getByTestId("objects-inspector").getByText("45°", { exact: true }).click();
  await page.getByTestId("objects-bold").click();
  await expect(page.getByTestId("code-pane")).toContainText("wid 1.5", { timeout: 5_000 });
  await expect(page.getByTestId("code-pane")).toContainText("rotated 45");
  await expect(page.getByTestId("code-pane")).toContainText("bold");
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});

test("objeto de texto: negrito escreve `bold` na linha e compila", async ({ page }) => {
  await loadDraft(page, '"hello" at (1,-1)');
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-bold")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("objects-bold").click();
  await expect(page.getByTestId("code-pane")).toContainText("bold", { timeout: 5_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});

test("Google Font por objeto: escreve `font \"…\"` e aplica no SVG", async ({ page }) => {
  await loadDraft(page, '"Hello" at (1,-1)');
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-font")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("objects-font").click(); // abre o picker (nomes na própria fonte)
  await page.getByTestId("objects-font-search").fill("Pacifico");
  await page.getByTestId("objects-font-Pacifico").click();
  await expect(page.getByTestId("code-pane")).toContainText('font "Pacifico"', { timeout: 5_000 });
  // a família é aplicada no <text> do SVG e a Google Font é carregada no browser
  // (escopa ao grupo #s0 do objeto; o clone de realce não tem `id`)
  await expect(page.locator('[data-testid="preview-stage"] svg #s0 text[font-family="Pacifico"]')).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(() => page.evaluate(() => !!document.querySelector('link[data-gfont="Pacifico"]')))
    .toBe(true);
});

test("objeto de macro/loop: estiliza DENTRO do bloco (avisa que vale p/ todas)", async ({
  page,
}) => {
  // O `circle` do macro vira vários objetos na MESMA (line,col) dentro do bloco
  // `define { … }` → estilizar escreve no bloco e vale p/ TODAS as instâncias.
  await loadDraft(
    page,
    '.PS\ndefine node { circle rad 0.18 $1 }\nnode("A")\nfor i = 1 to 4 do { arrow wid 0.4; node(sprintf("%g", i)) }\n.PE',
  );
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  // mostra o AVISO de que afeta todas + os controles de estilo (FILL presente)
  await expect(page.getByTestId("objects-affects-all")).toBeVisible();
  await expect(page.getByTestId("objects-inspector").getByText("FILL")).toBeVisible();
  // aplicar hatch entra no bloco do define (antes do `}`) e segue compilando
  await page.getByTestId("objects-inspector").getByText("▧", { exact: true }).click();
  await expect(page.getByTestId("code-pane")).toContainText("circle rad 0.18 $1 hatch}", { timeout: 5_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});

test("clicar no vazio deseleciona (fecha o inspetor)", async ({ page }) => {
  await loadDraft(page, 'box "A"');
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  // canto vazio (o objeto fica centralizado)
  await page.getByTestId("objects-deselect").click({ position: { x: 16, y: 16 } });
  await expect(page.getByTestId("objects-inspector")).toHaveCount(0, { timeout: 5_000 });
});

test("duplo-clique num objeto pula o cursor pra sua linha de código", async ({ page }) => {
  await loadDraft(page, 'box "A"\ncircle "B"\nellipse "C"');
  await expect(page.getByTestId("objects-handle")).toHaveCount(3, { timeout: 5_000 });
  await page.getByTestId("objects-handle").nth(2).dblclick(); // ellipse "C" (linha 3)
  await expect
    .poll(() => page.evaluate(() => document.querySelector(".cm-activeLineGutter")?.textContent))
    .toBe("3");
});

test("selecionar realça a GEOMETRIA real (clone de contorno de acento), não um retângulo", async ({ page }) => {
  await loadDraft(page, 'box "A"\ncircle "B"');
  await page.getByTestId("objects-handle").nth(1).click(); // circle B = #s1
  // um clone `[data-obj-highlight="s1"]` é sobreposto no SVG, com contorno de acento
  const hl = page.locator('[data-testid="preview-stage"] svg [data-obj-highlight="s1"]');
  await expect(hl).toHaveCount(1, { timeout: 5_000 });
  // o contorno segue a geometria: traço non-scaling na cor de acento, sem preenchimento
  const style = await hl.locator("circle,path,ellipse,rect").first().evaluate((el) => {
    const s = (el as SVGElement).style;
    return { stroke: s.stroke, fill: s.fill, ve: s.getPropertyValue("vector-effect") };
  });
  expect(style.fill).toBe("none");
  expect(style.ve).toBe("non-scaling-stroke");
  expect(style.stroke).not.toBe("");
  // deselecionar remove o realce
  await page.getByTestId("objects-deselect").click({ position: { x: 16, y: 16 } });
  await expect(hl).toHaveCount(0, { timeout: 5_000 });
});

test("com o canvas rolado, o handle continua alinhado ao objeto (sem deslocamento)", async ({ page }) => {
  // Diagrama ALTO o suficiente p/ estourar o canvas e gerar scroll vertical.
  const tall = "down\n" + ["A", "B", "C", "D", "E", "F"].map((l) => `box "${l}" ht 2`).join("\n");
  await loadDraft(page, tall);
  await expect(page.getByTestId("objects-handle")).toHaveCount(6, { timeout: 5_000 });

  // Rola o canvas até o fim (é onde o bug aparecia: o handle subia `scrollTop` px).
  await page.getByTestId("preview-canvas").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  // Deixa o loop rAF reassentar as caixas na nova posição de scroll.
  await page.waitForTimeout(250);

  // O handle do último objeto (F = #s5, embaixo) deve COINCIDIR com o elemento
  // SVG real — mesma posição de viewport, dentro de ~2px.
  const svgBox = await page.locator('[data-testid="preview-stage"] svg #s5').boundingBox();
  const handleBox = await page.getByTestId("objects-handle").nth(5).boundingBox();
  expect(svgBox).toBeTruthy();
  expect(handleBox).toBeTruthy();
  expect(Math.abs(handleBox!.y - svgBox!.y)).toBeLessThan(2);
  expect(Math.abs(handleBox!.x - svgBox!.x)).toBeLessThan(2);
});
