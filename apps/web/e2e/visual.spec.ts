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
  // um clone `[data-hl="sel:s1"]` é sobreposto no SVG, com contorno de acento
  const hl = page.locator('[data-testid="preview-stage"] svg [data-hl="sel:s1"]');
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

test("clique seleciona o objeto SOB o cursor, mesmo com a bbox de outro por cima", async ({ page }) => {
  // s0 = box pequeno PREENCHIDO (linha 2); s1 = box grande VAZADO centrado nele
  // (linha 3) → a bbox de s1 cobre inteiramente a de s0 e fica POR CIMA (mais tarde).
  await loadDraft(page, ".PS\nS: box wid 0.6 ht 0.6 fill 0.85\nbox wid 3 ht 2 at S\n.PE");
  await expect(page.getByTestId("objects-handle")).toHaveCount(2, { timeout: 5_000 });
  const rectOf = (id: string) =>
    page.locator(`[data-testid="preview-stage"] svg #${id}`).evaluate((el) => {
      const r = (el as SVGGraphicsElement).getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, top: r.top, left: r.left };
    });
  // clicar no CENTRO do pequeno (fill pintado) → seleciona o pequeno (linha 2),
  // não o grande cuja bbox está por cima
  const s0 = await rectOf("s0");
  await page.mouse.click(s0.cx, s0.cy);
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("objects-goto")).toContainText("2");
  // clicar na BORDA do grande (traço pintado, longe do pequeno) → seleciona o grande (linha 3)
  const s1 = await rectOf("s1");
  await page.mouse.click(s1.cx, s1.top + 1);
  await expect(page.getByTestId("objects-goto")).toContainText("3", { timeout: 5_000 });
});

test("remover hachura (∅) limpa a keyword E os parâmetros órfãos (sem pattern residual)", async ({ page }) => {
  // parâmetros de hachura SOZINHOS recriam uma hachura default → remover só a
  // keyword deixava um `<pattern>` órfão (e, com gradiente, alterava a figura).
  await loadDraft(page, '.PS\nline from (0,0) to (2,0) to (2,-2) to (0,-2) close crosshatch hatchsep 0.15 hatchcolor "seagreen" hatchwid 4\n.PE');
  await page.getByTestId("objects-handle").first().click();
  const insp = page.getByTestId("objects-inspector");
  await expect(insp).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("code-pane")).toContainText("crosshatch");
  await expect(page.locator('[data-testid="preview-stage"] svg pattern').first()).toBeAttached();
  // ∅ da HACHURA (nth(1): o ∅ do gradiente vem antes na seção FILL)
  await insp.getByText("∅", { exact: true }).nth(1).click();
  await expect(page.getByTestId("code-pane")).not.toContainText("hatch", { timeout: 5_000 });
  await expect(page.locator('[data-testid="preview-stage"] svg pattern')).toHaveCount(0);
});

test("inspetor de TEXTO mostra só o aplicável (fonte/alinhar/rotação; sem fill/hachura/opacidade)", async ({ page }) => {
  await loadDraft(page, '"Hello" at (1,-1)');
  await page.getByTestId("objects-handle").first().click();
  const insp = page.getByTestId("objects-inspector");
  await expect(insp).toBeVisible({ timeout: 5_000 });
  // aplicáveis a texto
  await expect(insp.getByTestId("objects-bold")).toBeVisible();
  await expect(insp.getByText("Rotate", { exact: true })).toBeVisible();
  await expect(insp.getByText("Align", { exact: true })).toBeVisible();
  // NÃO aplicáveis (some no rpic p/ texto; `opacity` até quebra a compilação)
  await expect(insp.getByText("Fill", { exact: true })).toHaveCount(0);
  await expect(insp.getByText("Outline", { exact: true })).toHaveCount(0);
  await expect(insp.getByText("Hatch", { exact: true })).toHaveCount(0);
  await expect(insp.getByText("Opacity", { exact: true })).toHaveCount(0);
});

test("badge do seletor mostra o rótulo pic (B:) do objeto, junto de linha e tipo", async ({ page }) => {
  await loadDraft(page, 'B: circle "x"\nbox "y"');
  await page.getByTestId("objects-handle").first().click(); // circle rotulado B (linha 1)
  await expect(page.getByTestId("objects-overlay")).toContainText("B ·", { timeout: 5_000 });
  // o box da linha 2 não tem rótulo → badge sem "· ·" espúrio
  await page.getByTestId("objects-handle").nth(1).click();
  await expect(page.getByTestId("objects-overlay")).not.toContainText("B ·");
});

