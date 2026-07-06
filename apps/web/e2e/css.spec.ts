import { test, expect } from "@playwright/test";

// CSS custom por diagrama: o `class "…"` do rpic vira estilo real. O CSS mora no
// próprio pic (bloco de comentário) e o studio injeta um <style> no SVG.
test("painel de CSS custom estiliza elementos com `class` no preview", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "rpic:draft.v1",
      JSON.stringify({ source: '.PS\nbox class "critical" "pay"\n.PE', circuits: false, savedAt: "" }),
    );
  });
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });

  await page.getByTestId("css-panel-trigger").click();
  await page.getByTestId("css-textarea").fill(".critical { stroke: rgb(221, 51, 51); stroke-width: 3 }");

  // o <style> é injetado e o elemento com class="critical" fica vermelho
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="preview-stage"] svg [class~="critical"]');
        return el ? getComputedStyle(el).stroke : "";
      }),
    )
    .toBe("rgb(221, 51, 51)");
  // e o CSS foi guardado no código (viaja com o diagrama)
  await expect(page.getByTestId("code-pane")).toContainText("css (rpic studio)");
});
