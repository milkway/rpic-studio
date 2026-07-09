import { test, expect } from "@playwright/test";

// Preview: coordenadas pic no rodapé (com cópia), pan por arrasto e o scrubber
// de `animate scroll`. Tudo sobre o render REAL (WASM no browser).

async function loadDraft(page: import("@playwright/test").Page, source: string) {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("rpic:draft.v1", JSON.stringify({ source: s, circuits: false, savedAt: "" }));
  }, source);
  await page.reload();
  await page.waitForSelector('[data-testid="preview-stage"] svg', { timeout: 20_000 });
}

test("rodapé mostra as coordenadas pic do cursor e o clique copia", async ({ page }) => {
  await loadDraft(page, 'box "A"');
  // paira no CENTRO do primeiro objeto: `box` desenhado da origem p/ a direita
  // tem centro pic em (0.375, 0) — as coordenadas têm que bater com isso
  const handle = page.getByTestId("objects-handle").first();
  const bb = (await handle.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const coords = page.getByTestId("pic-coords");
  await expect(coords).toBeVisible({ timeout: 5_000 });
  const m = /\((-?[\d.]+), (-?[\d.]+)\)/.exec((await coords.textContent()) ?? "");
  expect(m, "formato (x, y)").not.toBeNull();
  expect(Math.abs(Number(m![1]) - 0.375)).toBeLessThan(0.05);
  expect(Math.abs(Number(m![2]))).toBeLessThan(0.05);
  await coords.click();
  await expect(page.getByText("Coordinates copied")).toBeVisible({ timeout: 5_000 });

  // com ZOOM alto as coordenadas têm que continuar batendo (regressão: o
  // getScreenCTM ignorava o scale() CSS e desviava por um fator ~zoom)
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 5; i++) await zoomIn.click(); // ≈ 305%
  const bb2 = (await handle.boundingBox())!;
  await page.mouse.move(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2);
  await expect(coords).toBeVisible({ timeout: 5_000 });
  const m2 = /\((-?[\d.]+), (-?[\d.]+)\)/.exec((await coords.textContent()) ?? "");
  expect(Math.abs(Number(m2![1]) - 0.375)).toBeLessThan(0.05);
  expect(Math.abs(Number(m2![2]))).toBeLessThan(0.05);
});

test("arrastar o canvas faz PAN (e não perde a seleção)", async ({ page }) => {
  await loadDraft(page, 'box "A"; arrow; box "B"; arrow; box "C"');
  // seleciona um objeto — o pan não pode deselecionar
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  // amplia até o diagrama transbordar o canvas
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 7; i++) await zoomIn.click();
  const canvas = page.getByTestId("preview-canvas");
  const cb = (await canvas.boundingBox())!;
  const before = await canvas.evaluate((el) => el.scrollLeft);
  // arrasta a partir de área vazia (canto), puxando p/ a esquerda
  await page.mouse.move(cb.x + cb.width - 30, cb.y + 30);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width - 180, cb.y + 30, { steps: 8 });
  await page.mouse.up();
  const after = await canvas.evaluate((el) => el.scrollLeft);
  expect(after).toBeGreaterThan(before);
  // seleção sobreviveu ao pan (arrasto ≠ clique de deselecionar)
  await expect(page.getByTestId("objects-inspector")).toBeVisible();
});

test("zoom alto: o diagrama vira área de rolagem real e navega nas 4 direções", async ({ page }) => {
  await loadDraft(page, 'box "A"; arrow; box "B"; arrow; box "C"\narrow down 2 from 2nd box.s; box "D"');
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 7; i++) await zoomIn.click();
  const canvas = page.getByTestId("preview-canvas");
  // o zoom dimensiona o LAYOUT (não só o transform): tem que haver overflow…
  const m = await canvas.evaluate((el) => ({
    sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight,
    sl: el.scrollLeft, st: el.scrollTop,
  }));
  expect(m.sw).toBeGreaterThan(m.cw);
  expect(m.sh).toBeGreaterThan(m.ch);
  // …e o conteúdo RECENTRADO (esquerda/topo alcançáveis, não clipados)
  expect(m.sl).toBeGreaterThan(0);
  expect(m.st).toBeGreaterThan(0);
  // arrastar p/ BAIXO-DIREITA revela o canto superior-esquerdo
  const cb = (await canvas.boundingBox())!;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 120, cb.y + cb.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  const after = await canvas.evaluate((el) => ({ sl: el.scrollLeft, st: el.scrollTop }));
  expect(after.sl).toBeLessThan(m.sl);
  expect(after.st).toBeLessThan(m.st);
});

test("`animate scroll` troca o replay por um scrubber que avança a timeline", async ({ page }) => {
  await loadDraft(
    page,
    'box "a"; arrow; box "b"\nanimate 1st arrow with "draw" for 1\nanimate scroll',
  );
  const scrub = page.getByTestId("scroll-scrub");
  await expect(scrub).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("replay-button")).toHaveCount(0);
  // avançar o slider não pode quebrar nada (timeline pausada respondendo ao scrub)
  await scrub.fill("0.8");
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});

test("inspetor: opção `thin` escreve a keyword na linha do objeto", async ({ page }) => {
  await loadDraft(page, 'box "A"');
  await page.getByTestId("objects-handle").first().click();
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("objects-thin").click();
  await expect(page.getByTestId("code-pane")).toContainText('box "A" thin', { timeout: 5_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
});