test("clique PRÓXIMO a uma linha fina que cruza uma forma seleciona a linha (proximidade)", async ({ page }) => {
  // s0 = box vazado centrado em (2,0) (linha 2); s1 = linha vertical no CENTRO do
  // box, x=2 (linha 3). A linha é fina e vertical (bbox width ≈ 0): sem o fix ela
  // nem virava handle; com ele, clicar ao lado dela (interior vazio) cai na linha.
  await loadDraft(page, ".PS\nbox wid 4 ht 4 at (2,0)\nline from (2,-2) to (2,2)\n.PE");
  await expect(page.getByTestId("objects-handle")).toHaveCount(2, { timeout: 5_000 });
  const c = await page.locator('[data-testid="preview-stage"] svg #s1').evaluate((el) => {
    const r = (el as SVGGraphicsElement).getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  // clica ~4px AO LADO da linha (dentro do box vazio, fora da bbox fina da linha)
  await page.mouse.click(c.cx + 4, c.cy);
  await expect(page.getByTestId("objects-inspector")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("objects-goto")).toContainText("3"); // a linha, não o box (linha 2)
});

test("hover realça a GEOMETRIA (contorno tênue), não um retângulo — e vira seleção ao clicar", async ({ page }) => {
  await loadDraft(page, 'box "A"\ncircle "B"');
  const handleB = page.getByTestId("objects-handle").nth(1); // circle B = #s1
  await handleB.hover();
  // clone de hover sobreposto na geometria (não um outline retangular na bbox)
  const hov = page.locator('[data-testid="preview-stage"] svg [data-hl="hover:s1"]');
  await expect(hov).toHaveCount(1, { timeout: 5_000 });
  // ao clicar, o hover vira SELEÇÃO: some o clone de hover, aparece o de seleção
  await handleB.click();
  await expect(page.locator('[data-testid="preview-stage"] svg [data-hl="sel:s1"]')).toHaveCount(1, { timeout: 5_000 });
  await expect(hov).toHaveCount(0, { timeout: 5_000 });
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

test("draggable (0.10.0): arrastar a forma move o <g> real, sem virar pan do canvas", async ({ page }) => {
  await loadDraft(page, 'Field: box wid 2.5 ht 1.6\nChip: box "drag" fit at Field.c\ndraggable Chip bounds Field');
  const chip = page.locator('[data-testid="preview-stage"] svg #s1');
  const canvas = page.getByTestId("preview-canvas");
  const before = await chip.boundingBox();
  const scrollBefore = await canvas.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  expect(before).toBeTruthy();

  // O gesto cai no HANDLE do overlay (que cobre o SVG): o pointerdown é
  // reencaminhado ao <g> e o GSAP Draggable assume; os moves vão pelo document.
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width / 2 + 60, before!.y + before!.height / 2 + 30, { steps: 10 });
  await page.mouse.up();

  // O <g> se moveu de verdade (transform do Draggable)…
  await expect
    .poll(async () => {
      const after = await chip.boundingBox();
      return Math.hypot(after!.x - before!.x, after!.y - before!.y);
    })
    .toBeGreaterThan(20);
  // …e o canvas NÃO rolou junto (o pan pula alvos arrastáveis).
  const scrollAfter = await canvas.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  expect(scrollAfter).toEqual(scrollBefore);

  // O contorno de seleção (clone) SEGUE o objeto arrastado — sem "fantasma"
  // pairando na posição antiga (o rAF copia o transform do alvo pro clone).
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const g = document.querySelector('[data-testid="preview-stage"] svg #s1');
        const hl = document.querySelector('[data-hl^="sel:"]');
        if (!g || !hl) return "sem clone";
        return (g.getAttribute("transform") ?? "") === (hl.getAttribute("transform") ?? "")
          ? "ok"
          : "divergente";
      }),
    )
    .toBe("ok");
});

test("inspetor: × fecha, Esc desseleciona e minimizar vira chip mantendo a seleção", async ({ page }) => {
  await loadDraft(page, 'box "A"');
  const insp = page.getByTestId("objects-inspector");

  // × fecha (desseleciona)
  await page.getByTestId("objects-handle").first().click();
  await expect(insp).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("objects-close").click();
  await expect(insp).not.toBeVisible();

  // Esc desseleciona
  await page.getByTestId("objects-handle").first().click();
  await expect(insp).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(insp).not.toBeVisible();

  // minimizar → chip no lugar do painel, contorno de seleção segue vivo
  await page.getByTestId("objects-handle").first().click();
  await expect(insp).toBeVisible();
  await page.getByTestId("objects-minimize").click();
  await expect(insp).not.toBeVisible();
  await expect(page.getByTestId("objects-inspector-min")).toBeVisible();
  await expect(page.locator('[data-hl^="sel:"]')).toHaveCount(1); // seleção mantida
  // expandir de volta
  await page.getByTestId("objects-expand").click();
  await expect(insp).toBeVisible();
});

test("inspetor: campo LINK fica acima da dobra e escreve `link \"url\"` na linha", async ({ page }) => {
  await loadDraft(page, 'box "docs"');
  await page.getByTestId("objects-handle").first().click();
  const link = page.getByTestId("objects-link");
  await expect(link).toBeVisible({ timeout: 5_000 });
  // Acima da dobra: o painel rola, e no fim o campo ficava invisível — deve
  // estar no primeiro bloco (perto do topo do inspetor).
  const inp = await link.boundingBox();
  const insp = await page.getByTestId("objects-inspector").boundingBox();
  expect(inp!.y - insp!.y).toBeLessThan(120);
  await link.fill("https://rpic.dev");
  await link.blur();
  await expect(page.getByTestId("code-pane")).toContainText('box "docs" link "https://rpic.dev"', { timeout: 5_000 });
  await expect(page.getByTestId("compile-status")).toHaveAttribute("data-state", "ok");
  // e o preview ganha o <a> clicável
  await expect(page.locator('[data-testid="preview-stage"] svg a[href="https://rpic.dev"]')).toHaveCount(1);
});
