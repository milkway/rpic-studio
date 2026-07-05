import { test, expect } from "@playwright/test";

// Sem login (e sem backend real no CI), /usuarios deve degradar com uma
// mensagem clara — nunca quebrar ou ficar em branco. Não dá pra logar no
// e2e, então este teste cobre só o caminho anônimo.
test("rota /usuarios sem login mostra estado de login necessário", async ({ page }) => {
  await page.goto("/usuarios");
  await expect(page.getByTestId("users-signin-required")).toBeVisible();
});
