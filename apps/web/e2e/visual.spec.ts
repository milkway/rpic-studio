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
  // os parâmetros só aparecem com hachura ativa
  await page.getByTestId("objects-inspector").getByText("90°", { exact: true }).click();
  await expect(page.getByTestId("code-pane")).toContainText("hatchangle 90", { timeout: 5_000 });
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
