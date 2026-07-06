import { test, expect } from "@playwright/test";

// Autocomplete do rpic: primitivas/atributos/cores + nomes de objetos já
// definidos (p/ referências `from Nome`).
test("code completion sugere primitivas e objetos definidos", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
  const code = page.locator('[data-testid="code-pane"] .cm-content');
  await code.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await page.keyboard.type(".PS\nA: box\n");

  await page.keyboard.type("circ");
  await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible({ timeout: 3_000 });
  await expect(page.locator(".cm-tooltip-autocomplete .cm-completionLabel").filter({ hasText: /^circle$/ })).toBeVisible();

  // referência a objeto já rotulado
  await page.keyboard.press("Escape");
  await page.keyboard.type(" from A");
  await expect(page.locator(".cm-tooltip-autocomplete .cm-completionLabel").filter({ hasText: /^A$/ })).toBeVisible({ timeout: 3_000 });
});
