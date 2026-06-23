/**
 * 02-inicio.spec.ts
 * Valida a tela Início: cards de contagem, setor e bot atuais,
 * e próximos passos.
 */
import { test, expect } from "@playwright/test";
import { navigateTo, startConsoleCollector } from "./helpers";

test.describe("02 — Tela Início", () => {
  test("carrega sem erro e exibe cards", async ({ page }) => {
    const errors = startConsoleCollector(page);

    await navigateTo(page, "/inicio");

    // Título da página
    await expect(page.locator("h1")).toContainText("Bem-vindo");

    // Cards de contagem
    const cards = page.locator("a.rounded-lg.border");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(4);
    console.log(`Cards encontrados: ${count}`);

    // Setor atual (Section)
    await expect(
      page.locator("section").filter({ hasText: "Setor atual" }),
    ).toBeVisible();

    // Bot principal (Section)
    await expect(
      page.locator("section").filter({ hasText: "Bot principal" }),
    ).toBeVisible();

    // Próximos passos
    await expect(
      page.locator("section").filter({ hasText: "Próximos passos" }),
    ).toBeVisible();

    // Sem erros de página
    const pageErrors = errors.filter((e) => e.type === "pageerror");
    expect(
      pageErrors,
      `Erros: ${JSON.stringify(pageErrors)}`,
    ).toHaveLength(0);
  });
});
