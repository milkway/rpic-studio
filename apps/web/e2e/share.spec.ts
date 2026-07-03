import { test, expect } from "@playwright/test";

test("compartilhar por link faz roundtrip do código", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });

  // escreve um diagrama próprio
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type('circle "compartilhado!"');
  await expect(page.locator('[data-testid="preview-stage"] svg')).toContainText(
    "compartilhado!",
  );

  // abre o dialog e captura a URL
  await page.getByTestId("share-button").click();
  const url = await page.getByTestId("share-url").inputValue();
  expect(url).toContain("#pic=");

  // outra "pessoa" (aba limpa) abre o link e vê o mesmo diagrama
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('[data-testid="preview-stage"] svg')).toContainText(
    "compartilhado!",
    { timeout: 20_000 },
  );
  // o fragment é limpo após importar
  await expect
    .poll(async () => new URL(other.url()).hash, { timeout: 5_000 })
    .toBe("");
  await other.close();
});
