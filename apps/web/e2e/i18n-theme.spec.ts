import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
});

test("inglês é o padrão; seletor de bandeiras troca para português e persiste", async ({
  page,
}) => {
  // padrão: inglês
  await expect(page.getByRole("link", { name: "Examples" })).toBeVisible();
  await expect(page.getByTestId("locale-switcher")).toContainText("🇺🇸");

  // troca para português
  await page.getByTestId("locale-switcher").click();
  await page.getByTestId("locale-pt").click();
  await expect(page.getByRole("link", { name: "Exemplos" })).toBeVisible();
  await expect(page.getByTestId("share-button")).toContainText("Compartilhar");
  await expect(page.getByTestId("locale-switcher")).toContainText("🇧🇷");

  // persiste após recarregar
  await page.reload();
  await expect(page.getByRole("link", { name: "Exemplos" })).toBeVisible();
});

test("toggle claro/escuro aplica a classe .dark e persiste", async ({ page }) => {
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));

  const started = await isDark(); // segue prefers-color-scheme
  await page.getByTestId("theme-toggle").click();
  expect(await isDark()).toBe(!started);

  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
  expect(await isDark()).toBe(!started);

  // o papel do diagrama continua claro nos dois temas (fidelidade do desenho)
  const canvasBg = await page
    .getByTestId("preview-canvas")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(canvasBg).toBe("rgb(255, 255, 255)");
});

test("papel do diagrama é configurável (padrão, fundo) e persiste", async ({ page }) => {
  const canvas = page.getByTestId("preview-canvas");

  // padrão inicial: pontos sobre branco
  expect(await canvas.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
    "radial-gradient",
  );

  // muda para linhas
  await page.getByTestId("canvas-settings").click();
  await page.getByTestId("canvas-pattern-lines").click();
  expect(await canvas.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
    "linear-gradient",
  );

  // liso remove a grade
  await page.getByTestId("canvas-pattern-plain").click();
  expect(await canvas.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");

  // persiste após recarregar
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
  expect(await canvas.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
});

test("aparência: trocar a fonte é assado no SVG (preview e export)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });

  const rootFont = () =>
    page.locator('[data-testid="preview-stage"] > svg').getAttribute("font-family");
  expect(await rootFont()).toBe("sans-serif");

  await page.getByTestId("canvas-settings").click();
  await page.getByTestId("canvas-font-serif").click();
  await expect.poll(rootFont, { timeout: 3_000 }).toContain("Georgia");
});

test("padrões: inserir variáveis pic escreve um bloco no código", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });

  await page.getByTestId("defaults-button").click();
  // move o slider de boxwid e aplica
  const slider = page.getByTestId("defaults-boxwid");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByTestId("defaults-apply").click();

  await expect(page.locator('[data-testid="code-pane"] .cm-content')).toContainText(
    "padrões (rpic studio)",
  );
  await expect(page.locator('[data-testid="code-pane"] .cm-content')).toContainText("boxwid =");
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});
