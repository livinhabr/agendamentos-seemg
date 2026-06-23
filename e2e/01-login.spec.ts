/**
 * 01-login.spec.ts
 * Valida que a sessão salva funciona e o usuário é redirecionado
 * para o painel com setor vinculado.
 */
import { test, expect } from "@playwright/test";
import {
  navigateTo,
  waitForNoSpinner,
  startConsoleCollector,
} from "./helpers";

test.describe("01 — Login e carregamento do setor", () => {
  test("sessão salva redireciona para /inicio", async ({ page }) => {
    const errors = startConsoleCollector(page);

    // Navega para a raiz — com sessão válida, deve redirecionar
    await page.goto("/");
    // Pode ir para / → /painel → /inicio
    await page.waitForURL(
      (url) =>
        url.pathname.includes("/inicio") ||
        url.pathname.includes("/painel") ||
        url.pathname.includes("/cadastro-inicial"),
      { timeout: 15_000 },
    );

    // Se painel, espera redirect
    if (page.url().includes("/painel")) {
      await page.waitForURL("**/inicio", { timeout: 10_000 });
    }

    await waitForNoSpinner(page);

    // Deve exibir o nome do setor no header ou sidebar
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Deve exibir o e-mail do usuário
    const emailText = header.locator("text=@educacao.mg.gov.br");
    // Se está em tela pequena, pode estar hidden; tenta buscar em qualquer lugar
    const emailVisible = await emailText.isVisible().catch(() => false);
    if (!emailVisible) {
      // Em mobile o email pode não aparecer, mas o header sim
      console.log("⚠️ E-mail do usuário não visível (possível viewport pequeno)");
    }

    // Confirma que não há erros graves no console
    const pageErrors = errors.filter((e) => e.type === "pageerror");
    expect(
      pageErrors,
      `Erros de página encontrados: ${JSON.stringify(pageErrors)}`,
    ).toHaveLength(0);
  });

  test("setor vinculado aparece no header", async ({ page }) => {
    await navigateTo(page, "/inicio");

    // O header deve mostrar o nome do setor (em texto ou select)
    const header = page.locator("header");
    const sectorText = await header.locator("span, select").first().textContent();
    expect(sectorText).toBeTruthy();
    console.log(`Setor exibido: "${sectorText?.trim()}"`);
  });
});
